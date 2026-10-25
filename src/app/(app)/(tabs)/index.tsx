import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StanceFigure } from '@/components/StanceFigure';
import { Button, Card, H1, H3, Notice, P, Screen, Seam, Small, type IconName } from '@/components/ui';
import { LESSONS, LEVELS } from '@/data/curriculum';
import { SKILL_INFO } from '@/data/skills';
import { dayPlan } from '@/data/training';
import { introSeen, markIntroSeen } from '@/services/flags';
import { useAuth, useProfile } from '@/state/AuthContext';
import { taskRoute, useData } from '@/state/DataContext';
import { C, F, R, sp } from '@/theme';

export default function Home() {
  const profile = useProfile();
  const { user } = useAuth();
  const { next, passed, skills, programme, tasks, nextTask, saveError } = useData();
  const firstName = profile.name.split(' ')[0];
  const { today, todayDone, streak, nextStageTomorrow, stageIndex } = programme;
  // Where the button goes: the next unfinished task of today's plan.
  const target = nextTask ? taskRoute(nextTask, skills) : '/practice';

  // Show the guide to the app once, the first time a learner arrives here.
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void introSeen(uid).then((seen) => {
      if (seen || !alive) return;
      void markIntroSeen(uid);
      router.push('/how-to');
    });
    return () => {
      alive = false;
    };
  }, [uid]);
  const level = next ? LEVELS.find((l) => l.number === next.level) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <H1>Hello, {firstName}</H1>
          <Small style={{ marginTop: sp(1) }}>{profile.battingHand === 'right' ? 'Right-handed batter' : 'Left-handed batter'}</Small>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Your profile" hitSlop={10} onPress={() => router.push('/profile')}>
          <Ionicons name="person-circle" size={44} color={C.outfield} />
        </Pressable>
      </View>

      {saveError ? <Notice tone="warn" icon="cloud-offline">{saveError}</Notice> : null}

      <Card>
        <Small>{next ? `Next lesson, level ${next.level}: ${level?.title}` : 'All lessons passed'}</Small>
        <H3>{next ? next.title : 'You have finished every lesson'}</H3>
        <P soft>{next ? next.summary : 'Keep your grip and stance sharp with the camera, or go back over any lesson.'}</P>
        <Seam value={passed.size / LESSONS.length} total={LESSONS.length * 2} />
        <Small>
          {passed.size} of {LESSONS.length} lessons passed
        </Small>
        <Button title={next ? 'Start lesson' : 'Open lessons'} onPress={() => (next ? router.push(`/lesson/${next.id}`) : router.push('/learn'))} />
      </Card>

      <View style={styles.stanceCard}>
        <StanceFigure hand={profile.battingHand} height={230} interactive={false} style={{ borderRadius: 0 }} />
        <View style={styles.stanceBody}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stanceLabel}>
              Stage {today.stage} · day {today.day} of {today.days}
              {streak > 0 ? ` · ${streak} ${streak === 1 ? 'day' : 'days'} in a row` : ''}
            </Text>
            <Text style={styles.stanceTitle}>Today: {today.title.toLowerCase()}</Text>
            {tasks.map((t) => (
              <Text key={t.key} style={styles.stanceText}>
                {t.done ? '✓ ' : '• '}
                {t.name}: {Math.min(t.today, 999)} of {t.target}
              </Text>
            ))}
            {todayDone ? (
              <Text style={styles.stanceText}>{nextStageTomorrow ? `Stage ${today.stage} done! Tomorrow: ${dayPlan(stageIndex + 1).title.toLowerCase()}.` : 'Done for today. Come back tomorrow.'}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ padding: sp(4), paddingTop: 0, gap: sp(2) }}>
          <Button
            title={todayDone ? 'See your plan' : nextTask && !skills[nextTask.skill].watched ? 'Watch and learn first' : 'Practise now'}
            icon={nextTask && !skills[nextTask.skill].watched ? 'play' : todayDone ? 'list' : 'camera'}
            kind="secondary"
            onPress={() => router.push(target)}
          />
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/how-to')} style={({ pressed }) => [styles.help, pressed && { opacity: 0.7 }]}>
        <Ionicons name="help-circle" size={24} color={C.outfield} />
        <Text style={styles.helpText}>How to use the app</Text>
        <Ionicons name="chevron-forward" size={20} color={C.inkMute} />
      </Pressable>

      <View style={{ flexDirection: 'row', gap: sp(3) }}>
        <Tool icon="clipboard" title="Score book" text="Score a match ball by ball" onPress={() => router.push('/tools/scorebook')} />
        <Tool icon="stats-chart" title="My matches" text="Your runs, best score and average" onPress={() => router.push('/matches')} />
        <Tool icon="map" title="Field trainer" text="Learn the fielding positions" onPress={() => router.push('/tools/field')} />
      </View>
    </Screen>
  );
}

function Tool({ icon, title, text, onPress }: { icon: IconName; title: string; text: string; onPress: () => void }) {
  return (
    <Card style={{ flex: 1 }} onPress={onPress}>
      <Ionicons name={icon} size={26} color={C.outfield} />
      <H3>{title}</H3>
      <Small>{text}</Small>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  stanceCard: { backgroundColor: C.outfield, borderRadius: R.lg, overflow: 'hidden' },
  stanceBody: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4) },
  stanceOf: { fontFamily: F.display, fontSize: 24, color: '#DDEBE3' },
  stanceLabel: { color: '#DDEBE3', fontSize: 13, fontWeight: '600' },
  help: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5), minHeight: 52, paddingHorizontal: sp(4), borderRadius: R.lg, backgroundColor: C.outfieldTint },
  helpText: { flex: 1, fontSize: 16, fontWeight: '600', color: C.outfield },
  stanceTitle: { fontFamily: F.display, fontSize: 24, color: '#FFFFFF' },
  stanceText: { color: '#DDEBE3', fontSize: 15, lineHeight: 21, marginTop: 2 },
  stanceScore: { fontFamily: F.displayBold, fontSize: 52, color: '#FFFFFF' },
});
