import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';

interface RhythmCardProps {
  title: string;
  accent: string;
  delay: number;
}

function RhythmCard({ title, accent, delay }: RhythmCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }).start();
    Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.accentBorder, { backgroundColor: accent }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Sparkles size={18} color={accent} />
        </View>
        <Text style={styles.cardBody}>
          Coming soon: build repeatable family rhythms.
        </Text>
      </View>
    </Animated.View>
  );
}

const RHYTHM_CARDS = [
  { title: 'Morning Flow', accent: Colors.honey },
  { title: 'After School Flow', accent: Colors.clay },
  { title: 'Evening Flow', accent: Colors.lavender },
  { title: 'Weekly Reset', accent: Colors.sage },
];

export default function RhythmScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Rhythm</Text>
      <Text style={styles.subtitle}>Repeatable family flows, coming soon.</Text>

      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonText}>In the works</Text>
      </View>

      <Text style={styles.description}>
        Imagine having your morning routine, after-school pickup, and weekly reset all mapped out — so you don't have to hold it in your head.
      </Text>

      <View style={styles.cards}>
        {RHYTHM_CARDS.map((card, index) => (
          <RhythmCard
            key={card.title}
            title={card.title}
            accent={card.accent}
            delay={index * 80}
          />
        ))}
      </View>
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
    marginTop: -8,
  },
  comingSoonBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.lavender + '33',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: -4,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.lavender,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 23,
    marginTop: -4,
  },
  cards: {
    gap: 14,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    opacity: 0.9,
    boxShadow: '0 1px 3px rgba(63, 49, 44, 0.06), 0 4px 12px rgba(63, 49, 44, 0.04)',
  } as object,
  accentBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  cardContent: {
    padding: 20,
    paddingLeft: 24,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
  },
  cardBody: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
});
