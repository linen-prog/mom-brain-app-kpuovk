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
import { Home } from 'lucide-react-native';
import { Colors, CategoryColors } from '@/constants/Colors';
import { getLatestDump, OrganizedDump } from '@/utils/storage';
import { CategorySection } from '@/components/CategorySection';
import { EmptyState } from '@/components/EmptyState';

function FadeInSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [dump, setDump] = useState<OrganizedDump | null>(null);

  useFocusEffect(
    useCallback(() => {
      console.log('[Family] screen focused — loading latest dump');
      getLatestDump().then((d) => {
        setDump(d);
      });
    }, [])
  );

  const handleGoDump = useCallback(() => {
    console.log('[Family] "Go to Dump" pressed');
    router.push('/(tabs)/dump');
  }, [router]);

  if (!dump) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Family</Text>
          <Text style={styles.subtitle}>Everything you're carrying, sorted.</Text>
        </View>
        <EmptyState
          icon={<Home size={32} color={Colors.primaryBlush} />}
          headline="Nothing sorted yet"
          body="Head to Dump and let it all out. I'll organize everything for you."
          ctaLabel="Go to Dump"
          onCta={handleGoDump}
        />
      </View>
    );
  }

  const mainSections = [
    { key: 'kids', title: 'Kids', items: dump.kids, accent: CategoryColors.kids, emptyHint: 'All quiet on the kid front.' },
    { key: 'home', title: 'Home', items: dump.home, accent: CategoryColors.home, emptyHint: 'Home is handled.' },
    { key: 'errands', title: 'Errands / Groceries', items: dump.errands, accent: CategoryColors.errands, emptyHint: 'No errands on the list.' },
    { key: 'meals', title: 'Meals', items: dump.meals, accent: CategoryColors.meals, emptyHint: 'Meals are sorted.' },
    { key: 'messages', title: 'Messages', items: dump.messages, accent: CategoryColors.messages, emptyHint: 'No messages waiting.' },
  ];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Family</Text>
      <Text style={styles.subtitle}>Everything you're carrying, sorted.</Text>

      {mainSections.map((section, index) => (
        <FadeInSection key={section.key} delay={index * 60}>
          <CategorySection
            title={section.title}
            items={section.items}
            accentColor={section.accent}
            emptyHint={section.emptyHint}
          />
        </FadeInSection>
      ))}

      {/* Holding for Later — parked zone */}
      <FadeInSection delay={mainSections.length * 60}>
        <Text style={styles.holdingIntro}>These can wait. They're safe here.</Text>
        <CategorySection
          title="Holding for Later"
          items={dump.holdingForLater}
          accentColor={CategoryColors.holdingForLater}
          emptyHint="Nothing parked here."
          variant="parked"
        />
      </FadeInSection>
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
  holdingIntro: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginBottom: 6,
  },
});
