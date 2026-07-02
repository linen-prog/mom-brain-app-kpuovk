import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { getLatestDump, getDumpHistory, OrganizedDump, TrackingItem } from '@/utils/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryKey = 'doToday' | 'thisWeek' | 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work';
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

interface CategoryMeta {
  label: string;
  subtitle: string;
  color: string;
  icon: FeatherIconName;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES: CategoryKey[] = ['doToday', 'thisWeek', 'kids', 'home', 'errands', 'meals', 'messages', 'work'];

const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  kids:     { label: 'Kids & School',  subtitle: 'Field trip, forms, schedules',       color: '#E8A0A0', icon: 'users' },
  home:     { label: 'Home & Life',    subtitle: 'Groceries, cleaning, errands',        color: '#F5C842', icon: 'shopping-bag' },
  errands:  { label: 'Errands',        subtitle: 'Pickups, returns, stops',             color: '#8FBC8F', icon: 'map-pin' },
  meals:    { label: 'Meals',          subtitle: 'Dinner, snacks, groceries',           color: '#F4A460', icon: 'coffee' },
  messages: { label: 'Messages',       subtitle: 'Texts, emails, follow-ups',           color: '#87CEEB', icon: 'message-circle' },
  doToday:  { label: 'Do Today',       subtitle: 'Urgent, time-sensitive',              color: '#E8A0A0', icon: 'clock' },
  thisWeek: { label: 'Plans & Events', subtitle: 'Practices, birthdays, appointments',  color: '#C8A8E8', icon: 'calendar' },
  work:     { label: 'Work',           subtitle: 'Deadlines, meetings, tasks',          color: '#A8C8E8', icon: 'briefcase' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CategorySection({
  meta,
  items,
}: {
  meta: CategoryMeta;
  items: string[];
}) {
  const bg = meta.color + '22';
  const border = meta.color + '55';
  const isEmpty = items.length === 0;

  return (
    <View style={[styles.section, { borderColor: border }]}>
      <View style={[styles.sectionHeader, { backgroundColor: bg }]}>
        <View style={[styles.sectionIconCircle, { backgroundColor: meta.color + '33' }]}>
          <Feather name={meta.icon} size={18} color={meta.color} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{meta.label}</Text>
          <Text style={styles.sectionSubtitle}>{meta.subtitle}</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: meta.color + '44' }]}>
          <Text style={styles.countBadgeText}>{items.length}</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>
        {isEmpty ? (
          <Text style={styles.emptyHint}>Nothing here yet</Text>
        ) : (
          items.map((item, idx) => (
            <View key={idx} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: meta.color }]} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function TrackingSection({ items }: { items: TrackingItem[] }) {
  const color = '#F5C842';
  const isEmpty = items.length === 0;

  return (
    <View style={[styles.section, { borderColor: color + '55' }]}>
      <View style={[styles.sectionHeader, { backgroundColor: color + '22' }]}>
        <View style={[styles.sectionIconCircle, { backgroundColor: color + '33' }]}>
          <Feather name="eye" size={18} color={color} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Things You're Tracking</Text>
          <Text style={styles.sectionSubtitle}>Watching, not doing</Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: color + '44' }]}>
          <Text style={styles.countBadgeText}>{items.length}</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>
        {isEmpty ? (
          <Text style={styles.emptyHint}>Nothing here yet</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: color }]} />
              <Text style={styles.bulletText}>{item.text}</Text>
              {item.dueDate ? (
                <View style={[styles.dueDateChip, { backgroundColor: color + '44' }]}>
                  <Text style={styles.dueDateText}>{item.dueDate}</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dumpId } = useLocalSearchParams<{ dumpId?: string }>();
  const [dump, setDump] = useState<OrganizedDump | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[CategoryDetail] loading dump — dumpId param:', dumpId);
    async function load() {
      if (dumpId) {
        const history = await getDumpHistory();
        const found = history.find((d) => d.id === dumpId);
        if (found) {
          console.log('[CategoryDetail] found dump in history:', found.id);
          setDump(found);
          setLoading(false);
          return;
        }
      }
      // Fall back to latest
      const latest = await getLatestDump();
      console.log('[CategoryDetail] using latest dump:', latest?.id ?? 'none');
      setDump(latest);
      setLoading(false);
    }
    load();
  }, [dumpId]);

  const handleBack = () => {
    console.log('[CategoryDetail] back button pressed');
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
            <Feather name="chevron-left" size={24} color={Colors.textMain} />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>All Categories</Text>
          <View style={styles.backButton} />
        </View>
      </View>
    );
  }

  if (!dump) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
            <Feather name="chevron-left" size={24} color={Colors.textMain} />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>All Categories</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No dump found. Head to Dump to get started.</Text>
        </View>
      </View>
    );
  }

  const trackingItems = dump.trackingItems ?? [];

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
          <Feather name="chevron-left" size={24} color={Colors.textMain} />
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>All Categories</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {ALL_CATEGORIES.map((cat) => {
          const items = dump[cat] ?? [];
          return (
            <CategorySection
              key={cat}
              meta={CATEGORY_META[cat]}
              items={items}
            />
          );
        })}
        <TrackingSection items={trackingItems} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
  },
  backLabel: {
    fontSize: 16,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textMain,
  },
  navTitle: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
  },
  countBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 28,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textBody,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    lineHeight: 20,
  },
  dueDateChip: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  dueDateText: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
