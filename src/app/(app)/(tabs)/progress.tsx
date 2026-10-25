import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LineChart } from '@/components/LineChart';
import { PracticeCalendar } from '@/components/PracticeCalendar';
import { Button, Card, Choice, H1, H3, P, Screen, Seam, Small } from '@/components/ui';
import { LESSONS, LEVELS } from '@/data/curriculum';
import { SKILL_INFO } from '@/data/skills';
import { BENCHMARKS_BY_SKILL, CAMERA_SKILLS, SKILL_SHORT, type Skill } from '@/lib/pose/benchmarks';
import { statusForScore } from '@/lib/pose/stanceAnalyzer';
import { levelProgress, useData } from '@/state/DataContext';
import { C, F, sp, statusColor, statusIcon } from '@/theme';

export default function Progress() {
  const { sessions: all, skills, passed, quizAttempts, programme } = useData();

  // One skill at a time. Starts on the skill practised most recently.
  const [chosen, setChosen] = useState<Skill | null>(null);
  const lastKind = all[0]?.kind;
  const skill: Skill = chosen ?? (lastKind && lastKind !== 'grip' ? lastKind : 'stance');
  const info = SKILL_INFO[skill];
  const sessions = skills[skill].attempts;

  // Oldest to newest, last twelve checks.
  const recent = sessions.slice(0, 12).reverse();
  const points = recent.map((s) => ({ value: s.score, label: new Date(s.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }));
  const best = sessions.reduce((m, s) => Math.max(m, s.score), 0);
  const latest = sessions[0]?.score ?? null;

  // Average score for each check over the last ten tries, weakest first.
  const window = sessions.slice(0, 10);
  const averages = BENCHMARKS_BY_SKILL[skill].map((b) => {
    const seen = window.map((s) => s.checks.find((c) => c.id === b.id)).filter((c) => c && c.value !== null);
    const avg = seen.length ? Math.round(seen.reduce((t, c) => t + c!.score, 0) / seen.length) : null;
    return { id: b.id, label: seen[0]?.label ?? b.label, aim: b.aim, avg };
  })
    .filter((a) => a.avg !== null)
    .sort((a, b) => a.avg! - b.avg!);

  // First try at each lesson's quiz.
  const firstTries = new Map<string, boolean>();
  for (const a of quizAttempts.slice().sort((x, y) => x.at - y.at)) {
    if (!firstTries.has(a.lessonId)) firstTries.set(a.lessonId, a.passed);
  }
  const firstTryPasses = [...firstTries.values()].filter(Boolean).length;

  return (
    <Screen>
      <H1>Progress</H1>

      <PracticeCalendar days={programme.days} quizzes={quizAttempts} streak={programme.streak} />

      <Choice value={skill} onChange={setChosen} options={CAMERA_SKILLS.map((k) => ({ value: k, label: SKILL_SHORT[k] }))} />

      <Card>
        <H3>{info.name}: score</H3>
        {sessions.length === 0 ? (
          <>
            <P soft>No saved tries yet. Practise with the camera and your score will be tracked here.</P>
            <Button title="Open the Practise tab" icon="camera" onPress={() => router.push('/practice')} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: sp(6) }}>
              <Figure value={latest!} label="Latest" />
              <Figure value={best} label="Best" />
              <Figure value={sessions.length} label={sessions.length === 1 ? 'Try' : 'Tries'} />
            </View>
            <LineChart
              points={points}
              describe={`Score for your last ${points.length} tries at ${info.name.toLowerCase()}, oldest to newest: ${points.map((p) => p.value).join(', ')}.`}
            />
            <Small>Score out of 100 for your last {points.length} {points.length === 1 ? 'try' : 'tries'}, oldest on the left. Tap a point to read it.</Small>
          </>
        )}
      </Card>

      {averages.length ? (
        <Card>
          <H3>What to work on</H3>
          <Small>Average for each part of your {info.noun} over your last {window.length} {window.length === 1 ? 'try' : 'tries'}. Weakest first.</Small>
          <View style={{ gap: sp(3.5), marginTop: sp(1) }}>
            {averages.map((a) => {
              const status = statusForScore(a.avg!);
              return (
                <View key={a.id} style={{ gap: sp(1.5) }}>
                  <View style={styles.barHead}>
                    <Ionicons name={statusIcon[status]} size={18} color={statusColor[status]} />
                    <Text style={styles.barLabel}>{a.label}</Text>
                    <Text style={styles.barValue}>{a.avg}</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${a.avg ?? 0}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card>
        <H3>Lessons</H3>
        <Small>
          {passed.size} of {LESSONS.length} passed
          {firstTries.size ? `. Passed first time: ${firstTryPasses} of ${firstTries.size} quizzes tried.` : '.'}
        </Small>
        <View style={{ gap: sp(3.5), marginTop: sp(1) }}>
          {LEVELS.map((level) => {
            const { done, total } = levelProgress(level.number, passed);
            return (
              <View key={level.number} style={{ gap: sp(1.5) }}>
                <View style={styles.barHead}>
                  <Text style={styles.barLabel}>
                    Level {level.number}: {level.title}
                  </Text>
                  <Text style={styles.barValue}>
                    {done} of {total}
                  </Text>
                </View>
                <Seam value={total ? done / total : 0} total={total * 4} />
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View>
      <Text style={styles.figure}>{value}</Text>
      <Small>{label}</Small>
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { fontFamily: F.displayBold, fontSize: 44, lineHeight: 46, color: C.ink },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  barLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.ink },
  barValue: { fontSize: 15, color: C.inkSoft, fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: 4, backgroundColor: C.outfieldTint, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 4, backgroundColor: C.outfield },
});
