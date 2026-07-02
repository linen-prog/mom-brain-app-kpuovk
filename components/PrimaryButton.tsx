import React, { useRef, useCallback } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Colors } from '@/constants/Colors';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  loadingLabel,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale]);

  const animateOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale]);

  const isDisabled = disabled || loading;
  const displayLabel = loading && loadingLabel ? loadingLabel : label;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, isDisabled && styles.disabled, style]}>
      <Pressable
        onPressIn={animateIn}
        onPressOut={animateOut}
        onPress={onPress}
        disabled={isDisabled}
        style={styles.button}
      >
        <View style={styles.content}>
          {loading && (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
              style={styles.spinner}
            />
          )}
          <Text style={styles.label}>{displayLabel}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.primaryDeepRose,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeepRose,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.2,
  },
  spinner: {
    marginRight: 4,
  },
  disabled: {
    opacity: 0.5,
  },
});
