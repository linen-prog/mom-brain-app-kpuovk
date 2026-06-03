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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, CategoryColors } from '@/constants/Colors';
import { organizeText, OrganizeResponse } from '@/utils/api';
import { getLatestDump, saveLatestDump, OrganizedDump } from '@/utils/storage';
import { MomCheckInCard } from '@/components/MomCheckInCard';
import { CategorySection } from '@/components/CategorySection';
import { PrimaryButton } from '@/components/PrimaryButton';

const FALLBACK_CHECK_IN = "I caught it all. Pick one small thing — that's enough.";

function normalizeResponse(r: any): OrganizeResponse {
  const arr = (v: any) => (Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim().length > 0) : []);
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

export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrganizedDump | null>(null);
  const [lastOrganized, setLastOrganized] = useState<string | null>(null);

  const resultsOpacity = useRef(new Animated.Value(0)).current;
  const helperOpacity = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getLatestDump().then((dump) => {
      if (dump) {
        setLastOrganized(dump.createdAt);
        setResult(dump);
        resultsOpacity.setValue(1);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasText = text.length > 0;

  // Fade out helper when user starts typing
  useEffect(() => {
    Animated.timing(helperOpacity, {
      toValue: hasText ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [hasText, helperOpacity]);

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

      // Check if AI returned nothing useful
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

      // Fade out helper after successful organize
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
    } catch (err: any) {
      console.error('[Dump] organize error:', err);
      const msg: string = err?.message ?? '';
      if (msg.includes('Network') || msg.includes('fetch')) {
        setError("Looks like the connection's a little fuzzy. Try again in a moment.");
      } else {
        setError("Something got tangled on my end. Take a breath and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [text, resultsOpacity, helperOpacity]);

  const isDisabled = !text.trim() || loading;
  const relativeTime = lastOrganized ? getRelativeTime(lastOrganized) : null;

  // Show hint only when no fresh result is displayed
  const showHint = relativeTime !== null && !(result !== null && text.length === 0);

  // First-time helper: only when no saved dump, input empty, no result
  const showHelper = lastOrganized === null && text.length === 0 && result === null;

  // Warm hint copy
  const hintText = (() => {
    if (!relativeTime || !result) return null;
    const n = countAllItems(result);
    if (n === 0) return `Last organized: ${relativeTime}`;
    return `I'm holding ${n} thing${n === 1 ? '' : 's'} for you from ${relativeTime}.`;
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

        {/* Input card */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={8}
            placeholder="Dump everything you're holding in your head…"
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
            editable={!loading}
          />
        </View>

        {/* First-time helper card */}
        {showHelper && (
          <Animated.View style={[styles.helperCard, { opacity: helperOpacity }]}>
            <Text style={styles.helperLabel}>FOR EXAMPLE</Text>
            <Text style={styles.helperText}>
              Try something like: I need to sign Mina's school form, order groceries, text the babysitter, and I think I'm forgetting something for Monday…
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

        {/* Error message */}
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

            {/* Mom Check-In always first */}
            {result.momCheckIn ? (
              <MomCheckInCard message={result.momCheckIn} />
            ) : null}

            {/* Do Today */}
            {result.doToday.length > 0 && (
              <CategorySection
                title="Do Today"
                items={result.doToday}
                accentColor={CategoryColors.doToday}
              />
            )}

            {/* This Week */}
            {result.thisWeek.length > 0 && (
              <CategorySection
                title="This Week"
                items={result.thisWeek}
                accentColor={CategoryColors.thisWeek}
              />
            )}

            {/* Kids */}
            {result.kids.length > 0 && (
              <CategorySection
                title="Kids"
                items={result.kids}
                accentColor={CategoryColors.kids}
              />
            )}

            {/* Home */}
            {result.home.length > 0 && (
              <CategorySection
                title="Home"
                items={result.home}
                accentColor={CategoryColors.home}
              />
            )}

            {/* Errands */}
            {result.errands.length > 0 && (
              <CategorySection
                title="Errands / Groceries"
                items={result.errands}
                accentColor={CategoryColors.errands}
              />
            )}

            {/* Meals */}
            {result.meals.length > 0 && (
              <CategorySection
                title="Meals"
                items={result.meals}
                accentColor={CategoryColors.meals}
              />
            )}

            {/* Messages */}
            {result.messages.length > 0 && (
              <CategorySection
                title="Messages"
                items={result.messages}
                accentColor={CategoryColors.messages}
              />
            )}

            {/* Holding for Later */}
            {result.holdingForLater.length > 0 && (
              <View>
                <Text style={styles.holdingIntro}>These can wait. They're safe here.</Text>
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
});
