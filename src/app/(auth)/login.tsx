import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';

import { Button, Field, H2, P, Screen, TopBar } from '@/components/ui';
import { useAuth } from '@/state/AuthContext';
import { C } from '@/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <TopBar />
        <H2>Sign in</H2>
        <P soft>Pick up where you left off.</P>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
        {error ? <Text style={{ color: C.bad, fontSize: 14 }}>{error}</Text> : null}
        <Button title="Sign in" onPress={submit} loading={busy} />
        <Button title="Create an account" kind="ghost" onPress={() => router.replace('/register')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
