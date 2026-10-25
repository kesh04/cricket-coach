import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { GripDiagram } from '@/components/GripDiagram';
import { StanceFigure } from '@/components/StanceFigure';
import { Button, Card, Choice, H2, H3, P, Screen, Seam, Small, StatusPill, TopBar } from '@/components/ui';
import { personalise } from '@/data/curriculum';
import { SKILL_INFO, stepForCheck } from '@/data/skills';
import { SPEECH_RATE } from '@/lib/voice';
import { type DrillId, dayKey, dayPlan, DRILL_BY_ID, sessionKey, STANCE_FAILS_TO_SEND_BACK, STANCE_FIRST_REPS, taskKey } from '@/data/training';
import { BENCHMARK_BY_ID, GOOD_SCORE, SHOT_SKILLS, SKILL_SHORT, type Skill } from '@/lib/pose/benchmarks';
import { idealDefence, idealDrive, idealStance, worldToFigure } from '@/lib/pose/idealStance';
import { idealShot, isShotId } from '@/lib/pose/shotPoses';
import { formatValue, statusForScore } from '@/lib/pose/stanceAnalyzer';
import { loadSnapshot } from '@/services/snapshots';
import { taskRoute, useData } from '@/state/DataContext';
import { ClipPlayer } from '@/components/ClipPlayer';
import { C, F, R, sp, statusColor, statusIcon } from '@/theme';

/** The drill of a saved session, if it was one step of a skill. */
function session_drill(sessions: { id: string; drill?: DrillId }[], id: string | undefined): DrillId | undefined {
  return sessions.find((s) => s.id === id)?.drill;
}

/** How many saved sets in a row with the same main fault before the app suggests a different approach. */
const STUCK_AFTER = 3;

export default function SessionResult() {
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const { sessions, skills, programme, nextTask, stanceReps } = useData();
  const drill = session_drill(sessions, id);
  const session = sessions.find((s) => s.id === id);
  // Attempts saved before the grip was added have no kind; they were stance checks.
  const kind: Skill = session?.kind ?? 'stance';
  const baseInfo = SKILL_INFO[kind];
  const drillInfo = drill ? DRILL_BY_ID[drill] : null;
  const info = drillInfo ? { ...baseInfo, name: `${baseInfo.name}: ${drillInfo.name}`, noun: drillInfo.noun } : baseInfo;
  const state = skills[kind];
  const key = session ? sessionKey(session) : kind;
  const setupRoute = drill ? `/setup?skill=${kind}&drill=${drill}` : `/setup?skill=${kind}`;

  // The learner's own photo, kept on this phone. `undefined` while it is being read.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [show, setShow] = useState<'photo' | 'model'>('photo');
  // Width divided by height of the photo, so the frame fits it without black bars.
  const [shape, setShape] = useState(3 / 4);
  useEffect(() => {
    let alive = true;
    setPhoto(undefined);
    if (id) {
      void loadSnapshot(id).then((p) => {
        if (!alive) return;
        setPhoto(p);
        if (p) Image.getSize(p, (w, h) => alive && w > 0 && h > 0 && setShape(w / h), () => {});
      });
    }
    return () => {
      alive = false;
    };
  }, [id]);

  const pose = useMemo(() => (session?.world && kind !== 'grip' ? worldToFigure(session.world, session.hand) : undefined), [session, kind]);
  const model = useMemo(() => (session ? (kind === 'defence' ? idealDefence(session.hand) : kind === 'drive' ? idealDrive(session.hand) : isShotId(kind) ? idealShot(kind, session.hand) : idealStance(session.hand)) : undefined), [session, kind]);

  // Facts about the day the set was done.
  const day = session ? dayKey(session.at) : '';
  const isToday = day === dayKey(Date.now());
  const dayInfo = programme.days.get(day);
  // The plan in force on that day, and this skill's part in it.
  const plan = dayInfo?.plan ?? (isToday ? programme.today : null);
  const dayReps = dayInfo?.reps[key] ?? (isToday ? programme.todayReps[key] ?? 0 : 0);
  const target = plan?.tasks.find((t) => taskKey(t) === key)?.reps ?? 0;
  const remaining = Math.max(0, target - dayReps);
  const reps = session?.reps ?? [];
  const plural = (n: number) => `${info.noun}${n === 1 ? '' : 's'}`;

  // Straight after a set, say how it went.
  const spoken = useRef(false);
  useEffect(() => {
    if (!session || done !== '1' || spoken.current) return;
    spoken.current = true;
    const line = !reps.length
      ? `Saved. Your score is ${session.score}.`
      : programme.todayDone
        ? `${info.setDone} Today's plan is done. Come back tomorrow.`
        : remaining > 0
          ? `${reps.length} done. ${remaining} more to go today.`
          : nextTask
            ? `Well played. Next in today's plan: ${nextTask.name}.`
            : info.setDone;
    Speech.speak(line, { language: 'en', rate: SPEECH_RATE });
    return () => void Speech.stop();
  }, [session, done, reps.length, remaining, info, programme.todayDone, nextTask]);

  if (!session) {
    return (
      <Screen>
        <TopBar title="Result" />
        <P>This practice could not be found.</P>
        <Button title="Back to practice" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  const t = (text: string) => personalise(text, session.hand);
  // Tips (head, eyes, neck) come after the real faults.
  const isTip = (c: (typeof session.checks)[number]) => !!(c.advisory || BENCHMARK_BY_ID[c.id]?.advisory);
  const faults = session.checks.filter((c) => (c.value !== null || c.required) && c.status !== 'good').sort((a, b) => Number(isTip(a)) - Number(isTip(b)) || a.score - b.score);
  const worst = faults[0];

  // Adaptive next step: compare with the set before, and notice when the same fault keeps coming back.
  const attempts = state.attempts;
  const position = attempts.findIndex((a) => a.id === session.id);
  const before = position >= 0 ? attempts[position + 1] : undefined;
  const change = before ? session.score - before.score : null;
  const mainFault = (checks: typeof session.checks) => checks.filter((c) => c.value !== null && c.status !== 'good' && !isTip(c)).sort((a, b) => a.score - b.score)[0]?.id;
  const lastFew = position >= 0 ? attempts.slice(position, position + STUCK_AFTER) : [];
  const stuck = !!worst && lastFew.length === STUCK_AFTER && lastFew.every((a) => mainFault(a.checks) === worst.id);
  const stanceSlipped = SHOT_SKILLS.includes(kind) && (session.stanceFails ?? 0) >= STANCE_FAILS_TO_SEND_BACK;

  const question = worst
    ? `I practised the ${info.noun} and scored ${session.score} out of 100. The main thing to fix was: ${worst.label.toLowerCase()}. How do I fix it?`
    : `I practised the ${info.noun} and scored ${session.score} out of 100. What should I work on next?`;

  const canCompare = !!pose;
  const picture = photo && show === 'photo';

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title={`${info.name}: result`} onBack={() => router.replace('/practice')} />

      <View style={styles.header}>
        <Text style={styles.score}>{session.score}</Text>
        <View style={{ flex: 1, gap: sp(1.5) }}>
          <StatusPill status={statusForScore(session.score)} />
          <P soft>
            {reps.length ? `Average of ${reps.length} good ${reps.length === 1 ? 'one' : 'ones'}. ` : 'A single saved try. '}
            {change === null ? '' : change > 0 ? `Up ${change} from last time.` : change < 0 ? `Down ${-change} from last time.` : 'The same as last time.'}
          </P>
        </View>
      </View>

      {/* That day's plan */}
      <Card>
        <View style={styles.rowBetween}>
          <H3>{isToday ? "Today's plan" : new Date(session.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</H3>
          {plan ? <Small>Stage {plan.stage} · day {plan.day}</Small> : null}
        </View>
        {plan ? (
          plan.tasks.map((task) => {
            const n = (dayInfo?.reps[taskKey(task)] ?? 0) || (taskKey(task) === key ? dayReps : 0);
            return (
              <View key={taskKey(task)} style={{ gap: sp(1) }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.taskName}>
                    {n >= task.reps ? '✓ ' : ''}
                    {task.drill ? DRILL_BY_ID[task.drill].name : SKILL_SHORT[task.skill]}
                  </Text>
                  <Text style={styles.big}>
                    {Math.min(n, 999)}
                    <Text style={styles.of}> / {task.reps}</Text>
                  </Text>
                </View>
                <Seam value={Math.min(1, n / task.reps)} total={20} color={n >= task.reps ? C.good : C.ball} />
              </View>
            );
          })
        ) : (
          <Small>No plan for that day.</Small>
        )}
        {target === 0 ? <Small>This set was extra practice: {info.name.toLowerCase()} is not in {isToday ? "today's" : "that day's"} plan.</Small> : null}
        {reps.length ? (
          <>
            <Small>This set, one bar for each good one:</Small>
            <View style={styles.bars} accessibilityLabel={`Scores of each one: ${reps.map((r) => r.score).join(', ')}`}>
              {reps.map((r, i) => (
                <View key={i} style={styles.barSlot}>
                  <View style={[styles.bar, { height: Math.max(6, (r.score / 100) * 48), backgroundColor: r.score >= GOOD_SCORE ? C.good : C.warn }]} />
                  {reps.length <= 20 ? <Text style={styles.barLabel}>{i + 1}</Text> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      {/* The video of the set, to watch again. */}
      {session.clip ? <ClipPlayer file={session.clip} title={`Replay your ${info.noun}`} /> : null}

      {/* The learner's own picture first; the 3D comparison is one tap away. */}
      {photo && canCompare ? (
        <Choice
          value={show}
          onChange={setShow}
          options={[
            { value: 'photo', label: 'Your photo' },
            { value: 'model', label: 'You and the model' },
          ]}
        />
      ) : null}

      {picture ? (
        <>
          <View style={[styles.photoFrame, { aspectRatio: shape }]}>
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="contain" accessibilityLabel={`A photo of your ${info.noun} with the points the camera followed drawn on it.`} />
          </View>
          <Small>{reps.length ? 'Your best one. ' : 'This is you. '}The red rings show what to fix. The photo is kept on this phone only.</Small>
        </>
      ) : photo === undefined ? (
        <View style={[styles.photoFrame, { aspectRatio: shape }]} />
      ) : canCompare ? (
        <>
          <StanceFigure hand={session.hand} pose={pose} ghost={model} height={340} view="side" autoRotate={false} showStumps={false} bat={null} hint="Drag to turn" />
          <Small>White is you. Green is the model {info.noun}. This is rebuilt from the positions of your body.</Small>
        </>
      ) : kind === 'grip' ? (
        <>
          <GripDiagram hand={session.hand} stage="vs" height={300} />
          <Small>The model grip. No photo was saved for this try.</Small>
        </>
      ) : null}

      {/* What to do next, chosen from this result and today's plan */}
      <Card style={isToday && programme.todayDone ? styles.nextPassed : undefined}>
        <View style={{ flexDirection: 'row', gap: sp(2.5), alignItems: 'center' }}>
          <Ionicons name={isToday && programme.todayDone ? 'trophy' : 'flag'} size={24} color={isToday && programme.todayDone ? C.good : C.ball} />
          <H3>What to do next</H3>
        </View>

        {stanceSlipped ? (
          <>
            <P soft>Your stance check failed {session.stanceFails} times. Every {info.noun} starts from a good stance, so practise the stance again first.</P>
            <Button title="Practise the stance" icon="body" onPress={() => router.replace('/setup?skill=stance')} />
          </>
        ) : null}

        {/* The shots open after STANCE_FIRST_REPS good stances: show how far the learner has got. */}
        {kind === 'stance' && !session.drill ? (
          stanceReps < STANCE_FIRST_REPS ? (
            <View style={{ gap: sp(1.5) }}>
              <P soft>
                The shots open after {STANCE_FIRST_REPS} good stances. You have {stanceReps}: {STANCE_FIRST_REPS - stanceReps} to go.
              </P>
              <Seam value={stanceReps} total={STANCE_FIRST_REPS} />
            </View>
          ) : stanceReps - (session.reps?.length ?? 0) < STANCE_FIRST_REPS ? (
            <>
              <P soft>That makes {STANCE_FIRST_REPS} good stances. Well done: all the shots are open now, starting with the forward defence.</P>
              <Button title="See the shots" icon="lock-open" kind="secondary" onPress={() => router.replace('/practice')} />
            </>
          ) : null
        ) : null}

        {!isToday ? null : programme.todayDone ? (
          <P soft>
            {programme.nextStageTomorrow
              ? `Today's plan is done, and so is stage ${programme.today.stage}. Stage ${programme.today.stage + 1} starts tomorrow: ${dayPlan(programme.stageIndex + 1).title.toLowerCase()}.`
              : `Today's plan is done: day ${programme.today.day} of ${programme.today.days} in stage ${programme.today.stage}. Tomorrow you do 10 more of each. Come back tomorrow.`}
          </P>
        ) : remaining > 0 ? (
          <>
            <P soft>
              {remaining} more good {plural(remaining)} for today's plan.
            </P>
            <Button title={`Do the other ${remaining} now`} icon="camera" onPress={() => router.replace(setupRoute)} />
          </>
        ) : nextTask ? (
          <>
            <P soft>
              {target === 0 ? 'That was extra practice.' : `This part is done for today.`} Next in today's plan: {nextTask.name}, {nextTask.remaining} to go.
            </P>
            <Button title={`Go to ${nextTask.name}`} icon="arrow-forward" onPress={() => router.replace(taskRoute(nextTask, skills))} />
          </>
        ) : null}

        {worst ? (
          <P soft>
            Work on one thing: {worst.label.toLowerCase()}. {worst.message ?? t(BENCHMARK_BY_ID[worst.id].aim)}
          </P>
        ) : null}
        {stuck ? <P soft>This has been the main thing to fix in your last {STUCK_AFTER} sets. Watch that step again slowly, or ask the coach for a drill.</P> : null}
        {worst ? <Button title="Watch that step again" icon="play" kind="secondary" onPress={() => router.push(`/demo/${kind}?step=${stepForCheck(kind, worst.id)}`)} /> : null}
        {remaining === 0 ? <Button title="Extra practice" icon="camera" kind="ghost" onPress={() => router.replace(setupRoute)} /> : null}
      </Card>

      <H2>What the camera checked</H2>
      {reps.length ? <Small>Each check is averaged over the {reps.length} good ones.</Small> : null}
      <View style={styles.list}>
        {session.checks.map((c, i) => {
          const b = BENCHMARK_BY_ID[c.id];
          return (
            <View key={c.id} style={[styles.row, i < session.checks.length - 1 && styles.divider]}>
              <Ionicons name={c.value === null ? 'eye-off' : statusIcon[c.status]} size={24} color={c.value === null ? C.inkMute : statusColor[c.status]} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: sp(2) }}>
                  <Text style={styles.label}>
                    {c.label}
                    {isTip(c) ? <Text style={styles.tip}>  tip</Text> : null}
                  </Text>
                  <Text style={styles.value}>{c.unsure ? 'Held' : formatValue(c.id, c.value)}</Text>
                </View>
                <Text style={styles.detail}>{c.value === null ? (c.required && c.message ? c.message : c.unsure ? 'You held the bat, but the camera could not see its angle clearly. Stand against a plain wall so the bat shows up.' : 'The camera could not see this clearly.') : c.message ?? t(b.aim)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {info.selfCheck.length ? (
        <Card>
          <H3>Check these yourself</H3>
          <Small>{kind === 'grip' ? 'The camera cannot see your fingers. Look down at your hands.' : 'The camera cannot see the bat well. Check these yourself.'}</Small>
          {info.selfCheck.map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: sp(2.5), alignItems: 'flex-start' }}>
              <Ionicons name="hand-left" size={18} color={C.outfield} style={{ marginTop: 3 }} />
              <Text style={styles.self}>{line}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Button title="Ask the coach about this" icon="chatbubbles" kind="secondary" onPress={() => router.replace({ pathname: '/coach', params: { ask: question } })} />
      <Button title="Done" kind="ghost" onPress={() => router.replace('/practice')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
  score: { fontFamily: F.displayBold, fontSize: 88, lineHeight: 90, color: C.ink },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskName: { fontSize: 16, fontWeight: '600', color: C.ink },
  big: { fontFamily: F.displayBold, fontSize: 32, color: C.ink },
  of: { fontFamily: F.display, fontSize: 20, color: C.inkSoft },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 70, marginTop: sp(1) },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  bar: { width: '100%', maxWidth: 22, borderRadius: 4 },
  barLabel: { fontSize: 11, color: C.inkMute },
  photoFrame: { width: '100%', maxHeight: 480, alignSelf: 'center', borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.night },
  photo: { width: '100%', height: '100%' },
  nextPassed: { borderColor: C.good },
  list: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: sp(3), padding: sp(4) },
  divider: { borderBottomWidth: 1, borderBottomColor: C.line },
  label: { fontSize: 16, fontWeight: '600', color: C.ink },
  value: { fontSize: 14, color: C.inkSoft },
  detail: { fontSize: 14, lineHeight: 20, color: C.inkSoft },
  tip: { fontSize: 12, fontWeight: '700', color: C.inkMute, textTransform: 'uppercase', letterSpacing: 0.5 },
  self: { flex: 1, fontSize: 15, lineHeight: 22, color: C.ink },
});
