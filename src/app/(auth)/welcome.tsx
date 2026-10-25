import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { StanceFigure } from '@/components/StanceFigure';
import { Button, H1, P, Screen, Small } from '@/components/ui';
import { useAuth } from '@/state/AuthContext';
import { sp } from '@/theme';

export default function Welcome() {
  const { user, profile, mode } = useAuth();

  // An account without a profile (sign-up was interrupted): finish it.
  useEffect(() => {
    if (user && !profile) router.replace('/register');
  }, [user, profile]);

  return (
    <Screen edges={['top', 'bottom']}>
      <StanceFigure hand="right" height={340} hint="Drag to turn" />
      <View style={{ gap: sp(3), marginTop: sp(2) }}>
        <H1>Your batting coach, on your phone</H1>
        <P soft>Short lessons, a camera that checks your stance as you stand, and a coach you can ask anything.</P>
      </View>
      <View style={{ gap: sp(2.5), marginTop: sp(2) }}>
        <Button title="Create an account" onPress={() => router.push('/register')} />
        <Button title="I already have an account" kind="secondary" onPress={() => router.push('/login')} />
      </View>
      {mode === 'local' ? <Small>Demo mode: your data stays on this phone until Firebase is connected.</Small> : null}
    </Screen>
  );
}
