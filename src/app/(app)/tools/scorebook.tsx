import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, H3, Notice, Screen, Small, TopBar } from '@/components/ui';
import { backend, newId, type Innings } from '@/services/backend';
import { useAuth } from '@/state/AuthContext';
import { C, F, R, sp } from '@/theme';

// One entry per ball: runs off the bat ("0" to "6"), "W" wicket, "Wd" wide, "Nb" no-ball.
// A wide or a no-ball adds one run and has to be bowled again.
const isLegal = (b: string) => b !== 'Wd' && b !== 'Nb';

export function tally(log: string[]) {
  let runs = 0;
  let wickets = 0;
  let balls = 0;
  let extras = 0;
  for (const b of log) {
    if (b === 'W') wickets++;
    else if (b === 'Wd' || b === 'Nb') {
      runs++;
      extras++;
    } else runs += Number(b);
    if (isLegal(b)) balls++;
  }
  return { runs, wickets, balls, extras };
}

const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** The balls of the over in progress. */
function currentOver(log: string[]): string[] {
  let legal = 0;
  let start = 0;
  log.forEach((b, i) => {
    if (isLegal(b)) {
      legal++;
      if (legal % 6 === 0) start = i + 1;
    }
  });
  return log.slice(start);
}

export default function Scorebook() {
  const { user } = useAuth();
  const [team, setTeam] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [saved, setSaved] = useState<Innings[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    backend.list(user.uid, 'scorebook', 20).then(setSaved, () => {});
  }, [user]);

  const t = useMemo(() => tally(log), [log]);
  const allOut = t.wickets >= 10;
  const over = currentOver(log);
  const runRate = t.balls ? (t.runs / (t.balls / 6)).toFixed(2) : '0.00';

  const add = (b: string) => {
    if (!allOut) setLog((l) => [...l, b]);
  };

  const save = async () => {
    if (!user || log.length === 0) return;
    const innings: Innings = { id: newId(), team: team.trim() || 'My team', ...t, log, at: Date.now() };
    setSaved((s) => [innings, ...s]);
    setLog([]);
    setTeam('');
    try {
      await backend.add(user.uid, 'scorebook', innings);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Score book" />

      <View style={styles.board}>
        <Text style={styles.total}>
          {t.runs}/{t.wickets}
        </Text>
        <View style={{ gap: 2 }}>
          <Text style={styles.boardText}>Overs {oversText(t.balls)}</Text>
          <Text style={styles.boardText}>Run rate {runRate}</Text>
          <Text style={styles.boardText}>Extras {t.extras}</Text>
        </View>
      </View>

      <View style={styles.over} accessibilityLabel={`This over: ${over.join(', ') || 'no balls yet'}`}>
        <Small>This over</Small>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), flex: 1 }}>
          {over.length === 0 ? <Small>No balls yet</Small> : null}
          {over.map((b, i) => (
            <View key={i} style={[styles.ball, b === 'W' && { backgroundColor: C.ball, borderColor: C.ball }]}>
              <Text style={[styles.ballText, b === 'W' && { color: '#FFFFFF' }]}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {allOut ? <Notice>All out. Save the innings to start a new one.</Notice> : null}

      <View style={styles.pad}>
        {['0', '1', '2', '3', '4', '6'].map((r) => (
          <Key key={r} label={r} hint={`${r} runs`} onPress={() => add(r)} disabled={allOut} />
        ))}
        <Key label="Wide" onPress={() => add('Wd')} disabled={allOut} small />
        <Key label="No-ball" onPress={() => add('Nb')} disabled={allOut} small />
        <Key label="Wicket" onPress={() => add('W')} disabled={allOut} small danger />
      </View>

      <Button title="Undo last ball" kind="secondary" icon="arrow-undo" disabled={log.length === 0} onPress={() => setLog((l) => l.slice(0, -1))} />

      <Card>
        <Field label="Team name" value={team} onChangeText={setTeam} placeholder="My team" />
        <Button title="End innings and save" disabled={log.length === 0} onPress={save} />
        {error ? <Text style={{ color: C.bad }}>{error}</Text> : null}
      </Card>

      {saved.length ? (
        <View style={{ gap: sp(2) }}>
          <H3>Saved innings</H3>
          {saved.map((s) => (
            <View key={s.id} style={styles.savedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedTeam}>{s.team}</Text>
                <Small>
                  {new Date(s.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, {oversText(s.balls)} overs
                </Small>
              </View>
              <Text style={styles.savedScore}>
                {s.runs}/{s.wickets}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function Key({ label, hint, onPress, disabled, small, danger }: { label: string; hint?: string; onPress: () => void; disabled?: boolean; small?: boolean; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.key, danger && { borderColor: C.ball }, disabled && { opacity: 0.4 }, pressed && { backgroundColor: C.outfieldTint }]}>
      <Text style={[small ? styles.keySmall : styles.keyText, danger && { color: C.ball }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: { backgroundColor: C.night, borderRadius: R.lg, padding: sp(5), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  total: { fontFamily: F.displayBold, fontSize: 76, lineHeight: 78, color: '#FFFFFF' },
  boardText: { color: '#D5DDD7', fontSize: 15, fontVariant: ['tabular-nums'] },
  over: { flexDirection: 'row', alignItems: 'center', gap: sp(3), minHeight: 40 },
  ball: { minWidth: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  ballText: { fontSize: 14, fontWeight: '700', color: C.ink },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2.5) },
  key: { flexBasis: '30%', flexGrow: 1, minHeight: 62, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: F.displayBold, fontSize: 30, color: C.ink },
  keySmall: { fontSize: 16, fontWeight: '700', color: C.ink },
  savedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: sp(3.5) },
  savedTeam: { fontSize: 16, fontWeight: '600', color: C.ink },
  savedScore: { fontFamily: F.displayBold, fontSize: 28, color: C.ink },
});
