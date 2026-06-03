import React, { useRef, useEffect } from 'react';
import { Pressable, Animated, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';

interface RoundedCheckboxProps {
  checked: boolean;
  onToggle: () => void;
}

export function RoundedCheckbox({ checked, onToggle }: RoundedCheckboxProps) {
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
      style={[styles.checkbox, checked && styles.checked]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Check size={14} color="#FFFFFF" strokeWidth={3} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: {
    backgroundColor: Colors.sage,
    borderColor: Colors.sage,
  },
});
