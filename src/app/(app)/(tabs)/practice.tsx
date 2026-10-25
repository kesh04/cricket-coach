import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, H1, H3, Screen, Seam, Small, StatusPill } from '@/components/ui';
import { SKILL_INFO } from '@/data/skills';
import { DAYS_PER_STAGE, dayPlan, DRILLS, KEEP_SHARP_REPS, planLine, STAGE_COUNT, STANCE_FIRST_REPS, type DayPlan } from '@/data/training';
import { CAMERA_SKILLS } from '@/lib/pose/benchmarks';
import { statusForScore } from '@/lib/pose/stanceAnalyzer';
import { StanceFirst } from '@/components/StanceFirst';
import { practiseRoute, taskRoute, useData, type SkillState } from '@/state/DataContext';
import { C, F, R, sp } from '@/theme';


/**
 * The Practise tab: today's plan, the weekly training plan, and every skill for extra practice.
 */
export default function Practice() {
  const { sessions, skills, programme, tasks, stanceReps } = useData();
  const { today, stageIndex, daysDone, todayDone, nextStageTomorrow, streak } = programme;

  return (
    <Screen>
      <H1>Practise</H1>

      {/* Today's plan */}
      <Card style={styles.today}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.todayLabel}>
              Stage {today.stage} · day {today.day} of {today.days}
            </Text>
            <Text style={styles.todayTitle}>{today.title}</Text>
            <Text style={styles.todayText}>{today.focus}</Text>
          </View>
          {streak > 0 ? (
            <View style={styles.streak}>
              <Ionicons name="flame" size={16} color="#FFFFFF" />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.todayLabel}>Today's practice (pick any, in any order)</Text>
        {tasks.map((t) => {
          const s = skills[t.skill];
          return (
            <View key={t.key} style={styles.task}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                <Ionicons name={t.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color="#FFFFFF" />
                <Text style={styles.taskName}>{t.name}</Text>
                <Text style={styles.taskCount}>
                  {Math.min(t.today, 999)}/{t.target}
                </Text>
              </View>
              <Seam value={Math.min(1, t.today / t.target)} total={20} color="#FFFFFF" track="rgba(255,255,255,0.25)" />
              {!t.done ? (
                <Button
                  title={!s.watched ? 'Watch and learn first' : t.today ? `Carry on: ${t.remaining} to go` : 'Start'}
                  icon={!s.watched ? 'play' : 'camera'}
                  kind="secondary"
                  onPress={() => router.push(taskRoute(t, skills))}
                />
              ) : null}
            </View>
          );
        })}
        {todayDone ? (
          <Text style={styles.todayText}>
            {nextStageTomorrow
              ? `Today's plan is done, and so is stage ${today.stage}. Stage ${today.stage + 1} starts tomorrow: ${dayPlan(stageIndex + 1).title.toLowerCase()}.`
              : `Today's plan is done. Well played. Tomorrow is day ${Math.min(today.day + 1, today.days)}: ${planLine(dayPlan(stageIndex, today.day + 1))}.`}
          </Text>
        ) : null}
      </Card>

      {/* The whole plan */}
      <View style={{ gap: sp(1) }}>
        <H3>Your training plan</H3>
        <Small>Each stage is {DAYS_PER_STAGE} days. Day 1 is 10 good ones, and every day adds 10 more, up to 50 on day 5. Miss a day and the plan waits for you.</Small>
      </View>
      <View>
        {Array.from({ length: STAGE_COUNT }, (_, i) => (
          <StageRow key={i} index={i} state={i < stageIndex ? 'done' : i === stageIndex ? 'now' : 'later'} daysDone={i === stageIndex ? daysDone : 0} last={i === STAGE_COUNT - 1} />
        ))}
        <Small style={{ marginLeft: 48 }}>After that: keep sharp with {KEEP_SHARP_REPS} full forward defences and {KEEP_SHARP_REPS} drives a day.</Small>
      </View>

      {/* Every skill, for watching again or extra practice */}
      <View style={{ gap: sp(1) }}>
        <H3>The skills</H3>
        <Small>Watch any skill again, or do extra practice. Pick footwork or the whole forward defence. Every one starts with a quick stance check.</Small>
      </View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
          <H3 style={{ flex: 1 }}>{SKILL_INFO.grip.name}</H3>
          {skills.grip.watched ? <Ionicons name="checkmark-circle" size={20} color={C.good} /> : null}
        </View>
        <View style={styles.why}>
          <Ionicons name="bulb" size={16} color={C.willowDeep} style={{ marginTop: 2 }} />
          <Text style={styles.whyText}>{SKILL_INFO.grip.why} The practice camera cannot see your fingers, so check your grip with a photo.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: sp(2) }}>
          <Button title={skills.grip.watched ? 'Watch again' : 'Watch and learn'} icon="play" kind={skills.grip.watched ? 'ghost' : 'primary'} onPress={() => router.push('/demo/grip')} style={{ flex: 1 }} />
          <Button title="Photo check" icon="camera" kind="secondary" onPress={() => router.push('/grip-check')} style={{ flex: 1 }} />
        </View>
        <Button title="Spot the mistake: 6 grips" icon="search" kind="ghost" onPress={() => router.push('/grip-quiz')} />
      </Card>
      {CAMERA_SKILLS.some((k) => skills[k].needsStance) ? (
        <Card style={{ borderColor: C.ball, borderWidth: 2 }}>
          <H3>The stance comes first</H3>
          <StanceFirst />
        </Card>
      ) : (
        // Shown once the shots are open, so it is always clear why they are open.
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
            <Ionicons name="lock-open" size={20} color={C.good} />
            <H3 style={{ flex: 1 }}>The shots are open</H3>
          </View>
          <Small>
            You have held {stanceReps} good stances with the camera ({STANCE_FIRST_REPS} were needed), so every shot is open.
          </Small>
        </Card>
      )}
      {CAMERA_SKILLS.map((k) => (
        <SkillCard key={k} state={skills[k]} />
      ))}

      <Pressable accessibilityRole="button" onPress={() => router.push('/how-to')} style={({ pressed }) => [styles.help, pressed && { opacity: 0.7 }]}>
        <Ionicons name="help-circle" size={24} color={C.outfield} />
        <Text style={styles.helpText}>How to use the app</Text>
        <Ionicons name="chevron-forward" size={20} color={C.inkMute} />
      </Pressable>

      <View style={{ gap: sp(2.5) }}>
        <H3>Your saved sets</H3>
        {sessions.length === 0 ? (
          <Small>Nothing yet. Each set you do with the camera shows here.</Small>
        ) : (
          <View style={styles.list}>
            {sessions.slice(0, 8).map((s, i, all) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => router.push(`/session/${s.id}`)}
                style={({ pressed }) => [styles.row, i < all.length - 1 && styles.divider, pressed && { backgroundColor: C.outfieldTint }]}>
                <Text style={styles.score}>{s.score}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.kind}>
                    {s.drill ? `${SKILL_INFO.defence.name} · ${DRILLS.find((d) => d.id === s.drill)?.name ?? ''}` : SKILL_INFO[s.kind ?? 'stance'].name}
                    {s.reps?.length ? ` · ${s.reps.length} good` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                    <StatusPill status={statusForScore(s.score)} compact />
                    <Small>{new Date(s.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Small>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.inkMute} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

/** One stage of the plan: what it is, how many each day, and the days done. */
function StageRow({ index, state, daysDone, last }: { index: number; state: 'done' | 'now' | 'later'; daysDone: number; last: boolean }) {
  const first: DayPlan = dayPlan(index, 1);
  const steps = first.tasks.filter((t) => t.drill);
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.marker, state === 'done' && styles.markerDone, state === 'now' && styles.markerOn]}>
          {state === 'done' ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : <Text style={[styles.markerText, state === 'now' && { color: '#FFFFFF' }, state === 'later' && { color: C.inkMute }]}>{first.stage}</Text>}
        </View>
        {last ? null : <View style={[styles.line, state === 'done' && { backgroundColor: C.good }]} />}
      </View>
      <View style={[styles.body, state === 'now' && styles.bodyOn, state === 'later' && { opacity: 0.75 }]}>
        <Text style={styles.weekLabel}>Stage {first.stage} · {DAYS_PER_STAGE} days</Text>
        <H3>{first.title}</H3>
        {steps.length ? (
          <View style={{ gap: 2 }}>
            {steps.map((t) => (
              <Small key={t.drill}>{DRILLS.find((d) => d.id === t.drill)!.name}</Small>
            ))}
          </View>
        ) : null}
        <Small>
          {steps.length ? 'Each step, day 1 to day 5: ' : 'Day 1 to day 5: '}
          {Array.from({ length: DAYS_PER_STAGE }, (_, d) => dayPlan(index, d + 1).tasks[0].reps).join(' → ')}
        </Small>
        {state === 'now' ? (
          <View style={styles.days} accessibilityLabel={`${daysDone} of ${DAYS_PER_STAGE} days done`}>
            {Array.from({ length: DAYS_PER_STAGE }, (_, i) => (
              <View key={i} style={[styles.day, i < daysDone && styles.dayDone]}>
                <Text style={[styles.dayText, i < daysDone && { color: '#FFFFFF' }]}>{dayPlan(index, i + 1).tasks[0].reps}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A skill: why it matters, and links to watch it again or practise it. */
function SkillCard({ state }: { state: SkillState }) {
  const info = SKILL_INFO[state.skill];
  return (
    <Card style={!state.unlocked ? { opacity: 0.7 } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
        <H3 style={{ flex: 1 }}>{info.name}</H3>
        {!state.unlocked ? <Ionicons name="lock-closed" size={18} color={C.inkMute} /> : state.watched ? <Ionicons name="checkmark-circle" size={20} color={C.good} /> : null}
      </View>
      <View style={styles.why}>
        <Ionicons name="bulb" size={16} color={C.willowDeep} style={{ marginTop: 2 }} />
        <Text style={styles.whyText}>{info.why}</Text>
      </View>
      {!state.unlocked ? (
        <Small>{state.needsStance ? `Opens after your first ${STANCE_FIRST_REPS} good stances.` : 'Opens when your training plan reaches it.'}</Small>
      ) : (
        <View style={{ flexDirection: 'row', gap: sp(2) }}>
          <Button title={state.watched ? 'Watch again' : 'Watch and learn'} icon="play" kind={state.watched ? 'ghost' : 'primary'} onPress={() => router.push(`/demo/${state.skill}`)} style={{ flex: 1 }} />
          {state.watched && state.skill !== 'defence' ? <Button title="Practise" icon="camera" kind="secondary" onPress={() => router.push(`/setup?skill=${state.skill}`)} style={{ flex: 1 }} /> : null}
        </View>
      )}
      {state.unlocked && state.watched && state.skill === 'defence' ? (
        <View style={{ gap: sp(1.5) }}>
          {DRILLS.map((d) => (
            <Button key={d.id} title={d.name} icon="camera" kind="secondary" onPress={() => router.push(practiseRoute(state, d.id))} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  first: { borderColor: C.ball, borderWidth: 2 },
  firstLabel: { color: C.ball, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  today: { backgroundColor: C.outfield, borderColor: C.outfield },
  todayLabel: { color: '#DDEBE3', fontSize: 13, fontWeight: '600' },
  todayTitle: { color: '#FFFFFF', fontFamily: F.display, fontSize: 26 },
  todayText: { color: '#DDEBE3', fontSize: 15, lineHeight: 21 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.ball, borderRadius: R.pill, paddingHorizontal: sp(2.5), paddingVertical: 4 },
  streakText: { color: '#FFFFFF', fontWeight: '700' },
  task: { gap: sp(2), backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: R.md, padding: sp(3) },
  taskName: { flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  taskCount: { color: '#FFFFFF', fontFamily: F.displayBold, fontSize: 24 },
  step: { flexDirection: 'row', gap: sp(3) },
  rail: { alignItems: 'center', width: 36 },
  marker: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  markerOn: { backgroundColor: C.outfield, borderColor: C.outfield },
  markerDone: { backgroundColor: C.good, borderColor: C.good },
  markerText: { fontFamily: F.displayBold, fontSize: 18, color: C.outfield },
  line: { flex: 1, width: 3, backgroundColor: C.line, marginVertical: 4, borderRadius: 2 },
  body: { flex: 1, gap: sp(1.5), backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: sp(4), marginBottom: sp(3) },
  bodyOn: { borderColor: C.outfield, borderWidth: 2 },
  weekLabel: { fontSize: 12, fontWeight: '700', color: C.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  why: { flexDirection: 'row', gap: sp(1.5), backgroundColor: '#FBF3E2', borderRadius: R.md, padding: sp(2.5) },
  whyText: { flex: 1, fontSize: 14, lineHeight: 20, color: C.ink },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: sp(1) },
  day: { minWidth: 34, height: 30, paddingHorizontal: 4, borderRadius: 15, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  dayDone: { backgroundColor: C.good, borderColor: C.good },
  dayText: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
  help: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5), minHeight: 52, paddingHorizontal: sp(4), borderRadius: R.lg, backgroundColor: C.outfieldTint },
  helpText: { flex: 1, fontSize: 16, fontWeight: '600', color: C.outfield },
  list: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(3.5), paddingHorizontal: sp(4), paddingVertical: sp(3), minHeight: 64 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.line },
  score: { fontFamily: F.displayBold, fontSize: 34, color: C.ink, width: 52 },
  kind: { fontSize: 15, fontWeight: '600', color: C.ink },
});
