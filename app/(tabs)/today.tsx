import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Sun, Check } from 'lucide-react-native';
import { Colors, CategoryColors } from '@/constants/Colors';
import { getLatestDump, updateCompleted, addItemToCategory, OrganizedDump } from '@/utils/storage';
import { EmptyState } from '@/components/EmptyState';
import { Toast } from '@/components/Toast';

const DONE_PHRASES = [
  "Done. One less thing.",
  "Off the list.",
  "That one's handled.",
  "You did that.",
];

function CircleCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const scale = useRef(new Animated.Value(checked ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: checked ? 1 : 0,
      useNativeDriver: true,
      speed: 40,
      bounciness: 8,
    }).start();
  }, [checked, scale]);

  return (
    <Pressable
      onPress={onToggle}
      style={[circleStyles.circle, checked && circleStyles.circleChecked]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Check size={13} color="#FFFFFF" strokeWidth={3} />
      </Animated.View>
    </Pressable>
  );
}

const circleStyles = StyleSheet.create({
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circleChecked: {
    backgroundColor: Colors.primaryDeepRose,
    borderColor: Colors.primaryDeepRose,
  },
});

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dump, setDump] = useState<OrganizedDump | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add task modal
  const [addTaskModal, setAddTaskModal] = useState<{ category: 'doToday' | 'thisWeek' } | null>(null);
  const [addTaskText, setAddTaskText] = useState('');
  const [addTaskLoading, setAddTaskLoading] = useState(false);

  // Category detail modal
  const [categoryModal, setCategoryModal] = useState<{
    key: 'kids' | 'home' | 'errands' | 'meals' | 'messages' | 'work';
    label: string;
    color: string;
  } | null>(null);

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
      if (newValue) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const phrase = DONE_PHRASES[index % DONE_PHRASES.length];
        console.log('[Today] item checked — showing toast:', phrase);
        setToastMessage(phrase);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setCompleted((prev) => ({ ...prev, [key]: newValue }));
      await updateCompleted(key, newValue);
    },
    [completed]
  );

  const handleToggleThisWeek = useCallback(
    async (index: number) => {
      const key = `thisWeek:${index}`;
      const newValue = !completed[key];
      console.log('[Today] thisWeek checkbox toggled —', key, '=', newValue);
      if (newValue) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setToastMessage(DONE_PHRASES[index % DONE_PHRASES.length]);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setCompleted((prev) => ({ ...prev, [key]: newValue }));
      await updateCompleted(key, newValue);
    },
    [completed]
  );

  const handleToggleCategory = useCallback(
    async (catKey: string, index: number) => {
      const key = `${catKey}:${index}`;
      const newValue = !completed[key];
      console.log('[Today] category checkbox toggled —', key, '=', newValue);
      if (newValue) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setToastMessage(DONE_PHRASES[index % DONE_PHRASES.length]);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setCompleted((prev) => ({ ...prev, [key]: newValue }));
      await updateCompleted(key, newValue);
    },
    [completed]
  );

  const handleAddTask = useCallback(async () => {
    if (!addTaskModal || !addTaskText.trim()) return;
    console.log('[Today] add task pressed — category:', addTaskModal.category, 'text:', addTaskText.trim());
    setAddTaskLoading(true);
    const updated = await addItemToCategory(addTaskModal.category, addTaskText.trim());
    if (updated) {
      setDump(updated);
      setCompleted(updated.completed ?? {});
    }
    setAddTaskText('');
    setAddTaskModal(null);
    setAddTaskLoading(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [addTaskModal, addTaskText]);

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
          <View style={styles.titleRow}>
            <Text style={styles.title}>Today</Text>
            <Text style={styles.titleHeart}> ♡</Text>
          </View>
          <Text style={styles.subtitle}>You've got this, one step at a time.</Text>
        </View>
        <EmptyState
          icon={<Sun size={32} color={Colors.primaryBlush} />}
          headline="Nothing here yet"
          body="When you're ready, head to Dump and say what's on your mind. I'll find what matters today."
          ctaLabel="Go to Dump"
          onCta={handleGoDump}
        />
      </View>
    );
  }

  const doneCount = dump.doToday.filter((_, i) => completed[`doToday:${i}`]).length;
  const totalCount = dump.doToday.length;
  const allDone = doneCount === totalCount && totalCount > 0;

  const progressText = allDone ? "All done. You can rest now." : `${doneCount} of ${totalCount} done`;

  const forYouHeading = (() => {
    if (allDone) return "You did it.";
    if (doneCount >= 2) return "You're moving.";
    if (doneCount === 1) return "One thing done.";
    return "You're doing an amazing job.";
  })();

  const forYouBody = (() => {
    if (allDone) return "All of it. Rest is next — you've earned it.";
    if (doneCount >= 2) return "That counts. Every single thing you handle matters.";
    if (doneCount === 1) return "That's real. Keep going at your own pace.";
    return "You're holding so much and showing up in so many ways. Focus on what matters most today — that's more than enough.";
  })();

  const cats = [
    { key: 'kids' as const, label: 'Kids', items: dump.kids ?? [], color: CategoryColors.kids },
    { key: 'home' as const, label: 'Home', items: dump.home ?? [], color: CategoryColors.home },
    { key: 'errands' as const, label: 'Errands', items: dump.errands ?? [], color: CategoryColors.errands },
    { key: 'meals' as const, label: 'Meals', items: dump.meals ?? [], color: CategoryColors.meals },
    { key: 'messages' as const, label: 'Messages', items: dump.messages ?? [], color: CategoryColors.messages },
    { key: 'work' as const, label: 'Work', items: dump.work ?? [], color: Colors.lavender },
  ].filter(c => c.items.length > 0);

  const catRows: typeof cats[] = [];
  for (let i = 0; i < cats.length; i += 2) {
    catRows.push(cats.slice(i, i + 2));
  }

  const addTaskCategoryLabel = addTaskModal?.category === 'doToday' ? 'Do Today' : 'This Week';

  return (
    <View style={styles.flex}>
      <Toast message={toastMessage} />
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
          <Text style={styles.title}>Today</Text>
          <Text style={styles.titleHeart}> ♡</Text>
        </View>
        <Text style={styles.subtitle}>You've got this, one step at a time.</Text>

        {/* Progress hint */}
        <Text style={styles.progressHint}>{progressText}</Text>

        {/* FOR YOU card */}
        <View style={styles.forYouCard}>
          <View style={styles.forYouAccent} />
          <Text style={styles.forYouLabel}>FOR YOU</Text>
          <View style={styles.forYouHeadingRow}>
            <Text style={styles.forYouHeading}>{forYouHeading}</Text>
            <Text style={styles.forYouHeadingHeart}> ♡</Text>
          </View>
          <Text style={styles.forYouBody}>{forYouBody}</Text>
          <View style={styles.forYouFooter}>
            <Text style={styles.forYouFooterHeart}>♥</Text>
            <Text style={styles.forYouFooterText}>Breathe in. You're not behind.</Text>
          </View>
        </View>

        {/* Do Today card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <View style={styles.sectionCardTitleRow}>
              <View style={[styles.sectionDot, { backgroundColor: Colors.primaryDeepRose }]} />
              <Text style={styles.sectionCardTitle}>Do Today</Text>
            </View>
            <View style={[styles.countPill, { backgroundColor: Colors.primaryDeepRose + '22' }]}>
              <Text style={[styles.countPillText, { color: Colors.primaryDeepRose }]}>{totalCount}</Text>
            </View>
          </View>

          {dump.doToday.map((item, index) => (
            <View key={index}>
              {index > 0 && <View style={styles.rowDivider} />}
              <View style={styles.taskRow}>
                <CircleCheckbox
                  checked={!!completed[`doToday:${index}`]}
                  onToggle={() => handleToggle(index)}
                />
                <Text style={[styles.taskText, completed[`doToday:${index}`] && styles.taskTextDone]}>
                  {item}
                </Text>
              </View>
            </View>
          ))}

          <Pressable
            style={({ pressed }) => [styles.addTaskRow, pressed && { opacity: 0.7 }]}
            onPress={() => {
              console.log('[Today] "+ Add a task" pressed — category: doToday');
              setAddTaskText('');
              setAddTaskModal({ category: 'doToday' });
            }}
          >
            <Text style={styles.addTaskText}>+ Add a task</Text>
          </Pressable>
        </View>

        {/* This Week card */}
        {dump.thisWeek.length > 0 && (
          <>
            <Text style={styles.thisWeekPermission}>These are waiting. They don't need you today.</Text>
            <View style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <View style={styles.sectionCardTitleRow}>
                  <View style={[styles.sectionDot, { backgroundColor: CategoryColors.thisWeek }]} />
                  <Text style={styles.sectionCardTitle}>This Week</Text>
                </View>
                <View style={[styles.countPill, { backgroundColor: CategoryColors.thisWeek + '22' }]}>
                  <Text style={[styles.countPillText, { color: CategoryColors.thisWeek }]}>{dump.thisWeek.length}</Text>
                </View>
              </View>

              {dump.thisWeek.map((item, index) => (
                <View key={index}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <View style={styles.taskRow}>
                    <CircleCheckbox
                      checked={!!completed[`thisWeek:${index}`]}
                      onToggle={() => handleToggleThisWeek(index)}
                    />
                    <Text style={[styles.taskText, completed[`thisWeek:${index}`] && styles.taskTextDone]}>
                      {item}
                    </Text>
                  </View>
                </View>
              ))}

              <Pressable
                style={({ pressed }) => [styles.addTaskRow, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  console.log('[Today] "+ Add a task" pressed — category: thisWeek');
                  setAddTaskText('');
                  setAddTaskModal({ category: 'thisWeek' });
                }}
              >
                <Text style={styles.addTaskText}>+ Add a task</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Category mini-cards */}
        {cats.length > 0 && (
          <View style={styles.categoryGrid}>
            {catRows.map((row, ri) => (
              <View key={ri} style={styles.categoryRow}>
                {row.map(cat => {
                  const previewText = cat.items.slice(0, 2).join(', ');
                  return (
                    <Pressable
                      key={cat.key}
                      style={({ pressed }) => [styles.categoryMiniCard, pressed && { opacity: 0.85 }]}
                      onPress={() => {
                        console.log('[Today] category card pressed —', cat.key);
                        setCategoryModal({ key: cat.key, label: cat.label, color: cat.color });
                      }}
                    >
                      <View style={styles.categoryMiniHeader}>
                        <View style={[styles.categoryMiniDot, { backgroundColor: cat.color }]} />
                        <Text style={styles.categoryMiniTitle}>{cat.label}</Text>
                        <View style={[styles.countPill, { backgroundColor: cat.color + '22', marginLeft: 'auto' as const }]}>
                          <Text style={[styles.countPillText, { color: cat.color }]}>{cat.items.length}</Text>
                        </View>
                      </View>
                      <Text style={styles.categoryMiniPreview} numberOfLines={2}>
                        {previewText}
                      </Text>
                      <View style={styles.categoryMiniFooter}>
                        <Text style={[styles.categoryMiniChevron, { color: cat.color }]}>›</Text>
                      </View>
                    </Pressable>
                  );
                })}
                {row.length === 1 && <View style={styles.categoryMiniCardEmpty} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={addTaskModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setAddTaskModal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setAddTaskModal(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              Add to {addTaskCategoryLabel}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="What do you need to do?"
              placeholderTextColor={Colors.textMuted}
              value={addTaskText}
              onChangeText={setAddTaskText}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddTask}
              multiline={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  console.log('[Today] add task modal — cancel pressed');
                  setAddTaskModal(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (!addTaskText.trim() || addTaskLoading) && styles.modalConfirmDisabled]}
                onPress={handleAddTask}
                disabled={!addTaskText.trim() || addTaskLoading}
              >
                <Text style={styles.modalConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category Detail Modal */}
      {categoryModal && dump && (
        <Modal
          visible={categoryModal !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setCategoryModal(null)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setCategoryModal(null)} />
            <View style={[styles.modalSheet, styles.categoryModalSheet]}>
              <View style={styles.modalHandle} />
              {/* Header */}
              <View style={styles.categoryModalHeader}>
                <View style={[styles.categoryMiniDot, { backgroundColor: categoryModal.color, width: 14, height: 14, borderRadius: 7 }]} />
                <Text style={styles.categoryModalTitle}>{categoryModal.label}</Text>
                <Pressable
                  onPress={() => {
                    console.log('[Today] category modal closed —', categoryModal.label);
                    setCategoryModal(null);
                  }}
                  style={styles.categoryModalClose}
                >
                  <Text style={styles.categoryModalCloseText}>✕</Text>
                </Pressable>
              </View>
              {/* Items */}
              <ScrollView showsVerticalScrollIndicator={false} style={styles.categoryModalScroll}>
                {((dump[categoryModal.key as keyof OrganizedDump] as string[]) ?? []).length === 0 ? (
                  <Text style={styles.categoryModalEmpty}>Nothing here yet.</Text>
                ) : (
                  ((dump[categoryModal.key as keyof OrganizedDump] as string[]) ?? []).map((item: string, index: number) => {
                    const key = `${categoryModal.key}:${index}`;
                    const isChecked = !!completed[key];
                    return (
                      <View key={index}>
                        {index > 0 && <View style={styles.rowDivider} />}
                        <View style={styles.taskRow}>
                          <CircleCheckbox
                            checked={isChecked}
                            onToggle={() => handleToggleCategory(categoryModal.key, index)}
                          />
                          <Text style={[styles.taskText, isChecked && styles.taskTextDone]}>
                            {item}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
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
  },
  progressHint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    marginTop: -8,
  },
  // FOR YOU card
  forYouCard: {
    backgroundColor: Colors.primaryBlush + '18',
    borderRadius: 20,
    padding: 18,
    paddingLeft: 22,
    borderWidth: 1,
    borderColor: Colors.primaryBlush + '40',
    overflow: 'hidden',
  },
  forYouAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.primaryDeepRose,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  forYouLabel: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  forYouHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  forYouHeading: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    lineHeight: 26,
  },
  forYouHeadingHeart: {
    fontSize: 18,
    color: Colors.primaryDeepRose,
  },
  forYouBody: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 22,
    marginBottom: 12,
  },
  forYouFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  forYouFooterHeart: {
    fontSize: 14,
    color: Colors.primaryDeepRose,
  },
  forYouFooterText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.primaryDeepRose,
    fontStyle: 'italic',
  },
  // Section cards (Do Today / This Week)
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
    marginBottom: 0,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sectionCardTitle: {
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  countPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillText: {
    fontSize: 13,
    fontFamily: 'Nunito_700Bold',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
  },
  taskText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
    lineHeight: 22,
  },
  taskTextDone: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 0,
  },
  addTaskRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addTaskText: {
    fontSize: 14,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.primaryDeepRose,
  },
  // This Week permission text
  thisWeekPermission: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginBottom: -4,
  },
  // Category grid
  categoryGrid: {
    gap: 10,
    marginTop: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryMiniCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryMiniCardEmpty: {
    flex: 1,
  },
  categoryMiniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  categoryMiniDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryMiniTitle: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
  },
  categoryMiniPreview: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    lineHeight: 18,
    flex: 1,
  },
  categoryMiniFooter: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  categoryMiniChevron: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
  },
  // Modal styles
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
    gap: 16,
  },
  categoryModalSheet: {
    maxHeight: '75%',
    paddingBottom: 32,
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
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 16,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMain,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalCancel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  modalConfirm: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.primaryDeepRose,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmDisabled: {
    opacity: 0.45,
  },
  modalConfirmText: {
    fontSize: 15,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
  },
  // Category modal
  categoryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  categoryModalTitle: {
    fontSize: 22,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    flex: 1,
  },
  categoryModalClose: {
    padding: 4,
  },
  categoryModalCloseText: {
    fontSize: 16,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
  },
  categoryModalEmpty: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 20,
    textAlign: 'center',
  },
  categoryModalScroll: {
    flexGrow: 0,
  },
});
