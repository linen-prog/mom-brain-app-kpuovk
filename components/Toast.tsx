import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;

    // Reset
    opacity.setValue(0);
    translateY.setValue(-8);
    if (timerRef.current) clearTimeout(timerRef.current);

    // Animate in
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    // Hold then fade out
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, 1800);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    zIndex: 999,
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#3F312C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  text: {
    fontSize: 14,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
  },
});
