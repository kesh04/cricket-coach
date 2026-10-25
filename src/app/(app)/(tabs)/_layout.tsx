import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui';
import { C } from '@/theme';

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.outfield,
        tabBarInactiveTintColor: C.inkMute,
        // The tab bar adds the bottom safe-area padding itself.
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.line, height: 64 + insets.bottom },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('book') }} />
      <Tabs.Screen name="practice" options={{ title: 'Practise', tabBarIcon: icon('body') }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarIcon: icon('chatbubbles') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('stats-chart') }} />
    </Tabs>
  );
}
