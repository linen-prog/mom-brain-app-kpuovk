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
  Image,
  ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors, CategoryColors } from '@/constants/Colors';
import { organizeText, OrganizeError, OrganizeResponse } from '@/utils/api';
import { getLatestDump, saveLatestDump, OrganizedDump } from '@/utils/storage';
import { MomCheckInCard } from '@/components/MomCheckInCard';
import { CategorySection } from '@/components/CategorySection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { requestMicPermission, transcribeAudio, VoiceError } from '@/utils/voice';
import { IconSymbol } from '@/components/IconSymbol';

// ─── Mic illustration assets ──────────────────────────────────────────────────
const MIC_IDLE = require('@/assets/images/36718f89-1e02-496d-ae89-2b43ddce4a4c.jpeg');
const MIC_RECORDING = require('@/assets/images/d37fa240-ea5b-4a98-9534-9a3b539c3b04.jpeg');
const MIC_TRANSCRIBING = require('@/assets/images/48850389-54f0-4669-a9bb-eb1bdaa1ff0d.jpeg');

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const FALLBACK_CHECK_IN = "I caught it all. Pick one small thing — that's enough.";

// ─── Voice UI state ───────────────────────────────────────────────────────────
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'permission_needed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeResponse(r: any): OrganizeResponse {
  const arr = (v: any) =>
    Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim().length > 0) : [];
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrganizedDump | null>(null);
  const [lastOrganized, setLastOrganized] = useState<string | null>(null);

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
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const rotateLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load saved dump ──────────────────────────────────────────────────────
  useEffect(() => {
    getLatestDump().then((dump) => {
      if (dump) {
        setLastOrganized(dump.createdAt);
        setResult(dump);
        resultsOpacity.setValue(1);
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

  // ── Pulse animation for recording state (opacity only, no scale) ────────
  useEffect(() => {
    if (voiceState === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.85,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulseLoopRef.current?.stop();
    };
  }, [voiceState, pulseAnim]);

  // ── Rotate animation for transcribing state ──────────────────────────────
  useEffect(() => {
    if (voiceState === 'transcribing') {
      rotateAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 6000,
          useNativeDriver: true,
        })
      );
      rotateLoopRef.current = loop;
      loop.start();
    } else {
      rotateLoopRef.current?.stop();
      rotateAnim.setValue(0);
    }
    return () => {
      rotateLoopRef.current?.stop();
    };
  }, [voiceState, rotateAnim]);

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
      Animated.timing(successOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 4000);
  }, [successOpacity]);

  // ── Organize handler ─────────────────────────────────────────────────────
  const handleOrganize = useCallback(async () => {
    if (!text.trim()) return;
    console.log('[Dump] "Organize My Brain" pressed — text length:', text.trim().length);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    resultsOpacity.setValue(0);

    try {
      const raw = await organizeText(text.trim());
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
        ...normalized,
        completed: {},
      };
      await saveLatestDump(dump);
      setResult(dump);
      setLastOrganized(dump.createdAt);
      setText('');

      Animated.timing(helperOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();

      Animated.timing(resultsOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 300);
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
  }, [text, resultsOpacity, helperOpacity]);

  // ── Voice: tap mic button ────────────────────────────────────────────────
  const handleMicPress = useCallback(async () => {
    console.log('[Voice] Mic button pressed — current voiceState:', voiceState);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (voiceState === 'recording') {
      // Stop recording
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
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }, 200);
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

    if (voiceState === 'transcribing') {
      // Ignore taps while transcribing
      return;
    }

    // idle or permission_needed → request permission then start
    const granted = await requestMicPermission();
    if (!granted) {
      console.warn('[Voice] Microphone permission denied');
      setVoiceState('permission_needed');
      setVoiceError(null);
      return;
    }

    // Start recording
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

  // ── Stop button (inside recording card) ─────────────────────────────────
  const handleStopPress = useCallback(() => {
    console.log('[Voice] Stop button pressed');
    handleMicPress();
  }, [handleMicPress]);

  // ── Open Settings ────────────────────────────────────────────────────────
  const handleOpenSettings = useCallback(() => {
    console.log('[Voice] Opening device Settings for microphone permission');
    Linking.openSettings();
  }, []);

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

  // Mic button appearance
  const isRecording = voiceState === 'recording';
  const isTranscribing = voiceState === 'transcribing';

  const micSource =
    voiceState === 'transcribing' ? MIC_TRANSCRIBING :
    voiceState === 'recording' ? MIC_RECORDING :
    MIC_IDLE;

  const micAccessibilityLabel =
    voiceState === 'transcribing' ? 'Transcribing' :
    voiceState === 'recording' ? 'Stop recording' :
    'Start voice dump';

  const rotateInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Voice status card copy
  const voiceCardCopy = (() => {
    if (voiceState === 'recording') return 'Listening… say it messy.';
    if (voiceState === 'transcribing') return 'Got it. Turning your words into something you can see.';
    if (voiceState === 'permission_needed')
      return 'I need microphone permission before I can listen. Tap the mic again to try, or open Settings.';
    return null;
  })();

  // Error message for voice errors (uses same warm-error-card style)
  const voiceErrorMessage = (() => {
    if (!voiceError) return null;
    return voiceError;
  })();

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
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.appName}>Mom Brain</Text>
        <Text style={styles.tagline}>Say it messy. I'll sort it out.</Text>

        {/* Input card with mic button */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={8}
            placeholder="Say everything. The big stuff, the small stuff, the thing you keep forgetting. It's all welcome here."
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
            editable={!loading && voiceState !== 'transcribing'}
          />
          {/* Mic button — bottom-right of card */}
          <View style={styles.micRow}>
            <Text style={styles.talkCaption}>Talk it out.</Text>
            <Animated.View style={{ opacity: pulseAnim }}>
              <TouchableOpacity
                onPress={handleMicPress}
                disabled={isTranscribing}
                activeOpacity={0.9}
                accessibilityLabel={micAccessibilityLabel}
              >
                <Animated.Image
                  source={resolveImageSource(micSource)}
                  style={[
                    styles.micImage,
                    isTranscribing && { transform: [{ rotate: rotateInterpolation }] },
                  ]}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* Voice status card */}
        {voiceCardCopy !== null && (
          <View
            style={[
              styles.voiceCard,
              voiceState === 'permission_needed' && styles.voiceCardPermission,
            ]}
          >
            <View style={styles.voiceCardRow}>
              {isTranscribing && (
                <ActivityIndicator
                  size="small"
                  color={Colors.primaryDeepRose}
                  style={styles.voiceSpinner}
                />
              )}
              <Text style={styles.voiceCardText}>{voiceCardCopy}</Text>
            </View>
            {voiceState === 'recording' && (
              <PrimaryButton
                label="Stop"
                onPress={handleStopPress}
                style={styles.stopButton}
              />
            )}
            {voiceState === 'permission_needed' && (
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={handleOpenSettings}
                activeOpacity={0.8}
              >
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Voice error card */}
        {voiceErrorMessage !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{voiceErrorMessage}</Text>
          </View>
        )}

        {/* Success caption — fades after 4s */}
        <Animated.Text style={[styles.successCaption, { opacity: successOpacity }]}>
          I caught your words. You can edit before organizing.
        </Animated.Text>

        {/* First-time helper card */}
        {showHelper && (
          <Animated.View style={[styles.helperCard, { opacity: helperOpacity }]}>
            <Text style={styles.helperLabel}>FOR EXAMPLE</Text>
            <Text style={styles.helperText}>
              Try something like: I need to sign Mina's school form, order groceries, text the
              babysitter, and I think I'm forgetting something for Monday…
            </Text>
          </Animated.View>
        )}

        {/* Last organized hint */}
        {showHint && hintText && (
          <Text style={styles.lastOrganized}>{hintText}</Text>
        )}

        {/* Organize button */}
        <PrimaryButton
          label="Organize My Brain"
          loadingLabel="Sorting the mental load…"
          onPress={handleOrganize}
          loading={loading}
          disabled={isDisabled}
          style={styles.button}
        />

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

            {result.momCheckIn ? (
              <MomCheckInCard message={result.momCheckIn} />
            ) : null}

            {result.doToday.length > 0 && (
              <CategorySection
                title="Do Today"
                items={result.doToday}
                accentColor={CategoryColors.doToday}
              />
            )}

            {result.thisWeek.length > 0 && (
              <CategorySection
                title="This Week"
                items={result.thisWeek}
                accentColor={CategoryColors.thisWeek}
              />
            )}

            {result.kids.length > 0 && (
              <CategorySection
                title="Kids"
                items={result.kids}
                accentColor={CategoryColors.kids}
              />
            )}

            {result.home.length > 0 && (
              <CategorySection
                title="Home"
                items={result.home}
                accentColor={CategoryColors.home}
              />
            )}

            {result.errands.length > 0 && (
              <CategorySection
                title="Errands / Groceries"
                items={result.errands}
                accentColor={CategoryColors.errands}
              />
            )}

            {result.meals.length > 0 && (
              <CategorySection
                title="Meals"
                items={result.meals}
                accentColor={CategoryColors.meals}
              />
            )}

            {result.messages.length > 0 && (
              <CategorySection
                title="Messages"
                items={result.messages}
                accentColor={CategoryColors.messages}
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
                />
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
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
  appName: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
    marginTop: 0,
  },
  inputCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    boxShadow: '0 1px 3px rgba(63, 49, 44, 0.06), 0 4px 12px rgba(63, 49, 44, 0.04)',
  } as object,
  textInput: {
    minHeight: 180,
    fontSize: 16,
    color: Colors.textMain,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
    marginBottom: 4,
    gap: 10,
  },
  talkCaption: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
  },
  micImage: {
    width: 96,
    height: 96,
  },
  // Voice status card
  voiceCard: {
    backgroundColor: Colors.primaryBlush + '18',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primaryBlush + '44',
    gap: 10,
  },
  voiceCardPermission: {
    backgroundColor: Colors.clay + '14',
    borderColor: Colors.clay + '33',
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
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primaryBlush + '33',
  },
  helperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 1,
    marginBottom: 6,
  },
  helperText: {
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
    fontStyle: 'italic',
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
  errorBox: {
    backgroundColor: Colors.clay + '22',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.clay + '44',
  },
  errorText: {
    fontSize: 14,
    color: Colors.clay,
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
});
