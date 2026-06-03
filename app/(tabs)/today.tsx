import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Sun } from 'lucide-react-native';
import { Colors, CategoryColors } from '@/constants/Colors';
import { getLatestDump, updateCompleted, OrganizedDump } from '@/utils/storage';
import { RoundedCheckbox } from '@/components/RoundedCheckbox';
import { EmptyState } from '@/components/EmptyState';

function ChecklistItem({
  item,
  index,
  checked,
  onToggle,
}: {
  item: string;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[styles.checkItem, { opacity, transform: [{ translateY }] }]}>
      <RoundedCheckbox checked={checked} onToggle={onToggle} />
      <Text
        style={[
          styles.checkItemText,
          checked && styles.checkItemTextDone,
        ]}
      >
        {item}
      </Text>
    </Animated.View>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dump, setDump] = useState<OrganizedDump | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      console.log('[Today] screen focused — loading latest dump');
      getLatestDump().then((d) => {
        if (d) {
          setDump(d);
          setCompleted(d.completed ?? {});
        } else {
          setDump(null);
          setCompleted({});
        }
      });
    }, [])
  );

  const handleToggle = useCallback(
    async (index: number) => {
      const key = `doToday:${index}`;
      const newValue = !completed[key];
      console.log('[Today] checkbox toggled —', key, '=', newValue);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCompleted((prev) => ({ ...prev, [key]: newValue }));
      await updateCompleted(key, newValue);
    },
    [completed]
  );

  const handleGoDump = useCallback(() => {
    console.log('[Today] "Go to Dump" pressed');
    router.push('/(tabs)/dump');
  }, [router]);

  const hasDump = dump !== null;
  const hasItems = hasDump && dump.doToday.length > 0;

  if (!hasDump || !hasItems) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Today's Flow</Text>
          <Text style={styles.subtitle}>The next right things, not everything.</Text>
        </View>
        <EmptyState
          icon={<Sun size={32} color={Colors.primaryBlush} />}
          headline="Nothing here yet"
          body="Head to Dump and let it all out. I'll find what matters today."
          ctaLabel="Go to Dump"
          onCta={handleGoDump}
        />
      </View>
    );
  }

  const doneCount = dump.doToday.filter((_, i) => completed[`doToday:${i}`]).length;
  const totalCount = dump.doToday.length;
  const thisWeekVisible = dump.thisWeek.slice(0, 3);
  const thisWeekExtra = dump.thisWeek.length - 3;

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
      <Text style={styles.title}>Today's Flow</Text>
      <Text style={styles.subtitle}>The next right things, not everything.</Text>

      {/* Progress hint */}
      <Text style={styles.progressHint}>
        {doneCount}
        {' of '}
        {totalCount}
        {' done'}
      </Text>

      {/* Encouragement card */}
      <View style={styles.encourageCard}>
        <View style={styles.encourageBorder} />
        <Text style={styles.encourageText}>Start with one visible win.</Text>
        <Text style={styles.encourageBody}>You're not behind. You're carrying a lot.</Text>
      </View>

      {/* Checklist */}
      <View style={styles.checklist}>
        {dump.doToday.map((item, index) => (
          <ChecklistItem
            key={index}
            item={item}
            index={index}
            checked={!!completed[`doToday:${index}`]}
            onToggle={() => handleToggle(index)}
          />
        ))}
      </View>

      {/* This week preview — quiet secondary treatment */}
      {dump.thisWeek.length > 0 && (
        <View style={styles.thisWeekSection}>
          <View style={styles.thisWeekDivider} />
          <Text style={styles.thisWeekLabel}>LATER THIS WEEK</Text>
          {thisWeekVisible.map((item, i) => (
            <View key={i} style={styles.thisWeekRow}>
              <View style={[styles.thisWeekDot, { backgroundColor: CategoryColors.thisWeek }]} />
              <Text style={styles.thisWeekItem}>{item}</Text>
            </View>
          ))}
          {thisWeekExtra > 0 && (
            <Text style={styles.thisWeekMore}>
              {'+ '}
              {thisWeekExtra}
              {' more'}
            </Text>
          )}
        </View>
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
    gap: 14,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
  },
  progressHint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    marginTop: -4,
  },
  encourageCard: {
    backgroundColor: Colors.sage + '18',
    borderRadius: 16,
    padding: 16,
    paddingLeft: 20,
    borderWidth: 1,
    borderColor: Colors.sage + '44',
    overflow: 'hidden',
  },
  encourageBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.sage,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  encourageText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMain,
    fontFamily: 'Nunito_600SemiBold',
    lineHeight: 22,
  },
  encourageBody: {
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    marginTop: 4,
  },
  checklist: {
    gap: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    boxShadow: '0 1px 2px rgba(63, 49, 44, 0.04)',
  } as object,
  checkItemText: {
    flex: 1,
    fontSize: 15,
    color: Colors.textMain,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
  },
  checkItemTextDone: {
    color: Colors.sage,
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  thisWeekSection: {
    marginTop: 4,
    gap: 8,
  },
  thisWeekDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 4,
  },
  thisWeekLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 1,
  },
  thisWeekRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  thisWeekDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    flexShrink: 0,
  },
  thisWeekItem: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
    flex: 1,
  },
  thisWeekMore: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    marginLeft: 14,
  },
});
