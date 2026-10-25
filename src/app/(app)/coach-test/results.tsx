import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Choice, H2, H3, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { agreement, trialsCsv } from '@/lib/agreement';
import { CAMERA_SKILLS, SKILL_SHORT, type Skill } from '@/lib/pose/benchmarks';
import { backend, type CoachTrial } from '@/services/backend';
import { useAuth } from '@/state/AuthContext';
import { C, F, R, sp } from '@/theme';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

/** Agreement between the app and the coach, from the coach test. */
export default function CoachTestResults() {
  const { user } = useAuth();
  const [trials, setTrials] = useState<CoachTrial[] | null>(null);
  const [skill, setSkill] = useState<Skill | 'all'>('all');
  const [csv, setCsv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setTrials(await backend.list(user.uid, 'coachTrials', 2000));
    } catch (e) {
      setError((e as Error).message);
      setTrials([]);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = (trials ?? []).filter((t) => skill === 'all' || t.skill === skill);
  const a = agreement(shown);

  const exportCsv = async () => {
    const text = trialsCsv(shown);
    setCsv(text);
    if (Platform.OS !== 'web') {
      try {
        await Share.share({ message: text, title: 'Coach test results' });
      } catch {
        // The table is shown on screen to copy instead.
      }
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Coach test results" />
      <Choice value={skill} onChange={setSkill} options={[{ value: 'all', label: 'All' }, ...CAMERA_SKILLS.map((k) => ({ value: k, label: SKILL_SHORT[k] }))]} />
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {trials === null ? <P soft>Loading…</P> : null}
      {trials !== null && shown.length === 0 ? <P soft>No trials yet. Run the coach test first.</P> : null}

      {shown.length ? (
        <>
          <View style={styles.figures}>
            <Figure value={pct(a.accuracy)} label="Agreement" />
            <Figure value={a.kappa === null ? '–' : a.kappa.toFixed(2)} label="Cohen's kappa" />
            <Figure value={String(a.n)} label="Trials judged" />
          </View>
          {a.unseen ? <Small>{a.unseen} more trials were left out because the app could not see the learner when the coach pressed.</Small> : null}

          <Card>
            <H3>Coach against app</H3>
            <View style={styles.table}>
              <Cell text="" head />
              <Cell text="App: good" head />
              <Cell text="App: not good" head />
              <Cell text="Coach: good" head />
              <Cell text={String(a.both)} good />
              <Cell text={String(a.coachOnly)} />
              <Cell text="Coach: not good" head />
              <Cell text={String(a.appOnly)} />
              <Cell text={String(a.neither)} good />
            </View>
            <Small>Green boxes are agreements. Of the positions the coach called not good, the app caught {pct(a.catchesFaults)}. Of those the coach called good, the app accepted {pct(a.acceptsGood)}.</Small>
          </Card>

          <Card>
            <H3>How to read kappa</H3>
            <Small>Kappa is agreement after taking away agreement by chance. A common guide (Landis and Koch, 1977): 0.41 to 0.60 moderate, 0.61 to 0.80 substantial, above 0.80 almost perfect. Report the number of trials and coaches with it.</Small>
          </Card>

          <Button title="Export the table (CSV)" icon="share-outline" onPress={() => void exportCsv()} />
          {csv ? (
            <View style={styles.csv}>
              <Text selectable style={styles.csvText}>
                {csv}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
      <H2 style={{ marginTop: sp(2) }}>Steps for a fair test</H2>
      <Small>1. Hide the app's score from the coach. 2. Mix good positions with positions that have one fault. 3. Let the coach decide before looking at the phone. 4. Use the same phone position as in practice. 5. Report the real numbers, whatever they are.</Small>
    </Screen>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.figure}>{value}</Text>
      <Small>{label}</Small>
    </View>
  );
}

function Cell({ text, head, good }: { text: string; head?: boolean; good?: boolean }) {
  return (
    <View style={[styles.cell, good && { backgroundColor: '#DDF3E6' }]}>
      <Text style={[styles.cellText, head && { fontWeight: '700', fontSize: 13, color: C.inkSoft }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', gap: sp(3) },
  figure: { fontFamily: F.displayBold, fontSize: 40, color: C.ink },
  table: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: C.line, borderRadius: R.md, overflow: 'hidden' },
  cell: { width: '33.33%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: C.line, padding: sp(1) },
  cellText: { fontSize: 18, color: C.ink, textAlign: 'center' },
  csv: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: sp(3) },
  csvText: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11, color: C.ink },
});
