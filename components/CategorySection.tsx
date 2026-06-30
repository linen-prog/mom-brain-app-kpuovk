import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { TaskMeta } from '@/utils/storage';

interface CategorySectionProps {
  title: string;
  items: string[];
  accentColor: string;
  emptyHint?: string;
  variant?: 'default' | 'parked';
  taskMeta?: TaskMeta[];
}

export function CategorySection({ title, items, accentColor, emptyHint, variant = 'default', taskMeta }: CategorySectionProps) {
  const isParked = variant === 'parked';
  const badgeBg = accentColor + '33';

  const cardStyle = isParked
    ? [styles.card, styles.cardParked, items.length === 0 && styles.cardEmpty]
    : [styles.card, items.length === 0 && styles.cardEmpty];

  const titleStyle = isParked ? [styles.title, styles.titleParked] : styles.title;
  const itemTextStyle = isParked ? [styles.itemText, styles.itemTextParked] : styles.itemText;

  function getChildName(itemText: string): string | null {
    if (!taskMeta) return null;
    const meta = taskMeta.find((m) => m.taskText === itemText);
    return meta?.childName ?? null;
  }

  return (
    <View style={cardStyle}>
      {/* Accent left border */}
      <View style={[styles.accentBorder, { backgroundColor: accentColor }]} />

      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
          <Text style={titleStyle}>{title}</Text>
        </View>
        {items.length > 0 && (
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.badgeText, { color: accentColor }]}>{items.length}</Text>
          </View>
        )}
      </View>

      {/* Items */}
      {items.length > 0 ? (
        <View style={styles.itemsList}>
          {items.map((item, index) => {
            const childName = getChildName(item);
            return (
              <View key={index} style={styles.itemRow}>
                <View style={[styles.bullet, { backgroundColor: accentColor }]} />
                <View style={styles.itemContent}>
                  <Text style={itemTextStyle}>{item}</Text>
                  {childName ? (
                    <View style={styles.childPill}>
                      <Text style={styles.childPillText}>{childName}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
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
  cardParked: {
    backgroundColor: Colors.holdingParked + '12',
    borderColor: Colors.holdingParked + '40',
  },
  cardEmpty: {
    opacity: 0.7,
  },
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
  titleParked: {
    color: Colors.textBody,
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
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
  },
  itemText: {
    fontSize: 15,
    color: Colors.textBody,
    fontFamily: 'Nunito_400Regular',
    lineHeight: 22,
    flexShrink: 1,
  },
  itemTextParked: {
    color: Colors.textBody,
    opacity: 0.85,
  },
  childPill: {
    backgroundColor: Colors.honey + '33',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'center',
  },
  childPillText: {
    fontSize: 11,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textBody,
  },
  emptyHint: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'Nunito_400Regular',
    fontStyle: 'italic',
  },
});
