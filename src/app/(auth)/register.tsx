import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { StanceFigure } from '@/components/StanceFigure';
import { Button, Choice, Field, H2, P, Screen, Seam, Small, TopBar } from '@/components/ui';
import type { Hand } from '@/lib/pose/landmarks';
import type { AgeGroup, Experience } from '@/services/backend';
import { useAuth } from '@/state/AuthContext';
import { C, R, sp } from '@/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { user, register, completeProfile } = useAuth();
  // An account that already exists but has no profile skips the first step.
  const hasAccount = !!user;
  const firstStep = hasAccount ? 1 : 0;

  const [step, setStep] = useState(firstStep);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [goal, setGoal] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [hand, setHand] = useState<Hand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minor = ageGroup === '10-13' || ageGroup === '14-17';

  const check = (): string | null => {
    if (step === 0) {
      if (!EMAIL.test(email.trim())) return 'Enter a valid email address.';
      if (password.length < 6) return 'Choose a password with at least 6 characters.';
    }
    if (step === 1) {
      if (!name.trim()) return 'Enter your name.';
      if (!ageGroup) return 'Choose your age group.';
      if (!experience) return 'Choose how much cricket you have played.';
      if (minor && !guardianName.trim()) return 'Enter the name of your parent or guardian.';
      if (minor && !guardianConsent) return 'A parent or guardian must agree before you can use the app.';
    }
    if (step === 2 && !hand) return 'Choose the hand you bat with.';
    return null;
  };

  const next = async () => {
    const problem = check();
    setError(problem);
    if (problem) return;
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    const profile = {
      name: name.trim(),
      ageGroup: ageGroup!,
      experience: experience!,
      battingHand: hand!,
      goal: goal.trim(),
      ...(minor ? { guardianName: guardianName.trim(), guardianConsent: true } : {}),
    };
    setBusy(true);
    try {
      if (hasAccount) await completeProfile(profile);
      else await register(email, password, profile);
      // The sign-in layout sends the learner into the app once the profile exists.
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      if (message.includes('already exists')) setStep(0);
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    if (step > firstStep) setStep(step - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const frontSide = hand === 'left' ? 'right' : 'left';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <TopBar onBack={back} />
        <View style={{ gap: sp(1.5) }}>
          <Small>
            Step {step + 1 - firstStep} of {3 - firstStep}
          </Small>
          <Seam value={(step + 1 - firstStep) / (3 - firstStep)} total={12} />
        </View>

        {step === 0 ? (
          <>
            <H2>Create your account</H2>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 6 characters" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <H2>About you</H2>
            <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" placeholder="What should the coach call you?" />
            <Choice
              label="Age"
              value={ageGroup}
              onChange={setAgeGroup}
              options={[
                { value: '10-13', label: '10 to 13' },
                { value: '14-17', label: '14 to 17' },
                { value: '18-25', label: '18 to 25' },
              ]}
            />
            <Choice
              label="How much cricket have you played?"
              value={experience}
              onChange={setExperience}
              options={[
                { value: 'new', label: 'None yet' },
                { value: 'some', label: 'With friends' },
                { value: 'club', label: 'School or club' },
              ]}
            />
            <Field label="What do you want to get better at? (optional)" value={goal} onChangeText={setGoal} placeholder="For example: stop getting bowled" />
            {minor ? (
              <View style={styles.guardian}>
                <P style={{ fontWeight: '600' }}>For your parent or guardian</P>
                <Small>
                  This app uses the phone camera to check batting technique. The video is analysed on the phone and is never uploaded. One photo of each saved attempt is kept on this phone only, so your child can see it. Only scores and body-position data are saved to the account.
                </Small>
                <Field label="Parent or guardian's name" value={guardianName} onChangeText={setGuardianName} autoComplete="off" />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: guardianConsent }}
                  onPress={() => setGuardianConsent(!guardianConsent)}
                  style={styles.checkRow}>
                  <Ionicons name={guardianConsent ? 'checkbox' : 'square-outline'} size={26} color={guardianConsent ? C.outfield : C.inkSoft} />
                  <Text style={styles.checkText}>I am the parent or guardian and I agree to my child using this app.</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <H2>Which hand do you bat with?</H2>
            <P soft>Your lessons, the model stance and the camera check will all match your side.</P>
            <Choice
              value={hand}
              onChange={setHand}
              options={[
                { value: 'left', label: 'Left-handed' },
                { value: 'right', label: 'Right-handed' },
              ]}
            />
            <StanceFigure hand={hand ?? 'right'} height={320} hint="Drag to turn" />
            {hand ? (
              <Small>
                A {hand}-handed batter stands with the {frontSide} shoulder and {frontSide} foot towards the bowler. Not sure? Pick up a bat or a stick: the hand lower on the handle is your batting hand.
              </Small>
            ) : (
              <Small>Not sure? Pick up a bat or a stick as if to hit a ball. The hand lower on the handle is your batting hand.</Small>
            )}
          </>
        ) : null}

        {error ? <Text style={{ color: C.bad, fontSize: 14 }}>{error}</Text> : null}
        <Button title={step < 2 ? 'Continue' : 'Start learning'} onPress={next} loading={busy} />
        {step === 0 ? <Button title="I already have an account" kind="ghost" onPress={() => router.replace('/login')} /> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  guardian: { backgroundColor: C.outfieldTint, borderRadius: R.lg, padding: sp(4), gap: sp(3) },
  checkRow: { flexDirection: 'row', gap: sp(3), alignItems: 'center', minHeight: 44 },
  checkText: { flex: 1, fontSize: 15, lineHeight: 21, color: C.ink },
});
