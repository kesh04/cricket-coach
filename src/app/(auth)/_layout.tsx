import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/state/AuthContext';
import { C } from '@/theme';

export default function AuthLayout() {
  const { user, profile } = useAuth();
  // Signed in with a profile: go to the app.
  if (user && profile) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
