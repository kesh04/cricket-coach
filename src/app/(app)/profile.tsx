import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { CareerHeadline } from '@/components/MatchStats';
import { Button, Card, Choice, H2, H3, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { career } from '@/data/matchStats';
import { useMatches } from '@/state/useMatches';
import type { Hand } from '@/lib/pose/landmarks';
import { firebaseConfigured } from '@/services/backend';
import { coachConfigured } from '@/services/coach';
import { clearSnapshots } from '@/services/snapshots';
import { useAuth, useProfile } from '@/state/AuthContext';
import { useData } from '@/state/DataContext';
import { C, sp } from '@/theme';

const EXPERIENCE = { new: 'New to cricket', some: 'Plays with friends', club: 'School or club player' } as const;

export default function Profile() {
  const profile = useProfile();
  const { updateProfile, signOut } = useAuth();
  const { stepsOpen, setStepsOpen } = useData();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { matches } = useMatches();
  const c = useMemo(() => career(matches), [matches]);

  const changeHand = async (hand: Hand) => {
    setError(null);
    try {
      await updateProfile({ battingHand: hand });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Profile" />
      <View style={{ gap: sp(1) }}>
        <H2>{profile.name}</H2>
        <Small>{profile.email}</Small>
      </View>

      {/* The learner's own match figures, from the matches they entered. */}
      <Card>
        <H3>My matches</H3>
        {matches.length ? (
          <>
            <CareerHeadline c={c} />
            <Small>
              {c.innings} innings · {c.notOuts} not out · {c.fifties} {c.fifties === 1 ? 'fifty' : 'fifties'} · {c.hundreds} {c.hundreds === 1 ? 'hundred' : 'hundreds'} · {c.bowling.wickets} {c.bowling.wickets === 1 ? 'wicket' : 'wickets'}
            </Small>
          </>
        ) : (
          <P soft>After a match, add your runs, how you got out and your bowling. Your figures show here: matches, runs, best score and average.</P>
        )}
        <View style={{ flexDirection: 'row', gap: sp(2) }}>
          <Button title="Add a match" icon="add-circle" onPress={() => router.push('/matches/edit')} style={{ flex: 1 }} />
          {matches.length ? <Button title="All figures" icon="stats-chart" kind="secondary" onPress={() => router.push('/matches')} style={{ flex: 1 }} /> : null}
        </View>
      </Card>

      <Card>
        <H3>Batting hand</H3>
        <Choice
          value={profile.battingHand}
          onChange={changeHand}
          options={[
            { value: 'left', label: 'Left-handed' },
            { value: 'right', label: 'Right-handed' },
          ]}
        />
        <Small>Lessons, demonstrations and the camera checks follow this.</Small>
        {error ? <Text style={{ color: C.bad }}>{error}</Text> : null}
      </Card>

      <Card>
        <H3>About you</H3>
        <P soft>Age {profile.ageGroup.replace('-', ' to ')}</P>
        <P soft>{EXPERIENCE[profile.experience]}</P>
        {profile.goal ? <P soft>Goal: {profile.goal}</P> : null}
        {profile.guardianName ? <P soft>Parent or guardian: {profile.guardianName}</P> : null}
      </Card>

      <Card>
        <H3>Practice order</H3>
        <Choice
          value={stepsOpen ? 'open' : 'order'}
          onChange={(v) => setStepsOpen(v === 'open')}
          options={[
            { value: 'order', label: 'One step at a time' },
            { value: 'open', label: 'All steps open' },
          ]}
        />
        <Small>Normally a step opens when the one before it is passed. A coach or teacher can open every step for a learner the camera cannot judge well.</Small>
      </Card>

      <Button title="How to use the app" icon="help-circle" kind="secondary" onPress={() => router.push('/how-to')} />
      <Button title="Coach test (check the app against a coach)" icon="ribbon" kind="secondary" onPress={() => router.push('/coach-test')} />

      <Notice icon={firebaseConfigured ? 'cloud-done' : 'phone-portrait'}>
        {firebaseConfigured ? 'Your progress is saved to your account.' : 'Demo mode: your progress is saved on this phone only. Add Firebase keys to .env to save it to an account.'}
      </Notice>
      <Notice icon={coachConfigured ? 'chatbubbles' : 'chatbubbles-outline'}>
        {coachConfigured ? 'The AI coach is connected.' : 'The AI coach is not connected. The Coach tab answers from tips stored in the app.'}
      </Notice>

      <Button
        title="Sign out"
        kind="secondary"
        icon="log-out-outline"
        loading={leaving}
        onPress={async () => {
          setLeaving(true);
          // Photos of practice attempts belong to this learner, so they go when the learner signs out.
          await clearSnapshots();
          await signOut();
        }}
      />
    </Screen>
  );
}
