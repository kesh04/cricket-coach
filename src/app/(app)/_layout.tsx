import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/state/AuthContext';
import { C } from '@/theme';

/** Everything behind the sign-in. Without a signed-in learner and a profile, go to the welcome screen. */
export default function AppLayout() {
  const { user, profile } = useAuth();
  if (!user || !profile) return <Redirect href="/welcome" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="live" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="coach-test/index" options={{ animation: 'fade' }} />
    </Stack>
  );
}
