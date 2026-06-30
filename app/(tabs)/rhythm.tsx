import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { getLatestDump, OrganizedDump, TrackingItem } from '@/utils/storage';
import { getRhythmRecap, RhythmRecapResponse } from '@/utils/api';
import { EmptyState } from '@/components/EmptyState';

export default function RhythmScreen() {
  const insets = useSafeAreaInsets();
  const [dump, setDump] = useState<OrganizedDump | null>(null);
  const [recap, setRecap] = useState<RhythmRecapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recapOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      console.log('[Rhythm] screen focused — loading latest dump');
      getLatestDump().then((d) => {
        setDump(d);
      });
    }, [])
  );

  const handleGenerateRecap = useCallback(async () => {
    if (!dump) return;
    console.log('[Rhythm] "Generate This Week\'s Recap" pressed');
    setLoading(true);
    setError(null);
    recapOpacity.setValue(0);

    // Build completed / pending lists from all categories
    const allCategories: (keyof OrganizedDump)[] = [
      'doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'work',
    ];

    const completedTasks: string[] = [];
    const pendingTasks: string[] = [];

    allCategories.forEach((cat) => {
      const items = dump[cat] as string[] | undefined;
      if (!Array.isArray(items)) return;
      items.forEach((item, index) => {
        const key = `${cat}:${index}`;
        if (dump.completed?.[key]) {
          completedTasks.push(item);
        } else {
          pendingTasks.push(item);
        }
      });
    });

    const trackingItems: TrackingItem[] = dump.trackingItems ?? [];

    console.log('[Rhythm] recap params — completed:', completedTasks.length, '| pending:', pendingTasks.length, '| tracking:', trackingItems.length);

    try {
      const result = await getRhythmRecap({ completedTasks, pendingTasks, trackingItems });
      setRecap(result);
      Animated.timing(recapOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (err) {
      console.error('[Rhythm] getRhythmRecap error:', err);
      setError("Couldn't generate your recap. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [dump, recapOpacity]);

  const handleRefreshRecap = useCallback(() => {
    console.log('[Rhythm] "Refresh Recap" pressed');
    setRecap(null);
    handleGenerateRecap();
  }, [handleGenerateRecap]);

  const handleGoDump = useCallback(() => {
    console.log('[Rhythm] "Go to Dump" pressed from empty state');
  }, []);

  if (!dump) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Rhythm</Text>
            <Text style={styles.titleHeart}> ♡</Text>
          </View>
          <Text style={styles.subtitle}>Your week at a glance.</Text>
        </View>
        <EmptyState
          icon={<Sparkles size={32} color={Colors.lavender} />}
          headline="Nothing here yet"
          body="Head to Dump and say what's on your mind. Once you've organized a brain dump, I'll show you your weekly rhythm."
          ctaLabel="Go to Dump"
          onCta={handleGoDump}
        />
      </View>
    );
  }

  const weekLabelDisplay = recap?.weekLabel ?? '';
  const momMessage = recap?.momMessage ?? '';
  const doneThisWeek = recap?.doneThisWeek ?? [];
  const rollingOver = recap?.rollingOver ?? [];
  const comingUp = recap?.comingUp ?? [];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Rhythm</Text>
        <Text style={styles.titleHeart}> ♡</Text>
      </View>
      <Text style={styles.subtitle}>Your week at a glance.</Text>

      {/* Generate button — only shown when no recap yet */}
      {!recap && !loading && (
        <TouchableOpacity
          style={styles.generateButton}
          onPress={handleGenerateRecap}
          activeOpacity={0.85}
        >
          <Text style={styles.generateButtonText}>Generate This Week's Recap  ✦</Text>
        </TouchableOpacity>
      )}

      {/* Loading state */}
      {loading && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={Colors.lavender} />
          <Text style={styles.loadingText}>Putting your week together…</Text>
        </View>
      )}

      {/* Error state */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleGenerateRecap} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recap content */}
      {recap && (
        <Animated.View style={[styles.recapContainer, { opacity: recapOpacity }]}>
          {/* Week label */}
          {weekLabelDisplay.length > 0 && (
            <Text style={styles.weekLabel}>{weekLabelDisplay}</Text>
          )}

          {/* FOR YOU card */}
          {momMessage.length > 0 && (
            <View style={styles.forYouCard}>
              <View style={styles.forYouAccent} />
              <Text style={styles.forYouLabel}>FOR YOU</Text>
              <Text style={styles.forYouMessage}>{momMessage}</Text>
              <View style={styles.forYouFooter}>
                <Text style={styles.forYouHeart}>♥</Text>
                <Text style={styles.forYouFooterText}>You're doing more than you know.</Text>
              </View>
            </View>
          )}

          {/* What got done */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: Colors.sage }]} />
              <Text style={styles.sectionTitle}>What got done</Text>
            </View>
            {doneThisWeek.length === 0 ? (
              <Text style={styles.emptyHint}>Nothing marked done yet — that's okay.</Text>
            ) : (
              <View style={styles.itemList}>
                {doneThisWeek.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.checkMark}>✓</Text>
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Still on your list */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: Colors.primaryBlush }]} />
              <Text style={styles.sectionTitle}>Still on your list</Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              These are carrying forward, not falling behind.
            </Text>
            {rollingOver.length === 0 ? (
              <Text style={styles.emptyHint}>You're all caught up.</Text>
            ) : (
              <View style={styles.itemList}>
                {rollingOver.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <View style={[styles.bullet, { backgroundColor: Colors.primaryBlush }]} />
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Coming up */}
          {comingUp.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: Colors.honey }]} />
                <Text style={styles.sectionTitle}>Coming up</Text>
              </View>
              <View style={styles.itemList}>
                {comingUp.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <View style={[styles.bullet, { backgroundColor: Colors.honey }]} />
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Refresh button */}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefreshRecap}
            activeOpacity={0.8}
          >
            <Text style={styles.refreshButtonText}>Refresh Recap</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 38,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    letterSpacing: -0.5,
  },
  titleHeart: {
    fontSize: 28,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 17,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    marginTop: -4,
  },
  generateButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
    marginTop: 8,
  },
  generateButtonText: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.lavender + '18',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.lavender + '44',
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    fontStyle: 'italic',
  },
  errorBox: {
    backgroundColor: '#C8846022',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C8846044',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#C08060',
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryDeepRose + '22',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDeepRose + '44',
  },
  retryButtonText: {
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
  },
  recapContainer: {
    gap: 14,
  },
  weekLabel: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  // FOR YOU card
  forYouCard: {
    backgroundColor: Colors.lavender + '18',
    borderRadius: 20,
    padding: 18,
    paddingLeft: 22,
    borderWidth: 1,
    borderColor: Colors.lavender + '40',
    overflow: 'hidden',
    gap: 8,
  },
  forYouAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.lavender,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  forYouLabel: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    color: Colors.lavender,
    letterSpacing: 1.2,
  },
  forYouMessage: {
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    lineHeight: 24,
  },
  forYouFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  forYouHeart: {
    fontSize: 14,
    color: Colors.lavender,
  },
  forYouFooterText: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.lavender,
    fontStyle: 'italic',
  },
  // Section cards
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: -4,
  },
  emptyHint: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  itemList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkMark: {
    fontSize: 14,
    color: Colors.sage,
    fontFamily: 'Nunito_700Bold',
    marginTop: 3,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    flexShrink: 0,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 22,
  },
  refreshButton: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.lavender + '66',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: Colors.lavender + '14',
  },
  refreshButtonText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.lavender,
  },
});
