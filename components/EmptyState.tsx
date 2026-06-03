import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useRef, useCallback } from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  headline: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, headline, body, ctaLabel, onCta }: EmptyStateProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }, [scale]);

  const animateOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.body}>{body}</Text>
      {ctaLabel && onCta && (
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPressIn={animateIn}
            onPressOut={animateOut}
            onPress={onCta}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.primaryBlush + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  headline: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  cta: {
    marginTop: 8,
    backgroundColor: Colors.primaryBlush,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
});
