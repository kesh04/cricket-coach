import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PoseCamera, type PoseCameraHandle, type PoseStatus } from '@/components/PoseCamera';
import { Button, Choice, Field, H2, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { SKILL_INFO } from '@/data/skills';
import { CAMERA_SKILLS, SKILL_SHORT, type Skill } from '@/lib/pose/benchmarks';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { analyzePose, isGoodPosition, StanceSmoother, type PoseAnalysis } from '@/lib/pose/stanceAnalyzer';
import { backend, newId, type CoachTrial } from '@/services/backend';
import { useAuth, useProfile } from '@/state/AuthContext';
import { C, F, R, sp } from '@/theme';

/** The app's last judgement is used only if it is this fresh when the coach presses. */
const FRESH_MS = 600;

/**
 * Coach test: checks the app against a qualified coach.
 *
 * The learner takes positions in front of the camera, some good and some with faults. For each
 * one the coach presses "Good" or "Not good". At that moment the app's own verdict is stored
 * next to the coach's. With the app's score hidden from the coach, the comparison is fair.
 * The results screen gives agreement and Cohen's kappa for the report.
 */
export default function CoachTest() {
  const { user } = useAuth();
  const profile = useProfile();
  const hand = profile.battingHand;
  const [started, setStarted] = useState(false);
  const [skill, setSkill] = useState<Skill>('stance');
  const [blind, setBlind] = useState<'yes' | 'no'>('yes');
  const [rater, setRater] = useState('');

  if (!started) {
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title="Coach test" />
        <H2>Check the app against a coach</H2>
        <P soft>
          This is how you show the camera check is right. A qualified coach watches the learner and says, for each position, whether it is good. The app records its own verdict at the same moment. The results screen shows how often they agree.
        </P>
        <Notice icon="information-circle">
          Aim for at least 40 positions per skill, about half of them with a fault on purpose (feet too narrow, knees straight, hands high). Use more than one learner if you can.
        </Notice>
        <Choice label="Skill" value={skill} onChange={setSkill} options={CAMERA_SKILLS.map((k) => ({ value: k, label: SKILL_SHORT[k] }))} />
        <Choice
          label="Hide the app's score from the coach?"
          value={blind}
          onChange={setBlind}
          options={[
            { value: 'yes', label: 'Hide it (fair test)' },
            { value: 'no', label: 'Show it' },
          ]}
        />
        <Field label="Coach's name or code (for the report)" value={rater} onChangeText={setRater} placeholder="For example: Coach A" autoComplete="off" />
        <Button title="Start the coach test" icon="camera" onPress={() => setStarted(true)} />
        <Button title="See the results" icon="stats-chart" kind="secondary" onPress={() => router.push('/coach-test/results')} />
      </Screen>
    );
  }

  return <CoachCamera uid={user?.uid ?? ''} skill={skill} hand={hand} blind={blind === 'yes'} rater={rater.trim()} />;
}

function CoachCamera({ uid, skill, hand, blind, rater }: { uid: string; skill: Skill; hand: 'left' | 'right'; blind: boolean; rater: string }) {
  const camera = useRef<PoseCameraHandle>(null);
  const smoother = useRef(new StanceSmoother()).current;
  const latest = useRef<{ analysis: PoseAnalysis; at: number } | null>(null);
  const [status, setStatus] = useState<PoseStatus>('starting');
  const [shown, setShown] = useState<{ score: number; good: boolean } | null>(null);
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const lastUi = useRef(0);

  useEffect(() => {
    activateKeepAwakeAsync('coach-test').catch(() => {});
    return () => {
      deactivateKeepAwake('coach-test').catch(() => {});
    };
  }, []);

  const onFrame = useCallback(
    (frame: PoseFrame) => {
      const analysis = analyzePose(skill, frame, hand, smoother);
      const now = Date.now();
      latest.current = { analysis, at: now };
      if (now - lastUi.current > 200) {
        lastUi.current = now;
        setShown(analysis.state === 'ok' ? { score: analysis.score, good: isGoodPosition(analysis) } : null);
      }
    },
    [hand, skill, smoother],
  );
  const onNoPose = useCallback(() => {
    latest.current = { analysis: { state: 'no-body', missing: null }, at: Date.now() };
    setShown(null);
  }, []);

  const record = (coach: CoachTrial['coach']) => {
    const l = latest.current;
    const fresh = l && Date.now() - l.at < FRESH_MS ? l.analysis : null;
    const ok = fresh && fresh.state === 'ok' ? fresh : null;
    const trial: CoachTrial = {
      id: newId(),
      skill,
      hand,
      coach,
      app: ok ? (isGoodPosition(ok) ? 'good' : 'not') : 'unseen',
      score: ok ? ok.score : null,
      appFault: ok?.cues[0]?.id ?? null,
      judge: ok?.model ? 'model' : 'rules',
      modelLabel: ok?.model?.label ?? null,
      modelProb: ok?.model ? Math.round(ok.model.pCorrect * 1000) / 1000 : null,
      blind,
      rater,
      at: Date.now(),
    };
    setCount((c) => c + 1);
    setToast(blind ? `Saved trial ${count + 1}` : `Saved trial ${count + 1}. App said: ${trial.app === 'unseen' ? 'could not see' : trial.app === 'good' ? 'good' : 'not good'}`);
    setTimeout(() => setToast(null), 1500);
    if (uid) void backend.add(uid, 'coachTrials', trial).catch(() => setToast('Could not save. Check the connection.'));
  };

  return (
    <View style={styles.root}>
      <PoseCamera ref={camera} facing="front" onFrame={onFrame} onNoPose={onNoPose} onStatus={(s) => setStatus(s)} />
      <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none" edges={['top', 'bottom']}>
        <View style={styles.top} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.round}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.name}>
            <Text style={styles.nameText}>Coach test: {SKILL_INFO[skill].noun}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.name}>
            <Text style={styles.nameText}>{count}</Text>
          </View>
        </View>
        {!blind && shown ? (
          <View style={styles.appBox} pointerEvents="none">
            <Text style={styles.appScore}>{shown.score}</Text>
            <Text style={styles.appLabel}>App: {shown.good ? 'good' : 'not good'}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} pointerEvents="none" />
        <View style={styles.panel}>
          {status !== 'ready' ? <Small style={{ color: '#FFFFFF' }}>Getting the camera ready…</Small> : null}
          {toast ? <Text style={styles.toast}>{toast}</Text> : <Text style={styles.hint}>Coach: when the learner is in position, press one.</Text>}
          <View style={{ flexDirection: 'row', gap: sp(3) }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Coach says good" onPress={() => record('good')} style={({ pressed }) => [styles.big, { backgroundColor: C.good }, pressed && { opacity: 0.8 }]}>
              <Ionicons name="thumbs-up" size={28} color="#FFFFFF" />
              <Text style={styles.bigText}>Good</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Coach says not good" onPress={() => record('not')} style={({ pressed }) => [styles.big, { backgroundColor: C.bad }, pressed && { opacity: 0.8 }]}>
              <Ionicons name="thumbs-down" size={28} color="#FFFFFF" />
              <Text style={styles.bigText}>Not good</Text>
            </Pressable>
          </View>
          <Button title="See the results" kind="secondary" onPress={() => router.push('/coach-test/results')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const glass = 'rgba(10,22,18,0.78)';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.night },
  top: { flexDirection: 'row', gap: sp(2.5), paddingHorizontal: sp(4), paddingTop: sp(2) },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: glass, alignItems: 'center', justifyContent: 'center' },
  name: { height: 48, borderRadius: 24, backgroundColor: glass, paddingHorizontal: sp(4), justifyContent: 'center' },
  nameText: { color: '#FFFFFF', fontFamily: F.display, fontSize: 20 },
  appBox: { alignSelf: 'flex-start', margin: sp(4), backgroundColor: glass, borderRadius: R.lg, padding: sp(3), alignItems: 'center' },
  appScore: { color: '#FFFFFF', fontFamily: F.displayBold, fontSize: 48 },
  appLabel: { color: '#D5DDD7', fontSize: 13 },
  panel: { margin: sp(4), padding: sp(4), borderRadius: R.lg, backgroundColor: glass, gap: sp(3) },
  hint: { color: '#D5DDD7', fontSize: 14, textAlign: 'center' },
  toast: { color: '#5BE49B', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  big: { flex: 1, height: 84, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bigText: { color: '#FFFFFF', fontFamily: F.display, fontSize: 22 },
});
