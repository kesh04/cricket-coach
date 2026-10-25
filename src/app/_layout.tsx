import { setAudioModeAsync } from 'expo-audio';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/state/AuthContext';
import { DataProvider } from '@/state/DataContext';
import { C } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// The voice and the coaching videos must be heard even when an iPhone is switched to silent.
// Other apps' audio is lowered while the voice speaks, not stopped.
void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold });
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <Gate fontsReady={fontsLoaded || !!fontError} />
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/** Holds the splash screen until the fonts and the saved sign-in are ready. */
function Gate({ fontsReady }: { fontsReady: boolean }) {
  const { ready } = useAuth();
  const allReady = fontsReady && ready;

  useEffect(() => {
    if (allReady) void SplashScreen.hideAsync();
  }, [allReady]);

  if (!allReady) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}
