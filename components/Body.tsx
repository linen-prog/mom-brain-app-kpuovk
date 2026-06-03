import React from 'react';
import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { Colors } from '@/constants/Colors';

type BodyVariant = 'default' | 'muted';

interface BodyProps {
  variant?: BodyVariant;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export function Body({ variant = 'default', style, children }: BodyProps) {
  const variantStyle = styles[variant];
  return (
    <Text style={[variantStyle, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
  },
  muted: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 20,
  },
});
