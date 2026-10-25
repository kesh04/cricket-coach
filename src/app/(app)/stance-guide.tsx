import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StanceFigure, type FigureView } from '@/components/StanceFigure';
import { StancePhotos } from '@/components/StancePhotos';
import { Button, Choice, H2, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { personalise, sentence } from '@/data/curriculum';
import { PHOTOS_ARE_REAL } from '@/data/stancePhotos';
import { BENCHMARKS, type StanceCheckId } from '@/lib/pose/benchmarks';
import { useProfile } from '@/state/AuthContext';
import { C, R, sp } from '@/theme';

// What to look for on the figure, in the learner's own left and right.
const DETAIL: Record<StanceCheckId, string> = {
  feet: 'Feet about shoulder-width apart and parallel to the crease. Your {front} foot is nearer the bowler.',
  toesSide: 'Toes point to the side, not at the bowler. Do not turn your {front} foot forward.',
  feetLine: 'Both feet on one line, side by side: neither foot is in front of the other, and both toes point to the side, not at the bowler.',
  knees: 'A small bend in both knees, so you can step forward or back without rocking first.',
  lean: 'Lean forward a little from the hips. Your weight is on the balls of your feet.',
  shoulders: 'Shoulders level, with your {front} shoulder pointing at the bowler.',
  head: 'Head still, with your eyes level. Keep it between your feet.',
  look: 'Turn your head to look at the bowler. Do not look at the phone; listen to the voice instead.',
  neck: 'Neck straight and head level: not looking up, not looking down at the ground, and not turned the other way.',
  hands: 'Hands relaxed near your {front} thigh, with the bat resting behind your {back} foot.',
  handsIn: 'Hands close to your body, not pushed out in front. The bat rests down by your {back} toe.',
  batRest: 'The bat rests down by your {back} toe, or is lifted just a little behind you, ready to come down. Never high, up in the air.',
};

export default function StanceGuide() {
  const profile = useProfile();
  const hand = profile.battingHand;
  const [selected, setSelected] = useState<StanceCheckId | null>(null);
  // The real player is shown first once real photos are in place; until then the drawn model is.
  const [view, setView] = useState<'photos' | 'model'>(PHOTOS_ARE_REAL ? 'photos' : 'model');
  const [angle, setAngle] = useState<FigureView>('front');
  const highlight = selected ? BENCHMARKS.find((b) => b.id === selected)!.joints : undefined;

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="The model stance" />
      <Choice
        value={view}
        onChange={setView}
        options={[
          { value: 'photos', label: 'Real player' },
          { value: 'model', label: '3D model' },
        ]}
      />
      {view === 'photos' ? (
        <StancePhotos hand={hand} height={380} hint="Drag to turn the player" />
      ) : (
        <>
          <StanceFigure hand={hand} height={380} view={angle} highlight={highlight} hint="Drag to turn the batter" />
          <Choice
            value={angle}
            onChange={setAngle}
            options={[
              { value: 'front', label: "Bowler's view" },
              { value: 'side', label: 'From the off side' },
              { value: 'profile', label: 'Side on' },
            ]}
          />
        </>
      )}
      {view === 'photos' && !PHOTOS_ARE_REAL ? <Notice>These are sample pictures. Replace them with photos of your own player (see src/data/stancePhotos.ts).</Notice> : null}
      <View style={{ gap: sp(1) }}>
        <H2>{hand === 'right' ? 'Right-handed stance' : 'Left-handed stance'}</H2>
        <P soft>Tap a point to see it marked on the 3D model. The camera checks the same six things.</P>
      </View>

      <View style={styles.list}>
        {BENCHMARKS.map((b, i) => {
          const on = selected === b.id;
          return (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => {
                setSelected(on ? null : (b.id as StanceCheckId));
                // The points are marked on the 3D model, so switch to it.
                if (!on) setView('model');
              }}
              style={[styles.row, i < BENCHMARKS.length - 1 && styles.divider, on && { backgroundColor: C.outfieldTint }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.label}>{b.label}</Text>
                <Text style={styles.detail}>{on ? sentence(personalise(DETAIL[b.id as StanceCheckId], hand)) : b.aim}</Text>
              </View>
              <Ionicons name={on ? 'eye' : 'eye-outline'} size={22} color={on ? C.outfield : C.inkMute} />
            </Pressable>
          );
        })}
      </View>

      <Button title="Learn and practise the stance" icon="play" onPress={() => router.push('/demo/stance')} />
      <Small>Practice goes in order: the grip first, then the stance.</Small>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4), minHeight: 64 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.line },
  label: { fontSize: 16, fontWeight: '600', color: C.ink },
  detail: { fontSize: 14, lineHeight: 20, color: C.inkSoft },
});
