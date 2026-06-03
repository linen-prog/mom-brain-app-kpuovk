import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';

interface CategorySectionProps {
  title: string;
  items: string[];
  accentColor: string;
  emptyHint?: string;
}

export function CategorySection({ title, items, accentColor, emptyHint }: CategorySectionProps) {
  const badgeBg = accentColor + '33'; // 20% opacity

  return (
    <View style={styles.card}>
      {/* Accent left border */}
      <View style={[styles.accentBorder, { backgroundColor: accentColor }]} />

      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: accentColor }]}>{items.length}</Text>
        </View>
      </View>

      {/* Items */}
      {items.length > 0 ? (
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={[styles.bullet, { backgroundColor: accentColor }]} />
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyHint}>{emptyHint ?? 'Nothing here right now.'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    paddingLeft: 22,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textMain,
    fontFamily: 'Nunito_700Bold',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    flexShrink: 0,
  },
  itemText: {
    fontSize: 15,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
    flex: 1,
  },
  emptyHint: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
  },
});
