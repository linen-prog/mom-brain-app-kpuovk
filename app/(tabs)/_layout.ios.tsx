import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/Colors';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const TABS = [
  { name: 'dump', label: 'Dump', icon: 'auto-awesome' as const },
  { name: 'today', label: 'Today', icon: 'wb-sunny' as const },
  { name: 'profile', label: 'Profile', icon: 'person' as const },
  { name: 'rhythm', label: 'Rhythm', icon: 'repeat' as const },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarOuter, { paddingBottom: insets.bottom }]}>
      <BlurView intensity={70} tint="light" style={styles.blurView}>
        <View style={styles.tabBarInner}>
          {TABS.map((tab, index) => {
            const isFocused = state.index === index;
            const onPress = () => {
              console.log('[TabBar] tab pressed:', tab.label);
              const event = navigation.emit({
                type: 'tabPress',
                target: state.routes[index].key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(tab.name);
              }
            };

            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.tabItem}
                onPress={onPress}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={tab.icon}
                  size={22}
                  color={isFocused ? Colors.primaryBlush : Colors.textMuted}
                />
                <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="dump"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="dump" />
      <Tabs.Screen name="today" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="rhythm" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  blurView: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  tabBarInner: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textMuted,
    fontFamily: 'Nunito_500Medium',
  },
  tabLabelActive: {
    color: Colors.primaryBlush,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },
});
