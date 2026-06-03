import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

interface MomCheckInCardProps {
  message: string;
}

export function MomCheckInCard({ message }: MomCheckInCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.accentBorder} />
      <Text style={styles.label}>MOM CHECK-IN</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#C98B9518',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primaryDeepRose + '40',
    padding: 18,
    paddingLeft: 22,
    overflow: 'hidden',
  },
  accentBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.primaryDeepRose,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDeepRose,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 1,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: Colors.textMain,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 24,
    fontStyle: 'italic',
  },
});
