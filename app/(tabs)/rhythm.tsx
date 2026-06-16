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

export default function RhythmScreen() {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: 0, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: 0, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      <Animated.View style={[styles.card, { opacity, transform: [{ translateY }] }]}>
        <View style={[styles.accentBorder, { backgroundColor: Colors.lavender }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Your rhythm is building.</Text>
            <Sparkles size={18} color={Colors.lavender} />
          </View>
          <Text style={styles.cardBody}>
            Every time you do a brain dump, I start to see your patterns — what comes up most, what you keep carrying, and what you keep parking. Check back as you use the app more.
          </Text>
          <Text style={styles.cardFooter}>No pressure. Patterns take time.</Text>
        </View>
      </Animated.View>
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
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
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
    flex: 1,
    marginRight: 8,
  },
  cardBody: {
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
  },
  cardFooter: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
