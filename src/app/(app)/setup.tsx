import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { SPEECH_RATE } from '@/lib/voice';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SetupDiagram } from '@/components/SetupDiagram';
import { Button, Card, Choice, H2, H3, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { personalise } from '@/data/curriculum';
import { SKILL_INFO } from '@/data/skills';
import { CAMERA_SKILLS, type Skill } from '@/lib/pose/benchmarks';
import { DRILL_BY_ID, isDrill, taskKey } from '@/data/training';
import type { CameraView } from '@/lib/pose/stanceAnalyzer';
import { getCameraView, getWithBat, setCameraView, setWithBat } from '@/services/flags';
import { useProfile } from '@/state/AuthContext';
import { StanceFirst } from '@/components/StanceFirst';
import { useData } from '@/state/DataContext';
import { C, F, sp } from '@/theme';

/** Where to put the phone and where to stand, shown before every camera practice. */
export default function Setup() {
  const params = useLocalSearchParams<{ skill: string; drill?: string }>();
  // The grip is not practised with the camera, so it has no setup.
  const skill = (CAMERA_SKILLS as string[]).includes(params.skill) ? (params.skill as Skill) : null;
  const profile = useProfile();
  const hand = profile.battingHand;
  const { skills, taskToday } = useData();
  const [reading, setReading] = useState(false);
  // Where the phone goes: at the side (seeing the chest, best) or in front. Remembered.
  const [view, setView] = useState<CameraView>('side');
  useEffect(() => {
    void getCameraView().then(setView);
  }, []);
  const chooseView = (v: CameraView) => {
    setView(v);
    void setCameraView(v);
  };
  // With a bat (default) or without one. With a bat, the bat must be seen before a stance counts.
  const [withBat, setBat] = useState(true);
  useEffect(() => {
    void getWithBat().then(setBat);
  }, []);
  const chooseBat = (v: 'yes' | 'no') => {
    setBat(v === 'yes');
    void setWithBat(v === 'yes');
  };

  useEffect(() => () => void Speech.stop(), []);

  if (!skill) {
    return (
      <Screen>
        <TopBar title="Set up" />
        <P>This practice could not be found.</P>
        <Button title="Back to practice" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  const drill = skill === 'defence' ? (isDrill(params.drill) ? DRILL_BY_ID[params.drill] : DRILL_BY_ID['def-full']) : null;
  const skillInfo = SKILL_INFO[skill];
  const info = drill ? { ...skillInfo, name: `${skillInfo.name}: ${drill.name}`, plan: { ...skillInfo.plan, what: drill.what, rep: drill.rep } } : skillInfo;
  // The demonstration (and the coaching video, where there is one) comes before practice.
  if (skills[skill].unlocked && !skills[skill].watched) return <Redirect href={`/demo/${skill}`} />;
  const steps = (view === 'front' ? PHONE_FRONT : info.setup).map((s) => personalise(s, hand));
  const plan = info.plan;
  const rep = plan.rep.map((s) => personalise(s, hand));
  const state = taskToday(taskKey({ skill, drill: drill?.id }));

  if (!skills[skill].unlocked) {
    return (
      <Screen>
        <TopBar title={info.name} />
        {skills[skill].needsStance ? (
          <>
            <Notice icon="lock-closed">The stance comes first.</Notice>
            <StanceFirst />
          </>
        ) : (
          <Notice icon="lock-closed">Practice goes in order. Pass the step before this one to open it.</Notice>
        )}
        <Button title="Back to practice" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  const read = () => {
    if (reading) {
      void Speech.stop();
      setReading(false);
      return;
    }
    setReading(true);
    const script = [`Today's practice. ${personalise(plan.what, hand)}`, `You need: ${plan.space.join(' ')}`, `Each one: ${rep.join(' ')}`, `Now set up your phone. ${steps.join(' ')}`].join(' ');
    Speech.speak(script, { language: 'en', rate: SPEECH_RATE, onDone: () => setReading(false), onStopped: () => setReading(false), onError: () => setReading(false) });
  };

  const start = () => {
    void Speech.stop();
    router.replace(`/live?skill=${skill}${drill ? `&drill=${drill.id}` : ''}&view=${view}&bat=${withBat ? 1 : 0}`);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Before you start" />

      {/* What today's practice is, how to set up the space, and what one repetition is. */}
      <Card>
        <Small>
          {state.target
            ? `Today's plan: ${state.target} good ones · done so far ${Math.min(state.today, 999)} · ${plan.time}`
            : `Extra practice: a set of ${state.setSize} · ${plan.time}`}
        </Small>
        <H3>{info.name}</H3>
        <P>{personalise(plan.what, hand)}</P>
        <Text style={styles.sub}>What you need</Text>
        {plan.space.map((s) => (
          <View key={s} style={styles.bullet}>
            <Ionicons name="checkmark" size={18} color={C.outfield} style={{ marginTop: 2 }} />
            <Text style={styles.text}>{s}</Text>
          </View>
        ))}
        <Text style={styles.sub}>Each one</Text>
        {rep.map((s, i) => (
          <View key={s} style={styles.bullet}>
            <Text style={styles.small}>{i + 1}.</Text>
            <Text style={styles.text}>{s}</Text>
          </View>
        ))}
      </Card>

      <Button title={reading ? 'Stop reading' : 'Read this to me'} icon={reading ? 'stop' : 'volume-high'} kind="secondary" onPress={read} />

      <View style={{ gap: sp(1) }}>
        <H2>Where to put the phone</H2>
        <P soft>At the side is best: the phone sees your chest, so it can check your feet, knees, head, hands and bat clearly. In front also works, but checks your feet and knees less exactly.</P>
      </View>
      <Choice
        value={view}
        onChange={chooseView}
        options={[
          { value: 'side', label: 'At the side (best)', note: 'Phone sees your chest' },
          { value: 'front', label: 'In front', note: 'Phone where the bowler is' },
        ]}
      />
      <P soft>
        {view === 'front'
          ? 'This is the view from above. The phone is your bowler. Stand side-on to it, with your front shoulder pointing at it, and look at it as you would look at the bowler.'
          : 'This is the view from above. Stand side-on to the bowler. The phone stands where your chest points (where the fielder at point stands), so it sees you from the front of your body, like a coach standing beside you.'}
      </P>

      <SetupDiagram skill="stance" hand={hand} view={view} />

      <View style={{ gap: sp(3) }}>
        {steps.map((s, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.number}>{i + 1}</Text>
            <Text style={styles.text}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: sp(1) }}>
        <H2>Are you using a bat?</H2>
        <P soft>With a bat, the camera must see it: hold it so it is not hidden behind your legs. A stance only counts when the bat is seen in the right place. Without a bat you can still practise your body position.</P>
      </View>
      <Choice
        value={withBat ? 'yes' : 'no'}
        onChange={chooseBat}
        options={[
          { value: 'yes', label: 'With a bat', note: 'The bat is checked too' },
          { value: 'no', label: 'Without a bat', note: 'Body position only' },
        ]}
      />

      <Notice icon="bulb">
        {skill !== 'grip'
          ? 'No bat? Use a stick, or hold your hands as if you had one. Good light helps: face a window or a lamp, do not stand in front of one.'
          : 'No bat? A stick about as long as your leg works. Good light helps: face a window or a lamp, do not stand in front of one.'}
      </Notice>

      <Button title="I am ready: open the camera" icon="camera" onPress={start} />
      <View style={styles.privacy}>
        <Ionicons name="lock-closed" size={16} color={C.inkSoft} />
        <Small style={{ flex: 1 }}>The video is checked on this phone and is never uploaded. One photo of your attempt is kept on this phone so you can see it afterwards.</Small>
      </View>
    </Screen>
  );
}

/** How to set up the phone in front of the learner, where the bowler would be. */
const PHONE_FRONT = [
  'Pick a straight line for your pitch, at least 5 metres long.',
  'Stand the phone upright at one end, about waist high: lean it on a chair, a box or a bag, with the back camera or the screen facing you.',
  'Walk 3 to 4 metres away from it (5 big steps). That is your crease. The phone is now your bowler.',
  'Stand side-on: your {front} shoulder points at the phone, your feet are side by side across the line.',
  'Check the picture shows you from your head to your feet, with a little space above and below. Move back if it does not.',
  'Turn the sound up and switch silent mode off. You do not need to look at the screen: the voice tells you what to fix and counts each good one.',
];

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sp(3), alignItems: 'flex-start' },
  number: { fontFamily: F.displayBold, fontSize: 22, color: C.outfield, width: 20, lineHeight: 25 },
  text: { flex: 1, fontSize: 16, lineHeight: 23, color: C.ink },
  sub: { fontSize: 13, fontWeight: '700', color: C.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: sp(1) },
  bullet: { flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' },
  small: { width: 18, fontSize: 16, lineHeight: 23, color: C.outfield, fontWeight: '700' },
  privacy: { flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' },
});
