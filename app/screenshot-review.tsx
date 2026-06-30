import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, CategoryColors } from '@/constants/Colors';
import { OrganizeImageResponse } from '@/utils/api';
import { getLatestDump, saveLatestDump, OrganizedDump } from '@/utils/storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FALLBACK_CHECK_IN = "I caught it all. Pick one small thing — that's enough.";

function normalizeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((x) => typeof x === 'string' && (x as string).trim().length > 0) as string[]
    : [];
}

interface ReviewCategory {
  key: keyof Pick<OrganizeImageResponse, 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'holdingForLater'>;
  title: string;
  accentColor: string;
}

const CATEGORIES: ReviewCategory[] = [
  { key: 'doToday', title: 'Do Today', accentColor: CategoryColors.doToday },
  { key: 'thisWeek', title: 'This Week', accentColor: CategoryColors.thisWeek },
  { key: 'kids', title: 'Kids', accentColor: CategoryColors.kids },
  { key: 'home', title: 'Home', accentColor: CategoryColors.home },
  { key: 'errands', title: 'Errands / Groceries', accentColor: CategoryColors.errands },
  { key: 'meals', title: 'Meals', accentColor: CategoryColors.meals },
  { key: 'messages', title: 'Messages', accentColor: CategoryColors.messages },
  { key: 'holdingForLater', title: 'Holding for Later', accentColor: CategoryColors.holdingForLater },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScreenshotReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ result: string; imageCount: string }>();

  const imageCount = Number(params.imageCount ?? '1');
  const screenshotLabel = imageCount === 1 ? '1 screenshot' : `${imageCount} screenshots`;

  // Parse the result from params
  const parsedResult = React.useMemo<OrganizeImageResponse | null>(() => {
    try {
      return JSON.parse(params.result ?? '{}') as OrganizeImageResponse;
    } catch {
      console.error('[ScreenshotReview] Failed to parse result param');
      return null;
    }
  }, [params.result]);

  // Build mutable per-category item lists
  const [categoryItems, setCategoryItems] = useState<Record<string, string[]>>(() => {
    if (!parsedResult) return {};
    const init: Record<string, string[]> = {};
    for (const cat of CATEGORIES) {
      init[cat.key] = normalizeArr(parsedResult[cat.key]);
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleRemoveItem = useCallback((catKey: string, index: number) => {
    console.log('[ScreenshotReview] Remove item — category:', catKey, '| index:', index);
    setCategoryItems((prev) => ({
      ...prev,
      [catKey]: prev[catKey].filter((_, i) => i !== index),
    }));
  }, []);

  const totalItems = Object.values(categoryItems).reduce((sum, arr) => sum + arr.length, 0);

  const handleSave = useCallback(async () => {
    console.log('[ScreenshotReview] "Save to My Lists" pressed — total items:', totalItems);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    setSaveError(null);

    try {
      const existing = await getLatestDump();

      const merged: OrganizedDump = existing
        ? {
            ...existing,
            doToday: [...existing.doToday, ...categoryItems.doToday],
            thisWeek: [...existing.thisWeek, ...categoryItems.thisWeek],
            kids: [...existing.kids, ...categoryItems.kids],
            home: [...existing.home, ...categoryItems.home],
            errands: [...existing.errands, ...categoryItems.errands],
            meals: [...existing.meals, ...categoryItems.meals],
            messages: [...existing.messages, ...categoryItems.messages],
            holdingForLater: [...existing.holdingForLater, ...categoryItems.holdingForLater],
          }
        : {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            originalText: '',
            work: [],
            doToday: categoryItems.doToday,
            thisWeek: categoryItems.thisWeek,
            kids: categoryItems.kids,
            home: categoryItems.home,
            errands: categoryItems.errands,
            meals: categoryItems.meals,
            messages: categoryItems.messages,
            holdingForLater: categoryItems.holdingForLater,
            momCheckIn: parsedResult?.momCheckIn ?? FALLBACK_CHECK_IN,
            completed: {},
            taskMeta: parsedResult?.taskMeta,
            trackingItems: parsedResult?.trackingItems,
          };

      await saveLatestDump(merged);
      console.log('[ScreenshotReview] Saved merged dump — id:', merged.id);

      router.replace('/(tabs)/dump');
    } catch (err) {
      console.error('[ScreenshotReview] Save error:', err);
      setSaveError('Something went wrong saving. Try again.');
      setSaving(false);
    }
  }, [categoryItems, parsedResult, totalItems, router]);

  const handleDiscard = useCallback(() => {
    console.log('[ScreenshotReview] "Discard" pressed');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  if (!parsedResult) {
    return (
      <View style={[styles.flex, styles.centered]}>
        <Text style={styles.errorText}>Could not load extracted tasks.</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8} style={styles.discardLink}>
          <Text style={styles.discardText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasAnyItems = totalItems > 0;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 20, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {'From '}
          <Text style={styles.subtitleBold}>{screenshotLabel}</Text>
          {' — edit or remove before saving'}
        </Text>
        <Text style={styles.privacyNote}>
          Images are processed for task extraction and not stored.
        </Text>

        {!hasAnyItems && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>All tasks removed. Nothing to save.</Text>
          </View>
        )}

        {/* Category sections with removable items */}
        {CATEGORIES.map((cat) => {
          const items = categoryItems[cat.key] ?? [];
          if (items.length === 0) return null;
          const badgeBg = cat.accentColor + '33';
          return (
            <View key={cat.key} style={styles.categoryCard}>
              <View style={[styles.accentBorder, { backgroundColor: cat.accentColor }]} />
              <View style={styles.categoryHeader}>
                <View style={styles.categoryTitleRow}>
                  <View style={[styles.dot, { backgroundColor: cat.accentColor }]} />
                  <Text style={styles.categoryTitle}>{cat.title}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.badgeText, { color: cat.accentColor }]}>{items.length}</Text>
                </View>
              </View>
              <View style={styles.itemsList}>
                {items.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <View style={[styles.bullet, { backgroundColor: cat.accentColor }]} />
                    <Text style={styles.itemText}>{item}</Text>
                    <View style={styles.screenshotChip}>
                      <Text style={styles.screenshotChipText}>📷</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveItem(cat.key, index)}
                      activeOpacity={0.7}
                      accessibilityLabel="Remove task"
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Save error */}
        {saveError !== null && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.saveButton, (!hasAnyItems || saving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasAnyItems || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <View style={styles.saveButtonInner}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Saving…</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>Save to My Lists  ✦</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDiscard} activeOpacity={0.7} style={styles.discardLink}>
          <Text style={styles.discardText}>Discard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    paddingHorizontal: 20,
    gap: 14,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 22,
  },
  subtitleBold: {
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  privacyNote: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: -4,
  },
  emptyState: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  // Category card
  categoryCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    paddingLeft: 22,
    overflow: 'hidden',
  },
  accentBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryTitle: {
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 22,
  },
  screenshotChip: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  screenshotChipText: {
    fontSize: 13,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  removeButtonText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'Nunito_700Bold',
    lineHeight: 14,
  },
  // Error
  errorBox: {
    backgroundColor: '#C8846022',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C8846044',
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: '#C08060',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saveButtonText: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  discardLink: {
    paddingVertical: 4,
  },
  discardText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
