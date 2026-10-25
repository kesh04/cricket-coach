import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, H3, Small } from '@/components/ui';
import { LESSON_BY_ID } from '@/data/curriculum';
import { SKILL_INFO } from '@/data/skills';
import { DRILL_BY_ID, dayKey, taskKey, type DayStatus, type Programme } from '@/data/training';
import { SKILLS } from '@/lib/pose/benchmarks';
import type { QuizAttempt } from '@/services/backend';
import { C, F, R, sp } from '@/theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const TINT: Record<DayStatus, { bg: string; fg: string }> = {
  done: { bg: C.good, fg: '#FFFFFF' },
  some: { bg: '#F6D58A', fg: C.ink },
  none: { bg: 'transparent', fg: C.ink },
};

/**
 * A month of practice. Green: the whole day's plan was done. Yellow: some practice.
 * Plain: nothing. Tap a day to see what was done on it.
 */
export function PracticeCalendar({ days, quizzes, streak }: { days: Programme['days']; quizzes: QuizAttempt[]; streak: number }) {
  const dayStatus = (d: { status: DayStatus } | undefined): DayStatus => d?.status ?? 'none';
  const todayKey = dayKey(Date.now());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(todayKey);

  // Quizzes passed on each day.
  const quizByDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const q of quizzes) {
      if (!q.passed) continue;
      const k = dayKey(q.at);
      m.set(k, [...(m.get(k) ?? []), LESSON_BY_ID[q.lessonId]?.title ?? q.lessonId]);
    }
    return m;
  }, [quizzes]);

  // The grid starts on the Monday on or before the 1st.
  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= count; d++) out.push(dayKey(new Date(month.getFullYear(), month.getMonth(), d, 12).getTime()));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  // Summary of the month shown.
  const monthDays = cells.filter((c): c is string => !!c && c <= todayKey);
  const goalDays = monthDays.filter((k) => dayStatus(days.get(k)) === 'done').length;
  const anyDays = monthDays.filter((k) => dayStatus(days.get(k)) !== 'none').length;

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const isThisMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  const record = days.get(selected);
  const quizList = quizByDay.get(selected) ?? [];
  const selectedDate = new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8, 10)));

  return (
    <Card>
      <View style={styles.head}>
        <H3>Practice calendar</H3>
        {streak > 0 ? (
          <View style={styles.streak}>
            <Ionicons name="flame" size={16} color={C.ball} />
            <Text style={styles.streakText}>{streak} in a row</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} onPress={() => shift(-1)} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={C.outfield} />
        </Pressable>
        <Text style={styles.month}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: isThisMonth }} disabled={isThisMonth} hitSlop={10} onPress={() => shift(1)} style={[styles.arrow, isThisMonth && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={22} color={C.outfield} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`w${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
        {cells.map((k, i) => {
          if (!k) return <View key={`e${i}`} style={styles.cell} />;
          const status = dayStatus(days.get(k));
          const future = k > todayKey;
          const tint = TINT[status];
          const missed = !future && status === 'none' && k < todayKey;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={`${Number(k.slice(8))}: ${future ? 'not yet' : status === 'done' ? 'daily goal done' : status === 'some' ? 'some practice' : 'no practice'}`}
              accessibilityState={{ selected: selected === k }}
              disabled={future}
              onPress={() => setSelected(k)}
              style={styles.cell}>
              <View style={[styles.dayCircle, { backgroundColor: tint.bg }, k === todayKey && styles.today, selected === k && styles.selected, future && { opacity: 0.35 }]}>
                <Text style={[styles.dayText, { color: tint.fg }, missed && { color: C.inkMute }]}>{Number(k.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Legend color={C.good} label="Plan done" />
        <Legend color="#F6D58A" label="Some" />
        <Legend color={C.line} label="None" />
      </View>
      <Small>
        This month: whole plan done on {goalDays} {goalDays === 1 ? 'day' : 'days'}, practised on {anyDays} of {monthDays.length} {monthDays.length === 1 ? 'day' : 'days'} so far.
      </Small>

      {/* What was done on the chosen day */}
      <View style={styles.detail}>
        <Text style={styles.detailTitle}>{selected === todayKey ? 'Today' : selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        {record ? <Small>Stage {record.plan.stage}, day {record.plan.day}: {record.plan.title.toLowerCase()}</Small> : null}
        {record?.plan.tasks.map((task) => {
          const n = record.reps[taskKey(task)] ?? 0;
          return (
            <View key={taskKey(task)} style={styles.detailRow}>
              <Ionicons name={n >= task.reps ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={n >= task.reps ? C.good : C.warn} />
              <Text style={styles.detailText}>
                {task.drill ? DRILL_BY_ID[task.drill].name : SKILL_INFO[task.skill].name}: {n} of {task.reps}
                {n >= task.reps ? '' : ` (${task.reps - n} short)`}
              </Text>
            </View>
          );
        })}
        {SKILLS.filter((k) => (record?.reps[k] ?? 0) > 0 && !record?.plan.tasks.some((t) => taskKey(t) === k)).map((k) => (
          <View key={k} style={styles.detailRow}>
            <Ionicons name="add-circle" size={18} color={C.outfield} />
            <Text style={styles.detailText}>
              Extra: {SKILL_INFO[k].name.toLowerCase()}, {record!.reps[k]} good
            </Text>
          </View>
        ))}
        {quizList.map((title, i) => (
          <View key={`${title}${i}`} style={styles.detailRow}>
            <Ionicons name="school" size={18} color={C.outfield} />
            <Text style={styles.detailText}>Lesson passed: {title}</Text>
          </View>
        ))}
        {!record && !quizList.length ? <Small>{selected === todayKey ? 'Nothing yet today.' : 'No practice on this day.'}</Small> : null}
      </View>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text style={{ fontSize: 13, color: C.inkSoft }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FDECEC', borderRadius: R.pill, paddingHorizontal: sp(2.5), paddingVertical: 4 },
  streakText: { fontSize: 13, fontWeight: '700', color: C.ball },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: F.display, fontSize: 20, color: C.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '700', color: C.inkMute, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: '82%', height: '82%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 2, borderColor: C.outfield },
  selected: { borderWidth: 3, borderColor: C.ink },
  dayText: { fontSize: 14, fontWeight: '600' },
  legend: { flexDirection: 'row', gap: sp(4) },
  detail: { gap: sp(1.5), borderTopWidth: 1, borderTopColor: C.line, paddingTop: sp(3) },
  detailTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  detailText: { flex: 1, fontSize: 15, color: C.ink },
});
