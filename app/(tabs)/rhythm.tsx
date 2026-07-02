import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { getLatestDump, OrganizedDump, TrackingItem } from '@/utils/storage';
import { EmptyState } from '@/components/EmptyState';

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

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange(createdAt: string): string {
  const dumpDate = new Date(createdAt);
  const dayOfWeek = dumpDate.getDay();
  const monday = new Date(dumpDate);
  monday.setDate(dumpDate.getDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monStr = `${MONTH_NAMES[monday.getMonth()]} ${monday.getDate()}`;
  const sunStr = `${MONTH_NAMES[sunday.getMonth()]} ${sunday.getDate()}`;
  return `${monStr} – ${sunStr}`;
}

function groupTrackingByDate(items: TrackingItem[]): { label: string; dayNum: string; items: TrackingItem[] }[] {
  const groups: Record<string, TrackingItem[]> = {};
  const order: string[] = [];
  items.forEach((item) => {
    const key = item.dueDate ?? 'No date';
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(item);
  });
  return order.map((key) => {
    let label = key;
    let dayNum = '';
    if (key !== 'No date') {
      const d = new Date(key);
      if (!isNaN(d.getTime())) {
        const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
        label = days[d.getDay()];
        dayNum = String(d.getDate());
      }
    }
    return { label, dayNum, items: groups[key] };
  });
}

function extractTimeFromText(text: string): { time: string; clean: string } {
  const match = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/);
  if (match) {
    return { time: match[1], clean: text.replace(match[0], '').trim().replace(/^[-–,\s]+|[-–,\s]+$/g, '') };
  }
  return { time: '', clean: text };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBubble({ color, icon, count, label }: { color: string; icon: FeatherIconName; count: number; label: string }) {
  const bg = color + '33';
  const border = color + '66';
  return (
    <View style={styles.statBubbleWrapper}>
      <View style={[styles.statBubble, { backgroundColor: bg, borderColor: border }]}>
        <Feather name={icon} size={16} color={color} />
        <Text style={[styles.statCount, { color: Colors.textMain }]}>{count}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CategoryRow({ meta, count }: { meta: CategoryMeta; count: number }) {
  const bg = meta.color + '33';
  const countText = `${count} item${count !== 1 ? 's' : ''}`;
  return (
    <View style={styles.categoryRow}>
      <View style={[styles.categoryIconCircle, { backgroundColor: bg }]}>
        <Feather name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.categoryRowText}>
        <Text style={styles.categoryRowTitle}>{meta.label}</Text>
        <Text style={styles.categoryRowSubtitle}>{meta.subtitle}</Text>
      </View>
      <Text style={styles.categoryCount}>{countText}</Text>
      <Feather name="chevron-right" size={16} color={Colors.textMuted} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RhythmScreen() {
  const insets = useSafeAreaInsets();
  const [dump, setDump] = useState<OrganizedDump | null>(null);

  useFocusEffect(
    useCallback(() => {
      console.log('[Rhythm] screen focused — loading latest dump');
      getLatestDump().then((d) => {
        setDump(d);
      });
    }, [])
  );

  const handleGoDump = useCallback(() => {
    console.log('[Rhythm] "Go to Dump" pressed from empty state');
  }, []);

  const handleThisWeekPill = useCallback(() => {
    console.log('[Rhythm] "This Week" pill pressed');
  }, []);

  const handleViewAllThemes = useCallback(() => {
    console.log('[Rhythm] "View all" themes pressed');
  }, []);

  const handleSeeCalendar = useCallback(() => {
    console.log('[Rhythm] "See calendar" pressed');
  }, []);

  const handleReview = useCallback(() => {
    console.log('[Rhythm] "Review" attention items pressed');
  }, []);

  // ── Empty state ──
  if (!dump) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Rhythm</Text>
              <Sparkles size={20} color={Colors.primaryDeepRose} style={styles.sparkleIcon} />
            </View>
            <TouchableOpacity style={styles.weekPill} onPress={handleThisWeekPill} activeOpacity={0.8}>
              <Text style={styles.weekPillText}>This Week</Text>
              <Feather name="chevron-down" size={14} color={Colors.textMain} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Your week at a glance</Text>
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

  // ── Derived data ──
  const totalTasks = ALL_CATEGORIES.reduce((sum, cat) => sum + (dump[cat]?.length ?? 0), 0);
  const completedCount = Object.values(dump.completed ?? {}).filter(Boolean).length;
  const eventsCount = dump.trackingItems?.length ?? 0;
  const momCheckInCount = dump.momCheckIn ? 1 : 0;
  const weekRange = getWeekRange(dump.createdAt);

  // Top themes
  const themesWithCounts = ALL_CATEGORIES
    .map((cat) => ({ cat, count: dump[cat]?.length ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Coming up
  const trackingItems = dump.trackingItems ?? [];
  const groupedTracking = groupTrackingByDate(trackingItems);

  // Needs your attention
  const attentionItems: string[] = [];
  if (dump.taskMeta) {
    dump.taskMeta.forEach((meta) => {
      if (meta.delegation === 'partner' || meta.isPartnerTask) {
        attentionItems.push(meta.taskText);
      }
    });
  }
  const messageItems = dump.messages ?? [];
  messageItems.forEach((msg) => {
    if (!attentionItems.includes(msg)) {
      attentionItems.push(msg);
    }
  });

  const momMessage = dump.momCheckIn || "You're doing a lot.";
  const momSubtitle = dump.momCheckIn
    ? dump.momCheckIn
    : "Mom Brain is here to help you carry less.";

  const tasksLabel = `${totalTasks}`;
  const eventsLabel = `${eventsCount}`;
  const checkInsLabel = `${momCheckInCount}`;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Rhythm</Text>
            <Sparkles size={20} color={Colors.primaryDeepRose} style={styles.sparkleIcon} />
          </View>
          <TouchableOpacity style={styles.weekPill} onPress={handleThisWeekPill} activeOpacity={0.8}>
            <Text style={styles.weekPillText}>This Week</Text>
            <Feather name="chevron-down" size={14} color={Colors.textMain} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Your week at a glance</Text>
      </View>

      {/* ── Snapshot card ── */}
      <View style={[styles.card, styles.snapshotCard]}>
        <Text style={styles.cardTitle}>This week's snapshot</Text>
        <Text style={styles.weekRangeText}>{weekRange}</Text>
        <View style={styles.statRow}>
          <StatBubble color={Colors.primaryDeepRose} icon="check-circle" count={Number(tasksLabel)} label="Tasks captured" />
          <StatBubble color={Colors.honey} icon="calendar" count={Number(eventsLabel)} label="Events planned" />
          <StatBubble color={Colors.lavender} icon="heart" count={Number(checkInsLabel)} label="Mom check-ins" />
        </View>
      </View>

      {/* ── Top themes card ── */}
      {themesWithCounts.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Top themes this week</Text>
            <TouchableOpacity onPress={handleViewAllThemes} activeOpacity={0.7}>
              <Text style={styles.linkText}>View all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoryList}>
            {themesWithCounts.map(({ cat, count }, idx) => (
              <View key={cat}>
                <CategoryRow meta={CATEGORY_META[cat]} count={count} />
                {idx < themesWithCounts.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Coming up card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Coming up</Text>
          <TouchableOpacity onPress={handleSeeCalendar} activeOpacity={0.7}>
            <Text style={styles.linkText}>See calendar</Text>
          </TouchableOpacity>
        </View>
        {trackingItems.length === 0 ? (
          <Text style={styles.emptyHint}>No upcoming events yet.</Text>
        ) : (
          <View style={styles.comingUpList}>
            {groupedTracking.map((group, gi) => (
              <View key={gi} style={styles.comingUpGroup}>
                <View style={styles.comingUpDateCol}>
                  <Text style={styles.comingUpDayLabel}>{group.label}</Text>
                  {group.dayNum.length > 0 && (
                    <Text style={styles.comingUpDayNum}>{group.dayNum}</Text>
                  )}
                </View>
                <View style={styles.comingUpItems}>
                  {group.items.map((item, ii) => {
                    const parsed = extractTimeFromText(item.text);
                    const dotColor = ii % 2 === 0 ? Colors.primaryDeepRose : Colors.lavender;
                    return (
                      <View key={ii} style={styles.comingUpItem}>
                        <View style={[styles.comingUpDot, { backgroundColor: dotColor }]} />
                        <View>
                          <Text style={styles.comingUpItemText}>{parsed.clean}</Text>
                          {parsed.time.length > 0 && (
                            <Text style={styles.comingUpItemTime}>{parsed.time}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Needs your attention card ── */}
      {attentionItems.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Needs your attention</Text>
            <TouchableOpacity onPress={handleReview} activeOpacity={0.7}>
              <Text style={styles.linkText}>Review</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.attentionList}>
            {attentionItems.slice(0, 5).map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.attentionRow}
                activeOpacity={0.75}
                onPress={() => console.log('[Rhythm] attention item pressed:', item)}
              >
                <View style={styles.attentionIconCircle}>
                  <Feather name="mail" size={16} color={Colors.primaryDeepRose} />
                </View>
                <Text style={styles.attentionItemText} numberOfLines={2}>{item}</Text>
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Mom message card ── */}
      <View style={[styles.card, styles.momCard]}>
        <View style={styles.momCardInner}>
          <View style={styles.momIconCircle}>
            <Feather name="heart" size={20} color={Colors.primaryDeepRose} />
          </View>
          <View style={styles.momCardText}>
            <Text style={styles.momCardTitle}>You're doing a lot.</Text>
            <Text style={styles.momCardSubtitle}>{momSubtitle}</Text>
          </View>
        </View>
        <View style={styles.momSparkleCorner}>
          <Sparkles size={16} color={Colors.primaryBlush} />
        </View>
      </View>
    </ScrollView>
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
    gap: 14,
  },
  header: {
    gap: 4,
    marginBottom: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 34,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    letterSpacing: -0.5,
  },
  sparkleIcon: {
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
  },
  weekPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  weekPillText: {
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  // ── Cards ──
  card: {
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
    gap: 12,
  },
  snapshotCard: {
    backgroundColor: Colors.primaryBlush + '44',
    borderColor: Colors.primaryBlush,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  linkText: {
    fontSize: 14,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
  },
  weekRangeText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    marginTop: -6,
  },
  // ── Stat bubbles ──
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  statBubbleWrapper: {
    alignItems: 'center',
    gap: 8,
  },
  statBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statCount: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    textAlign: 'center',
    maxWidth: 72,
  },
  // ── Category rows ──
  categoryList: {
    gap: 0,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRowText: {
    flex: 1,
    gap: 2,
  },
  categoryRowTitle: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  categoryRowSubtitle: {
    fontSize: 12,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
  },
  categoryCount: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 52,
  },
  // ── Coming up ──
  comingUpList: {
    gap: 14,
  },
  comingUpGroup: {
    flexDirection: 'row',
    gap: 14,
  },
  comingUpDateCol: {
    width: 40,
    alignItems: 'center',
  },
  comingUpDayLabel: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
    letterSpacing: 0.5,
  },
  comingUpDayNum: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
    lineHeight: 26,
  },
  comingUpItems: {
    flex: 1,
    gap: 10,
  },
  comingUpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  comingUpDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  comingUpItemText: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    lineHeight: 20,
  },
  comingUpItemTime: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    marginTop: 1,
  },
  emptyHint: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  // ── Attention ──
  attentionList: {
    gap: 2,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  attentionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryBlush + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionItemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    lineHeight: 20,
  },
  // ── Mom card ──
  momCard: {
    backgroundColor: Colors.primaryBlush + '44',
    borderColor: Colors.primaryBlush,
    position: 'relative',
    overflow: 'hidden',
  },
  momCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  momIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryDeepRose + '22',
    borderWidth: 1,
    borderColor: Colors.primaryDeepRose + '44',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  momCardText: {
    flex: 1,
    gap: 4,
  },
  momCardTitle: {
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  momCardSubtitle: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 20,
  },
  momSparkleCorner: {
    position: 'absolute',
    top: 14,
    right: 14,
    opacity: 0.6,
  },
});
