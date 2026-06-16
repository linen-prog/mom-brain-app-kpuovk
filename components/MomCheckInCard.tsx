import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

const BODY_CUES = [
  "Take one slow breath before you look at the list.",
  "Notice if your shoulders are up near your ears. Let them drop.",
  "Let your jaw soften for a second.",
  "You got it out of your head. Give your body a moment.",
  "One thing at a time is enough.",
];

interface MomCheckInCardProps {
  message: string;
}

export function MomCheckInCard({ message }: MomCheckInCardProps) {
  const bodyCueIndex = Math.abs(message.charCodeAt(0) + message.charCodeAt(message.length - 1)) % BODY_CUES.length;
  const bodyCue = BODY_CUES[bodyCueIndex];

  return (
    <View style={styles.card}>
      <View style={styles.accentBorder} />
      <Text style={styles.label}>FOR YOU</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.bodyCue}>{bodyCue}</Text>
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
  bodyCue: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 19,
  },
});
