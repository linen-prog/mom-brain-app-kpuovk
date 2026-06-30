import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors, CategoryColors } from '@/constants/Colors';
import { organizeText, OrganizeError, OrganizeResponse } from '@/utils/api';
import {
  getLatestDump,
  saveLatestDump,
  OrganizedDump,
  getKids,
  getPartnerName,
  KidProfile,
  TaskMeta,
  TrackingItem,
  getOnboardingDone,
  setOnboardingDone,
} from '@/utils/storage';
import { MomCheckInCard } from '@/components/MomCheckInCard';
import { CategorySection } from '@/components/CategorySection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { requestMicPermission, transcribeAudio, VoiceError } from '@/utils/voice';
import { IconSymbol } from '@/components/IconSymbol';

const FALLBACK_CHECK_IN = "I caught it all. Pick one small thing — that's enough.";

// ─── Voice UI state ───────────────────────────────────────────────────────────
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'permission_needed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeResponse(r: OrganizeResponse): OrganizeResponse {
  const arr = (v: unknown) =>
    Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === 'string' && (x as string).trim().length > 0) as string[] : [];
  return {
    doToday: arr(r?.doToday),
    thisWeek: arr(r?.thisWeek),
    kids: arr(r?.kids),
    home: arr(r?.home),
    errands: arr(r?.errands),
    meals: arr(r?.meals),
    messages: arr(r?.messages),
    holdingForLater: arr(r?.holdingForLater),
    momCheckIn:
      typeof r?.momCheckIn === 'string' && r.momCheckIn.trim().length > 0
        ? r.momCheckIn.trim()
        : FALLBACK_CHECK_IN,
    taskMeta: Array.isArray(r?.taskMeta) ? r.taskMeta : undefined,
    trackingItems: Array.isArray(r?.trackingItems) ? r.trackingItems : undefined,
    rhythmInsights: r?.rhythmInsights,
  };
}

function getRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function countAllItems(dump: OrganizedDump): number {
  return (
    dump.doToday.length +
    dump.thisWeek.length +
    dump.kids.length +
    dump.home.length +
    dump.errands.length +
    dump.meals.length +
    dump.messages.length +
    dump.holdingForLater.length
  );
}

function formatDueDate(dueDate: string): string {
  try {
    const d = new Date(dueDate);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dueDate;
  }
}

// ─── Waveform bar component ───────────────────────────────────────────────────
function WaveformBars({ barAnims }: { barAnims: Animated.Value[] }) {
  return (
    <View style={styles.waveformContainer}>
      {barAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveformBar,
            {
              transform: [{ scaleY: anim }],
              opacity: anim.interpolate({ inputRange: [0.3, 1], outputRange: [0.5, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrganizedDump | null>(null);
  const [lastOrganized, setLastOrganized] = useState<string | null>(null);

  // Kids / partner context
  const [kids, setKids] = useState<KidProfile[]>([]);
  const [partnerName, setPartnerName] = useState<string | null>(null);

  // Partner tasks modal
  const [partnerModalVisible, setPartnerModalVisible] = useState(false);

  // Onboarding modal
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // expo-audio hook — must be called at top level
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Animations
  const resultsOpacity = useRef(new Animated.Value(0)).current;
  const helperOpacity = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Waveform bar animations (5 bars for transcribing state)
  const barAnims = useRef<Animated.Value[]>(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;
  const barLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Load saved dump + kids + partner + onboarding check ─────────────────
  useEffect(() => {
    getLatestDump().then((dump) => {
      if (dump) {
        setLastOrganized(dump.createdAt);
        setResult(dump);
        resultsOpacity.setValue(1);
      }
    });
    getKids().then(setKids);
    getPartnerName().then(setPartnerName);
    getOnboardingDone().then((done) => {
      if (!done) {
        console.log('[Dump] First launch — showing onboarding modal');
        setOnboardingVisible(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helper fade ──────────────────────────────────────────────────────────
  const hasText = text.length > 0;
  useEffect(() => {
    Animated.timing(helperOpacity, {
      toValue: hasText ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [hasText, helperOpacity]);

  // ── Pulse animation for recording state ─────────────────────────────────
  useEffect(() => {
    if (voiceState === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.85, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => { pulseLoopRef.current?.stop(); };
  }, [voiceState, pulseAnim]);

  // ── Waveform animation for transcribing state ────────────────────────────
  useEffect(() => {
    if (voiceState === 'transcribing') {
      barAnims.forEach((anim) => anim.setValue(0.3));
      const animations = barAnims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 110),
            Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          ])
        )
      );
      const parallel = Animated.parallel(animations);
      barLoopRef.current = parallel;
      parallel.start();
    } else {
      barLoopRef.current?.stop();
      barAnims.forEach((anim) => anim.setValue(0.3));
    }
    return () => { barLoopRef.current?.stop(); };
  }, [voiceState, barAnims]);

  // ── Cleanup success timer on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // ── Show success caption briefly ────────────────────────────────────────
  const showSuccessCaption = useCallback(() => {
    successOpacity.setValue(1);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      Animated.timing(successOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    }, 4000);
  }, [successOpacity]);

  // ── Organize handler ─────────────────────────────────────────────────────
  const handleOrganize = useCallback(async () => {
    if (!text.trim()) return;
    console.log('[Dump] "Organize My Brain" pressed — text length:', text.trim().length, '| kids:', kids.length, '| partner:', partnerName ?? 'none');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    resultsOpacity.setValue(0);

    try {
      const raw = await organizeText(text.trim(), {
        kids: kids.length > 0 ? kids : undefined,
        partnerName: partnerName ?? undefined,
      });
      const normalized = normalizeResponse(raw);

      const allEmpty =
        normalized.doToday.length === 0 &&
        normalized.thisWeek.length === 0 &&
        normalized.kids.length === 0 &&
        normalized.home.length === 0 &&
        normalized.errands.length === 0 &&
        normalized.meals.length === 0 &&
        normalized.messages.length === 0 &&
        normalized.holdingForLater.length === 0 &&
        normalized.momCheckIn === FALLBACK_CHECK_IN;

      if (allEmpty) {
        console.log('[Dump] normalize: AI returned nothing useful, skipping save');
        setError("I had trouble sorting that one. Try saying a bit more, or try again in a moment.");
        setLoading(false);
        return;
      }

      const dump: OrganizedDump = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        originalText: text.trim(),
        work: [],
        ...normalized,
        completed: {},
        taskMeta: normalized.taskMeta,
        trackingItems: normalized.trackingItems,
        rhythmInsights: normalized.rhythmInsights,
      };
      await saveLatestDump(dump);
      setResult(dump);
      setLastOrganized(dump.createdAt);
      setText('');

      Animated.timing(helperOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      Animated.timing(resultsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();

      setTimeout(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, 300);
    } catch (err: unknown) {
      console.error('[Dump] organize error:', err);
      if (err instanceof OrganizeError) {
        if (err.kind === 'rate_limited') {
          setError("Mom Brain needs a minute to catch up. Try again shortly.");
        } else if (err.kind === 'network') {
          setError("I couldn't reach the cloud. Check your connection and try again.");
        } else {
          setError("Something got tangled on my end. Give it another try in a moment.");
        }
      } else {
        setError("Something got tangled on my end. Give it another try in a moment.");
      }
    } finally {
      setLoading(false);
    }
  }, [text, kids, partnerName, resultsOpacity, helperOpacity]);

  // ── Voice: tap mic button ────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    console.log('[Voice] Mic button pressed — current voiceState:', voiceState);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (voiceState === 'recording') {
      console.log('[Voice] Stopping recording…');
      setVoiceState('transcribing');
      setVoiceError(null);
      try {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        const durationSec = recorderState.durationMillis
          ? recorderState.durationMillis / 1000
          : audioRecorder.currentTime;
        console.log('[Voice] Recording stopped — uri:', uri, '| duration (s):', durationSec);

        if (!uri) {
          throw new VoiceError('recording_failed', 'Something got tangled while listening. Try again.');
        }

        const transcript = await transcribeAudio(uri);
        setText((prev) => {
          const next = prev.trim() ? prev.trim() + ' ' + transcript : transcript;
          console.log('[Voice] Text updated — new length:', next.length);
          return next;
        });
        setVoiceState('idle');
        showSuccessCaption();
        setTimeout(() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); }, 200);
      } catch (err: unknown) {
        console.error('[Voice] Error during stop/transcribe:', err);
        if (err instanceof VoiceError) {
          setVoiceError(err.userMessage);
        } else {
          setVoiceError('Something got tangled while listening. Try again.');
        }
        setVoiceState('idle');
      }
      return;
    }

    if (voiceState === 'transcribing') return;

    const granted = await requestMicPermission();
    if (!granted) {
      console.warn('[Voice] Microphone permission denied');
      setVoiceState('permission_needed');
      setVoiceError(null);
      return;
    }

    try {
      console.log('[Voice] Starting recording…');
      setVoiceError(null);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceState('recording');
      console.log('[Voice] Recording started');
    } catch (err: unknown) {
      console.error('[Voice] Failed to start recording:', err);
      setVoiceError('Something got tangled while listening. Try again.');
      setVoiceState('idle');
    }
  }, [voiceState, audioRecorder, recorderState.durationMillis, showSuccessCaption]);

  const handleStopPress = useCallback(() => {
    console.log('[Voice] Stop button pressed');
    handleMicPress();
  }, [handleMicPress]);

  const handleOpenSettings = useCallback(() => {
    console.log('[Voice] Opening device Settings for microphone permission');
    Linking.openSettings();
  }, []);

  // ── Partner tasks modal ──────────────────────────────────────────────────
  const partnerTasks: TaskMeta[] = result?.taskMeta?.filter((m) => m.isPartnerTask) ?? [];
  const hasPartnerTasks = partnerTasks.length > 0;

  const handleOpenPartnerModal = useCallback(() => {
    console.log('[Dump] "Things on someone else\'s plate" pressed — tasks:', partnerTasks.length);
    setPartnerModalVisible(true);
  }, [partnerTasks.length]);

  const handleDraftEmailFromPartner = useCallback((task: TaskMeta) => {
    console.log('[Dump] Draft email pressed for partner task:', task.taskText);
    setPartnerModalVisible(false);
    router.push({
      pathname: '/email-draft',
      params: {
        taskText: task.taskText,
        childName: task.childName ?? '',
        category: task.category,
      },
    });
  }, [router]);

  // ── Derived display values ───────────────────────────────────────────────
  const isDisabled = !text.trim() || loading;
  const relativeTime = lastOrganized ? getRelativeTime(lastOrganized) : null;
  const showHint = relativeTime !== null && !(result !== null && text.length === 0);
  const showHelper =
    lastOrganized === null &&
    text.length === 0 &&
    result === null &&
    voiceState === 'idle';

  const hintText = (() => {
    if (!relativeTime || !result) return null;
    const n = countAllItems(result);
    if (n === 0) return `Last organized: ${relativeTime}`;
    return `I'm holding ${n} thing${n === 1 ? '' : 's'} for you from ${relativeTime}.`;
  })();

  const isRecording = voiceState === 'recording';
  const isTranscribing = voiceState === 'transcribing';
  const isPermissionNeeded = voiceState === 'permission_needed';

  const micAccessibilityLabel =
    voiceState === 'transcribing' ? 'Transcribing' :
    voiceState === 'recording' ? 'Stop recording' :
    'Start voice dump';

  const voiceCardCopy = (() => {
    if (voiceState === 'recording') return 'Listening… say it messy.';
    if (voiceState === 'transcribing') return 'Got it. Turning your words into something you can see.';
    if (voiceState === 'permission_needed')
      return 'I need microphone permission before I can listen. Tap the mic again to try, or open Settings.';
    return null;
  })();

  const micButtonInner = (() => {
    if (isTranscribing) return <WaveformBars barAnims={barAnims} />;
    if (isPermissionNeeded) return <IconSymbol name="mic.slash.fill" size={28} color="#FFFFFF" />;
    return <View style={styles.playTriangle} />;
  })();

  const micButtonNode = (() => {
    const button = (
      <TouchableOpacity
        onPress={handleMicPress}
        disabled={isTranscribing}
        activeOpacity={0.85}
        accessibilityLabel={micAccessibilityLabel}
      >
        <View style={styles.micButton}>{micButtonInner}</View>
      </TouchableOpacity>
    );

    if (isRecording) {
      return (
        <Animated.View style={{ opacity: pulseAnim }}>
          <View style={styles.micRingOuter}>
            <View style={styles.micRingMid}>{button}</View>
          </View>
        </Animated.View>
      );
    }

    return <Animated.View style={{ opacity: pulseAnim }}>{button}</Animated.View>;
  })();

  const trackingItems: TrackingItem[] = result?.trackingItems ?? [];

  const delegationLabel = (delegation: string) => {
    if (delegation === 'partner') return 'Partner';
    if (delegation === 'coparent') return 'Co-parent';
    if (delegation === 'kid') return 'Kid';
    return delegation;
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.appName}>Mom Brain</Text>
          <Text style={styles.appNameHeart}>{'♡'}</Text>
        </View>
        <Text style={styles.tagline}>Say it messy. I'll sort it out.</Text>

        {/* Input card */}
        <View style={styles.inputCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.sparkleIcon}>✦</Text>
            <Text style={styles.cardHeading}>Get it out of your head.</Text>
          </View>

          <Animated.Text style={[styles.helperSubtext, { opacity: helperOpacity }]}>
            {'Say everything—the big stuff, the small stuff, the thing you keep forgetting. It\'s all welcome here.'}
          </Animated.Text>

          <TextInput
            style={styles.textInput}
            multiline
            placeholder=""
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
            editable={!loading && voiceState !== 'transcribing'}
          />

          <View style={styles.divider} />

          <View style={styles.voiceRow}>
            <View style={styles.voiceRowLeft}>
              <IconSymbol name="mic.fill" size={16} color={Colors.primaryDeepRose} />
              <View>
                <Text style={styles.voiceLabel}>Talk it out</Text>
                <Text style={styles.voiceSubLabel}>Tap to voice your thoughts</Text>
              </View>
            </View>
            {micButtonNode}
          </View>
        </View>

        {/* Voice status card */}
        {voiceCardCopy !== null && (
          <View style={[styles.voiceCard, voiceState === 'permission_needed' && styles.voiceCardPermission]}>
            <View style={styles.voiceCardRow}>
              {isTranscribing && (
                <ActivityIndicator size="small" color={Colors.primaryDeepRose} style={styles.voiceSpinner} />
              )}
              <Text style={styles.voiceCardText}>{voiceCardCopy}</Text>
            </View>
            {voiceState === 'recording' && (
              <PrimaryButton label="Stop" onPress={handleStopPress} style={styles.stopButton} />
            )}
            {voiceState === 'permission_needed' && (
              <TouchableOpacity style={styles.settingsButton} onPress={handleOpenSettings} activeOpacity={0.8}>
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Voice error card */}
        {voiceError !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{voiceError}</Text>
          </View>
        )}

        {/* Success caption */}
        <Animated.Text style={[styles.successCaption, { opacity: successOpacity }]}>
          I caught your words. You can edit before organizing.
        </Animated.Text>

        {/* First-time helper card */}
        {showHelper && (
          <View style={styles.helperCard}>
            <View style={styles.helperCardInner}>
              <View style={styles.helperCardLeft}>
                <View style={styles.helperLabelRow}>
                  <Text style={styles.helperSparkle}>✦</Text>
                  <Text style={styles.helperLabel}>FOR EXAMPLE</Text>
                </View>
                <Text style={styles.helperText}>
                  Try something like: I need to sign Mina's school form, order groceries, text the babysitter, and I think I'm forgetting something for Monday...
                </Text>
              </View>
              <IconSymbol name="square.and.pencil" size={28} color={Colors.primaryDeepRose + '60'} />
            </View>
          </View>
        )}

        {/* Last organized hint */}
        {showHint && hintText && (
          <Text style={styles.lastOrganized}>{hintText}</Text>
        )}

        {/* Organize button */}
        <PrimaryButton
          label="Organize My Brain  ✦"
          loadingLabel="Sorting the mental load…"
          onPress={handleOrganize}
          loading={loading}
          disabled={isDisabled}
          style={styles.button}
        />

        {/* Reassurance row */}
        <View style={styles.reassuranceRow}>
          <Text style={styles.reassuranceHeart}>{'♡'}</Text>
          <Text style={styles.reassuranceText}>Nothing's too small. You've got this.</Text>
        </View>

        {/* Organize error message */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Results */}
        {result && (
          <Animated.View style={[styles.results, { opacity: resultsOpacity }]}>
            <Text style={styles.resultsHeading}>I caught it. Here's what you were holding.</Text>
            <Text style={styles.resultsSubtitle}>You don't have to hold this all in your head.</Text>
            <Text style={styles.resultsSubtitleMuted}>Take a breath. It's all here now.</Text>

            {result.momCheckIn ? <MomCheckInCard message={result.momCheckIn} /> : null}

            {result.doToday.length > 0 && (
              <CategorySection
                title="Do Today"
                items={result.doToday}
                accentColor={CategoryColors.doToday}
                taskMeta={result.taskMeta}
              />
            )}

            {result.thisWeek.length > 0 && (
              <CategorySection
                title="This Week"
                items={result.thisWeek}
                accentColor={CategoryColors.thisWeek}
                taskMeta={result.taskMeta}
              />
            )}

            {result.kids.length > 0 && (
              <CategorySection
                title="Kids"
                items={result.kids}
                accentColor={CategoryColors.kids}
                taskMeta={result.taskMeta}
              />
            )}

            {result.home.length > 0 && (
              <CategorySection
                title="Home"
                items={result.home}
                accentColor={CategoryColors.home}
                taskMeta={result.taskMeta}
              />
            )}

            {result.errands.length > 0 && (
              <CategorySection
                title="Errands / Groceries"
                items={result.errands}
                accentColor={CategoryColors.errands}
                taskMeta={result.taskMeta}
              />
            )}

            {result.meals.length > 0 && (
              <CategorySection
                title="Meals"
                items={result.meals}
                accentColor={CategoryColors.meals}
                taskMeta={result.taskMeta}
              />
            )}

            {result.messages.length > 0 && (
              <CategorySection
                title="Messages"
                items={result.messages}
                accentColor={CategoryColors.messages}
                taskMeta={result.taskMeta}
              />
            )}

            {result.holdingForLater.length > 0 && (
              <View>
                <Text style={styles.holdingIntro}>These can wait. They're safe here.</Text>
                <Text style={styles.holdingIntroMuted}>Parking something is not giving up on it.</Text>
                <CategorySection
                  title="Holding for Later"
                  items={result.holdingForLater}
                  accentColor={CategoryColors.holdingForLater}
                  variant="parked"
                  taskMeta={result.taskMeta}
                />
              </View>
            )}

            {/* Things You're Tracking */}
            {trackingItems.length > 0 && (
              <View style={styles.trackingCard}>
                <View style={styles.trackingHeader}>
                  <Text style={styles.trackingIcon}>◉</Text>
                  <Text style={styles.trackingTitle}>Things You're Tracking</Text>
                  <View style={[styles.trackingBadge]}>
                    <Text style={styles.trackingBadgeText}>{trackingItems.length}</Text>
                  </View>
                </View>
                <Text style={styles.trackingSubtitle}>
                  Watching, not doing — these will remind you when the time comes.
                </Text>
                <View style={styles.trackingList}>
                  {trackingItems.map((item) => {
                    const dueDateDisplay = item.dueDate ? formatDueDate(item.dueDate) : null;
                    return (
                      <View key={item.id} style={styles.trackingItem}>
                        <View style={styles.trackingDot} />
                        <Text style={styles.trackingItemText}>{item.text}</Text>
                        {dueDateDisplay ? (
                          <View style={styles.dueDateChip}>
                            <Text style={styles.dueDateText}>{dueDateDisplay}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Partner tasks filter button */}
            {hasPartnerTasks && (
              <TouchableOpacity
                style={styles.partnerButton}
                onPress={handleOpenPartnerModal}
                activeOpacity={0.8}
              >
                <Text style={styles.partnerButtonText}>Things on someone else's plate →</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Onboarding modal */}
      <Modal
        visible={onboardingVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          console.log('[Dump] Onboarding modal dismissed via back');
          setOnboardingDone();
          setOnboardingVisible(false);
        }}
      >
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingAppName}>Mom Brain</Text>
            <Text style={styles.onboardingWelcome}>Your mental load, finally organized.</Text>
            <Text style={styles.onboardingSubtitle}>Dump everything on your mind — we'll sort it out.</Text>

            <Text style={styles.onboardingStageLabel}>What stage are you in?</Text>
            <View style={styles.onboardingStageRow}>
              {(['Newborn', 'Toddler', 'School-age', 'Teen'] as const).map((stage) => {
                const isSelected = selectedStages.includes(stage);
                return (
                  <Pressable
                    key={stage}
                    style={[styles.onboardingStageChip, isSelected && styles.onboardingStageChipSelected]}
                    onPress={() => {
                      console.log('[Dump] Onboarding stage toggled:', stage);
                      setSelectedStages((prev) =>
                        prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
                      );
                    }}
                  >
                    <Text style={[styles.onboardingStageText, isSelected && styles.onboardingStageTextSelected]}>
                      {stage}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.onboardingGetStarted}
              activeOpacity={0.85}
              onPress={() => {
                console.log('[Dump] Onboarding "Get Started" pressed — stages:', selectedStages);
                setOnboardingDone();
                setOnboardingVisible(false);
              }}
            >
              <Text style={styles.onboardingGetStartedText}>Get Started  ✦</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                console.log('[Dump] Onboarding "Skip" pressed');
                setOnboardingDone();
                setOnboardingVisible(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.onboardingSkip}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Partner tasks modal */}
      <Modal
        visible={partnerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPartnerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => {
            console.log('[Dump] Partner modal dismissed');
            setPartnerModalVisible(false);
          }} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Things on someone else's plate</Text>
            <Text style={styles.modalSubtitle}>
              These are handled by someone else — you don't have to carry them alone.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              {partnerTasks.map((task, index) => {
                const label = delegationLabel(task.delegation);
                return (
                  <View key={index} style={styles.partnerTaskRow}>
                    <View style={styles.partnerTaskLeft}>
                      <Text style={styles.partnerTaskText}>{task.taskText}</Text>
                      <View style={styles.delegationChip}>
                        <Text style={styles.delegationChipText}>{label}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.draftEmailButton}
                      onPress={() => handleDraftEmailFromPartner(task)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.draftEmailButtonText}>Draft Email →</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  appName: {
    fontSize: 38,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.5,
  },
  appNameHeart: {
    fontSize: 28,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 17,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 24,
    marginTop: -4,
  },
  inputCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    shadowColor: 'rgba(63,49,44,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sparkleIcon: {
    fontSize: 18,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
  },
  cardHeading: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  helperSubtext: {
    fontSize: 15,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
    marginBottom: 8,
  },
  textInput: {
    minHeight: 160,
    fontSize: 16,
    color: Colors.textMain,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceLabel: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  voiceSubLabel: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    marginTop: 1,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
    marginLeft: 4,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryDeepRose,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  micRingOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryBlush + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRingMid: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.primaryBlush + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
  },
  waveformBar: {
    width: 5,
    height: 32,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  voiceCard: {
    backgroundColor: Colors.primaryBlush + '18',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primaryBlush + '44',
    gap: 10,
  },
  voiceCardPermission: {
    backgroundColor: '#C8846022',
    borderColor: '#C8846044',
  },
  voiceCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceSpinner: {
    marginRight: 2,
  },
  voiceCardText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
  stopButton: {
    marginTop: 2,
  },
  settingsButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryDeepRose + '22',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDeepRose + '44',
  },
  settingsButtonText: {
    fontSize: 13,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
  },
  successCaption: {
    fontSize: 13,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  helperCard: {
    backgroundColor: Colors.primaryBlush + '14',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primaryBlush + '30',
  },
  helperCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  helperCardLeft: {
    flex: 1,
    gap: 6,
  },
  helperLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  helperSparkle: {
    fontSize: 12,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
  },
  helperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 1.2,
  },
  helperText: {
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
  lastOrganized: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    marginTop: 0,
  },
  button: {
    marginTop: 4,
  },
  reassuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  reassuranceHeart: {
    fontSize: 14,
    color: Colors.primaryDeepRose,
  },
  reassuranceText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
  },
  errorBox: {
    backgroundColor: '#C8846022',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C8846044',
  },
  errorText: {
    fontSize: 14,
    color: '#C08060',
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  results: {
    gap: 12,
    marginTop: 8,
  },
  resultsHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.2,
  },
  resultsSubtitle: {
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    marginTop: 0,
  },
  holdingIntro: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  holdingIntroMuted: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 6,
  },
  resultsSubtitleMuted: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginTop: 2,
  },
  // Tracking card
  trackingCard: {
    backgroundColor: Colors.honey + '14',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.honey + '55',
    borderStyle: 'dashed',
    padding: 18,
    gap: 10,
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingIcon: {
    fontSize: 16,
    color: Colors.honey,
  },
  trackingTitle: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    flex: 1,
  },
  trackingBadge: {
    backgroundColor: Colors.honey + '33',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  trackingBadgeText: {
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textBody,
  },
  trackingSubtitle: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  trackingList: {
    gap: 8,
  },
  trackingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.honey,
    flexShrink: 0,
  },
  trackingItemText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 20,
  },
  dueDateChip: {
    backgroundColor: Colors.honey + '44',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dueDateText: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  // Partner button
  partnerButton: {
    backgroundColor: Colors.lavender + '22',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: Colors.lavender + '55',
    alignItems: 'center',
  },
  partnerButtonText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.lavender,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(63, 49, 44, 0.35)',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '75%',
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    lineHeight: 20,
  },
  modalScroll: {
    flexGrow: 0,
  },
  partnerTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  partnerTaskLeft: {
    flex: 1,
    gap: 6,
  },
  partnerTaskText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    lineHeight: 21,
  },
  delegationChip: {
    backgroundColor: Colors.lavender + '33',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  delegationChipText: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.lavender,
  },
  draftEmailButton: {
    backgroundColor: Colors.primaryDeepRose + '18',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDeepRose + '44',
  },
  draftEmailButtonText: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.primaryDeepRose,
  },
  onboardingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30,18,14,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  onboardingCard: {
    backgroundColor: '#FFFDFC',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
    gap: 12,
  },
  onboardingAppName: {
    fontSize: 30,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    letterSpacing: -0.4,
  },
  onboardingWelcome: {
    fontSize: 17,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textMain,
    textAlign: 'center',
    lineHeight: 24,
  },
  onboardingSubtitle: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  onboardingStageLabel: {
    fontSize: 13,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  onboardingStageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignSelf: 'stretch',
  },
  onboardingStageChip: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: Colors.card,
  },
  onboardingStageChipSelected: {
    borderColor: Colors.primaryDeepRose,
    backgroundColor: Colors.primaryDeepRose + '18',
  },
  onboardingStageText: {
    fontSize: 14,
    fontFamily: 'Nunito_500Medium',
    color: Colors.textBody,
  },
  onboardingStageTextSelected: {
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
  },
  onboardingGetStarted: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 8,
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  onboardingGetStartedText: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  onboardingSkip: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
