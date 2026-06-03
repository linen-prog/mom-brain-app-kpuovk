import React from 'react';
import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { Colors } from '@/constants/Colors';

type HeadingVariant = 'large' | 'section' | 'small';

interface HeadingProps {
  variant?: HeadingVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export function Heading({ variant = 'large', color, style, children }: HeadingProps) {
  const variantStyle = styles[variant];
  return (
    <Text style={[variantStyle, color ? { color } : undefined, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  large: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.3,
    lineHeight: 36,
  },
  section: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  small: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMain,
    fontFamily: 'Nunito_600SemiBold',
    lineHeight: 22,
  },
});
