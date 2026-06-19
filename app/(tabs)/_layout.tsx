import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/Colors';

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <Text style={{ fontSize: 20, color, lineHeight: 24, textAlign: 'center' }}>
      {icon}
    </Text>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <Tabs
      initialRouteName="dump"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primaryDeepRose,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: bottomPad,
          paddingTop: 8,
          height: 56 + bottomPad,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'Nunito_500Medium',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dump"
        options={{
          title: 'Dump',
          tabBarIcon: ({ color }) => <TabIcon icon="✦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TabIcon icon="☀" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon icon="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="rhythm"
        options={{
          title: 'Rhythm',
          tabBarIcon: ({ color }) => <TabIcon icon="∿" color={color} />,
        }}
      />
    </Tabs>
  );
}
