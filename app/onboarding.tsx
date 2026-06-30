import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { setOnboardingDone } from '@/utils/storage';

const STAGES = [
  { id: 'newborn', label: 'Newborn / Baby', emoji: '🍼' },
  { id: 'toddler', label: 'Toddler', emoji: '🧸' },
  { id: 'school', label: 'School-age', emoji: '🎒' },
  { id: 'teen', label: 'Teen', emoji: '🎧' },
  { id: 'just_me', label: 'No kids yet / Just me', emoji: '✨' },
];

const KID_STAGES_KEY = 'mombrain.kidStages';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleStage = useCallback((id: string) => {
    console.log('[Onboarding] Stage chip toggled:', id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleGetStarted = useCallback(async () => {
    console.log('[Onboarding] "Get Started" pressed — selected stages:', Array.from(selected));
    await AsyncStorage.setItem(KID_STAGES_KEY, JSON.stringify(Array.from(selected)));
    await setOnboardingDone();
    router.replace('/(tabs)/dump');
  }, [selected, router]);

  const handleSkip = useCallback(async () => {
    console.log('[Onboarding] "Skip" pressed');
    await setOnboardingDone();
    router.replace('/(tabs)/dump');
  }, [router]);

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip link */}
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heart decoration */}
        <Text style={styles.heartDecor}>♡</Text>

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Welcome to Mom Brain</Text>
          <Text style={styles.titleHeart}> ♡</Text>
        </View>
        <Text style={styles.subtitle}>
          Built for the mental load you carry every day.
        </Text>

        {/* Stage selection */}
        <View style={styles.stageSection}>
          <Text style={styles.stageQuestion}>What stage are your kids at?</Text>
          <Text style={styles.stageHint}>Select all that apply</Text>

          <View style={styles.stageGrid}>
            {STAGES.map((stage) => {
              const isSelected = selected.has(stage.id);
              return (
                <Pressable
                  key={stage.id}
                  style={({ pressed }) => [
                    styles.stageChip,
                    isSelected && styles.stageChipSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => toggleStage(stage.id)}
                >
                  <Text style={styles.stageEmoji}>{stage.emoji}</Text>
                  <Text style={[styles.stageLabel, isSelected && styles.stageLabelSelected]}>
                    {stage.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.stageFootnote}>
            These help me show you the most relevant examples.
          </Text>
        </View>

        {/* Get Started button */}
        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={handleGetStarted}
          activeOpacity={0.85}
        >
          <Text style={styles.getStartedText}>Get Started  ✦</Text>
        </TouchableOpacity>

        {/* Warm footer */}
        <View style={styles.footer}>
          <Text style={styles.footerHeart}>♥</Text>
          <Text style={styles.footerText}>You're in the right place.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 15,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 20,
  },
  heartDecor: {
    fontSize: 48,
    color: Colors.primaryDeepRose + '44',
    fontFamily: 'Nunito_700Bold',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  titleHeart: {
    fontSize: 26,
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textBody,
    textAlign: 'center',
    lineHeight: 25,
    maxWidth: 300,
    marginTop: -8,
  },
  stageSection: {
    width: '100%',
    gap: 12,
    marginTop: 8,
  },
  stageQuestion: {
    fontSize: 20,
    fontFamily: 'Nunito_700Bold',
    color: Colors.textMain,
    textAlign: 'center',
  },
  stageHint: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -4,
  },
  stageGrid: {
    gap: 10,
    marginTop: 4,
  },
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  stageChipSelected: {
    borderColor: Colors.primaryDeepRose,
    backgroundColor: Colors.primaryDeepRose + '14',
  },
  stageEmoji: {
    fontSize: 22,
  },
  stageLabel: {
    fontSize: 16,
    fontFamily: 'Nunito_500Medium',
    color: Colors.textMain,
  },
  stageLabelSelected: {
    fontFamily: 'Nunito_700Bold',
    color: Colors.primaryDeepRose,
  },
  stageFootnote: {
    fontSize: 13,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  getStartedButton: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 20,
    paddingVertical: 17,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
    marginTop: 8,
  },
  getStartedText: {
    fontSize: 18,
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  footerHeart: {
    fontSize: 14,
    color: Colors.primaryDeepRose,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Nunito_400Regular',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
