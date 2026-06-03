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
import { organizeText } from '@/utils/api';
import { getLatestDump, saveLatestDump, OrganizedDump } from '@/utils/storage';
import { MomCheckInCard } from '@/components/MomCheckInCard';
import { CategorySection } from '@/components/CategorySection';
import { PrimaryButton } from '@/components/PrimaryButton';

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

export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrganizedDump | null>(null);
  const [lastOrganized, setLastOrganized] = useState<string | null>(null);

  const resultsOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getLatestDump().then((dump) => {
      if (dump) {
        setLastOrganized(dump.createdAt);
        setResult(dump);
        resultsOpacity.setValue(1);
      }
    });
  }, []);

  const handleOrganize = useCallback(async () => {
    if (!text.trim()) return;
    console.log('[Dump] "Organize My Brain" pressed — text length:', text.trim().length);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);
    resultsOpacity.setValue(0);

    try {
      const response = await organizeText(text.trim());
      const dump: OrganizedDump = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        originalText: text.trim(),
        ...response,
        completed: {},
      };
      await saveLatestDump(dump);
      setResult(dump);
      setLastOrganized(dump.createdAt);

      Animated.timing(resultsOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 300);
    } catch (err) {
      console.error('[Dump] organize error:', err);
      setError('Something went wrong. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [text, resultsOpacity]);

  const isDisabled = !text.trim() || loading;
  const relativeTime = lastOrganized ? getRelativeTime(lastOrganized) : null;

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

        {/* Last organized hint */}
        {relativeTime && (
          <Text style={styles.lastOrganized}>Last organized: {relativeTime}</Text>
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
            <Text style={styles.resultsHeading}>Here's what you're carrying</Text>
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
                title="Errands"
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
              <View style={styles.holdingSection}>
                <CategorySection
                  title="Holding for Later"
                  items={result.holdingForLater}
                  accentColor={CategoryColors.holdingForLater}
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
    marginTop: -8,
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
  lastOrganized: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    marginTop: -4,
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
    marginTop: -4,
  },
  holdingSection: {
    opacity: 0.85,
  },
});
