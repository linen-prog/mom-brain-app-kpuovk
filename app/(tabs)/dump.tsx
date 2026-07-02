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
  Image,
  ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors, CategoryColors } from '@/constants/Colors';
import { organizeText, organizeImages, OrganizeError, OrganizeResponse } from '@/utils/api';
import {
  getLatestDump,
  saveLatestDump,
  saveDumpToHistory,
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
  const [typedExpanded, setTypedExpanded] = useState(false);
  const [inputSource, setInputSource] = useState<'voice' | 'typed' | 'screenshot' | null>(null);

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

  // Image state
  const [selectedImages, setSelectedImages] = useState<{ uri: string; base64: string; mimeType: string }[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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

  // ── Helper fade — only visible when typedExpanded and no text ────────────
  const hasText = text.length > 0;
  useEffect(() => {
    const shouldShow = typedExpanded && !hasText;
    Animated.timing(helperOpacity, {
      toValue: shouldShow ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [hasText, typedExpanded, helperOpacity]);

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
    const currentSource = typedExpanded ? 'typed' : (inputSource ?? 'voice');
    console.log('[Dump] "Organize My Brain" pressed — text length:', text.trim().length, '| kids:', kids.length, '| partner:', partnerName ?? 'none', '| inputSource:', currentSource);
    setInputSource(currentSource);
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
        inputSource: currentSource,
      };
      await saveLatestDump(dump);
      await saveDumpToHistory(dump);
      setResult(dump);
      setLastOrganized(dump.createdAt);
      setText('');
      setTypedExpanded(false);

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
  }, [text, kids, partnerName, resultsOpacity, helperOpacity, inputSource, typedExpanded]);

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
        setInputSource('voice');
        console.log('[Voice] inputSource set to voice');
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

  // ── Siri autoRecord deep-link detection ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Cold launch: app was closed, Siri opened it via deep link
    Linking.getInitialURL().then((url) => {
      if (!cancelled && url && url.includes('autoRecord=true')) {
        console.log('[Siri] Cold launch autoRecord detected — url:', url);
        // Small delay to ensure the component is fully mounted and audio is ready
        setTimeout(() => {
          if (!cancelled) {
            console.log('[Siri] Triggering handleMicPress from cold launch');
            handleMicPress();
          }
        }, 800);
      }
    });

    // Foreground: app is already open, Siri fires a URL event
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('autoRecord=true')) {
        console.log('[Siri] Foreground autoRecord detected — url:', url);
        setTimeout(() => {
          console.log('[Siri] Triggering handleMicPress from foreground');
          handleMicPress();
        }, 300);
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [handleMicPress]);

  const handleOpenSettings = useCallback(() => {
    console.log('[Voice] Opening device Settings for microphone permission');
    Linking.openSettings();
  }, []);

  // ── Image picker ─────────────────────────────────────────────────────────
  const handlePickImages = useCallback(async () => {
    console.log('[Image] Camera button pressed — current image count:', selectedImages.length);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageError(null);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log('[Image] Media library permission status:', status);
    if (status !== 'granted') {
      setImageError('Photo library permission is needed to pick screenshots.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as ImagePicker.MediaType,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      base64: true,
      quality: 0.5,
      exif: false,
    });

    if (result.canceled) {
      console.log('[Image] Image picker cancelled');
      return;
    }

    const BASE64_LIMIT = 3_000_000;

    const picked = await Promise.all(
      result.assets
        .filter((a) => a.base64)
        .map(async (a) => {
          let base64 = a.base64 as string;
          let mimeType = a.mimeType ?? 'image/jpeg';

          if (base64.length > BASE64_LIMIT) {
            console.log('[Image] Image too large (' + base64.length + ' chars), resizing…');
            const manipulated = await ImageManipulator.manipulateAsync(
              a.uri,
              [{ resize: { width: 1200 } }],
              { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );
            base64 = manipulated.base64 ?? base64;
            mimeType = 'image/jpeg';
            console.log('[Image] Resized image base64 length:', base64.length);
          }

          return { uri: a.uri, base64, mimeType };
        })
    );

    const combined = [...selectedImages, ...picked].slice(0, 3);
    console.log('[Image] Images selected — count:', combined.length);
    setSelectedImages(combined);
  }, [selectedImages]);

  const handleRemoveImage = useCallback((index: number) => {
    console.log('[Image] Remove image at index:', index);
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleScanScreenshots = useCallback(async () => {
    if (selectedImages.length === 0 || imageLoading) return;
    console.log('[Image] "Scan Screenshot" pressed — images:', selectedImages.length, '| kids:', kids.length, '| partner:', partnerName ?? 'none');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setImageLoading(true);
    setImageError(null);

    try {
      const payload: { base64: string; mimeType: string }[] = selectedImages.map((img) => ({ base64: img.base64, mimeType: img.mimeType }));
      const response = await organizeImages(payload, {
        kids: kids.length > 0 ? kids : undefined,
        partnerName: partnerName ?? undefined,
      });

      if (response.noActionableContent) {
        console.log('[Image] No actionable content found in screenshot(s)');
        setImageError('Nothing actionable found in that image — try a different screenshot.');
        setImageLoading(false);
        return;
      }

      console.log('[Image] Scan success — navigating to screenshot-review');
      router.push({
        pathname: '/screenshot-review',
        params: {
          result: JSON.stringify(response),
          imageCount: String(selectedImages.length),
        },
      });
      setSelectedImages([]);
    } catch (err: unknown) {
      console.error('[Image] Scan error:', err);
      if (err instanceof OrganizeError) {
        if (err.kind === 'rate_limited') {
          setImageError("Mom Brain needs a minute to catch up. Try again shortly.");
        } else if (err.kind === 'network') {
          setImageError("I couldn't reach the cloud. Check your connection and try again.");
        } else {
          setImageError("Something got tangled on my end. Give it another try in a moment.");
        }
      } else {
        setImageError("Something got tangled on my end. Give it another try in a moment.");
      }
    } finally {
      setImageLoading(false);
    }
  }, [selectedImages, imageLoading, kids, partnerName, router]);

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
    if (isPermissionNeeded) return <IconSymbol ios_icon_name="mic.slash.fill" android_material_icon_name="mic-off" size={28} color="#FFFFFF" />;
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
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 100 },
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

          {/* Voice row */}
          <View style={styles.rowPill}>
            <View style={styles.voiceRowLeft}>
              <IconSymbol ios_icon_name="mic.fill" android_material_icon_name="mic" size={16} color={Colors.primaryDeepRose} />
              <View>
                <Text style={styles.voiceLabel}>Talk it out</Text>
                <Text style={styles.voiceSubLabel}>Tap to voice your thoughts</Text>
              </View>
            </View>
            {micButtonNode}
          </View>

          <View style={styles.divider} />

          {/* Screenshot row */}
          <View style={styles.rowPill}>
            <View style={styles.voiceRowLeft}>
              <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera-alt" size={16} color={Colors.primaryDeepRose} />
              <View>
                <Text style={styles.voiceLabel}>Screenshot it</Text>
                <Text style={styles.voiceSubLabel}>Add a school note, list, text, or reminder</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handlePickImages}
              disabled={selectedImages.length >= 3}
              activeOpacity={0.85}
              accessibilityLabel="Pick screenshot"
            >
              <View style={[styles.micButton, selectedImages.length >= 3 && styles.micButtonDisabled]}>
                <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera-alt" size={28} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Type it out row */}
          <View style={styles.rowPill}>
            <View style={styles.voiceRowLeft}>
              <IconSymbol ios_icon_name="keyboard" android_material_icon_name="keyboard" size={16} color={Colors.primaryDeepRose} />
              <View>
                <Text style={styles.voiceLabel}>Type it out</Text>
                <Text style={styles.voiceSubLabel}>Quickly type what's on your mind</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                const next = !typedExpanded;
                console.log('[Dump] "Type it out" button pressed — typedExpanded:', next);
                setTypedExpanded(next);
              }}
              activeOpacity={0.85}
              accessibilityLabel="Toggle typed input"
            >
              <View style={[styles.micButton, typedExpanded && styles.micButtonActive]}>
                <IconSymbol ios_icon_name="keyboard" android_material_icon_name="keyboard" size={28} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Expandable typed input */}
          {typedExpanded && (
            <View style={styles.typedInputContainer}>
              <Animated.Text style={[styles.helperSubtext, { opacity: helperOpacity }]}>
                {'Say everything—the big stuff, the small stuff, the thing you keep forgetting. It\'s all welcome here.'}
              </Animated.Text>
              <TextInput
                style={styles.textInput}
                multiline
                placeholder=""
                placeholderTextColor={Colors.textMuted}
                value={text}
                onChangeText={(val) => {
                  console.log('[Dump] TextInput changed — length:', val.length);
                  setText(val);
                }}
                textAlignVertical="top"
                editable={!loading && voiceState !== 'transcribing'}
                autoFocus={typedExpanded}
              />
            </View>
          )}

          {/* Thumbnail row */}
          {selectedImages.length > 0 && (
            <View style={styles.thumbnailRow}>
              {selectedImages.map((img, index) => {
                const imgSource: ImageSourcePropType = { uri: img.uri };
                return (
                  <View key={index} style={styles.thumbnailWrapper}>
                    <Image source={imgSource} style={styles.thumbnail} />
                    <TouchableOpacity
                      style={styles.thumbnailRemove}
                      onPress={() => handleRemoveImage(index)}
                      activeOpacity={0.8}
                      accessibilityLabel="Remove image"
                    >
                      <Text style={styles.thumbnailRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Scan screenshots button */}
        {selectedImages.length > 0 && (
          <TouchableOpacity
            style={[styles.scanButton, (imageLoading || selectedImages.length === 0) && styles.scanButtonDisabled]}
            onPress={handleScanScreenshots}
            disabled={imageLoading || selectedImages.length === 0}
            activeOpacity={0.85}
          >
            {imageLoading ? (
              <View style={styles.scanButtonInner}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.scanButtonText}>Reading your screenshot…</Text>
              </View>
            ) : (
              <Text style={styles.scanButtonText}>Scan Screenshot  ✦</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Image error */}
        {imageError !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{imageError}</Text>
          </View>
        )}

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
          <TouchableOpacity
            style={styles.helperCard}
            activeOpacity={0.75}
            onPress={() => {
              console.log('[Dump] Helper card "Tap to try" pressed — prefilling example text');
              setText("I need to sign Mina's school form, order groceries, text the babysitter, and remember something for Monday…");
              setTypedExpanded(true);
            }}
          >
            <View style={styles.helperCardInner}>
              <View style={styles.helperCardLeft}>
                <View style={styles.helperLabelRow}>
                  <Text style={styles.helperSparkle}>✦</Text>
                  <Text style={styles.helperLabel}>FOR EXAMPLE</Text>
                </View>
                <Text style={styles.helperText}>
                  {"I need to sign Mina's school form, order groceries, text the babysitter, and remember something for Monday…"}
                </Text>
              </View>
            </View>
            <Text style={styles.helperTapHint}>Tap to try this example</Text>
          </TouchableOpacity>
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
                inputSource={result.inputSource}
              />
            )}

            {result.thisWeek.length > 0 && (
              <CategorySection
                title="This Week"
                items={result.thisWeek}
                accentColor={CategoryColors.thisWeek}
                taskMeta={result.taskMeta}
                inputSource={result.inputSource}
              />
            )}

            {result.kids.length > 0 && (
              <CategorySection
                title="Kids"
                items={result.kids}
                accentColor={CategoryColors.kids}
                taskMeta={result.taskMeta}
                inputSource={result.inputSource}
              />
            )}

            {result.home.length > 0 && (
              <CategorySection
                title="Home"
                items={result.home}
                accentColor={CategoryColors.home}
                taskMeta={result.taskMeta}
                inputSource={result.inputSource}
              />
            )}

            {result.errands.length > 0 && (
              <CategorySection
                title="Errands / Groceries"
                items={result.errands}
                accentColor={CategoryColors.errands}
                taskMeta={result.taskMeta}
                inputSource={result.inputSource}
              />
            )}

            {result.meals.length > 0 && (
              <CategorySection
                title="Meals"
                items={result.meals}
                accentColor={CategoryColors.meals}
                taskMeta={result.taskMeta}
                inputSource={result.inputSource}
              />
            )}

            {result.messages.length > 0 && (
              <CategorySection
                title="Messages"
                items={result.messages}
                accentColor={CategoryColors.messages}
                taskMeta={result.taskMeta}
                inputSource={result.inputSource}
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
                  inputSource={result.inputSource}
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
    fontSize: 18,
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
    marginVertical: 16,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPill: {
    backgroundColor: Colors.primaryBlush + '18',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  helperTapHint: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    color: Colors.primaryDeepRose,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'right',
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
  micButtonActive: {
    backgroundColor: Colors.primaryDeepRose,
    opacity: 0.75,
  },
  typedInputContainer: {
    marginTop: 14,
    gap: 4,
  },
  // Image picker
  micButtonDisabled: {
    opacity: 0.45,
  },
  thumbnailRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  thumbnailWrapper: {
    position: 'relative',
    width: 60,
    height: 60,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: Colors.border,
  },
  thumbnailRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryDeepRose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailRemoveText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontFamily: 'Nunito_700Bold',
    lineHeight: 14,
  },
  scanButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  scanButtonDisabled: {
    opacity: 0.55,
  },
  scanButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanButtonText: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
});
