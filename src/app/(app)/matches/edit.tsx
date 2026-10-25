import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Choice, Field, H3, Notice, Screen, Small, TopBar } from '@/components/ui';
import { batted, checkMatch, FORMATS, HOW_OUT, oversText, parseOvers, RESULTS } from '@/data/matchStats';
import { newId, type HowOut, type MatchFormat, type MatchRecord, type MatchResult } from '@/services/backend';
import { useMatches } from '@/state/useMatches';
import { C, sp } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const dateText = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** "2026-10-25" to local midnight, or NaN. */
function parseDate(text: string): number {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!m) return NaN;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : NaN;
}
const midnight = (offsetDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
};
/** A whole number from a box, 0 when empty. */
const num = (t: string) => (t.trim() === '' ? 0 : Number.parseInt(t, 10));
const digits = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 4);

/** Add a match, or change one (with ?id=). */
export default function EditMatch() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { matches, loaded, save, remove } = useMatches();
  const existing = useMemo(() => (id ? matches.find((m) => m.id === id) ?? null : null), [id, matches]);

  const [date, setDate] = useState(dateText(midnight()));
  const [opponent, setOpponent] = useState('');
  const [format, setFormat] = useState<MatchFormat>('short');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [howOut, setHowOut] = useState<HowOut>('caught');
  const [runs, setRuns] = useState('');
  const [balls, setBalls] = useState('');
  const [fours, setFours] = useState('');
  const [sixes, setSixes] = useState('');
  const [bowled, setBowled] = useState(false);
  const [overs, setOvers] = useState('');
  const [runsConceded, setRunsConceded] = useState('');
  const [wickets, setWickets] = useState('');
  const [catches, setCatches] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Fill the form once when changing a saved match.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (!existing || filled) return;
    setFilled(true);
    setDate(dateText(existing.at));
    setOpponent(existing.opponent);
    setFormat(existing.format);
    setResult(existing.result);
    setHowOut(existing.howOut);
    setRuns(String(existing.runs));
    setBalls(existing.balls === null ? '' : String(existing.balls));
    setFours(existing.fours ? String(existing.fours) : '');
    setSixes(existing.sixes ? String(existing.sixes) : '');
    setBowled(existing.bowled);
    setOvers(existing.bowled ? oversText(existing.ballsBowled) : '');
    setRunsConceded(existing.bowled ? String(existing.runsConceded) : '');
    setWickets(existing.bowled ? String(existing.wickets) : '');
    setCatches(existing.catches ? String(existing.catches) : '');
    setNotes(existing.notes);
  }, [existing, filled]);

  const didBat = batted({ howOut });

  const submit = async () => {
    setFailed(null);
    const ballsBowled = bowled ? parseOvers(overs) : 0;
    const record: Omit<MatchRecord, 'id' | 'savedAt'> = {
      at: parseDate(date),
      opponent: opponent.trim().slice(0, 60),
      format,
      result,
      howOut,
      runs: didBat ? num(runs) : 0,
      balls: didBat && balls.trim() !== '' ? num(balls) : null,
      fours: didBat ? num(fours) : 0,
      sixes: didBat ? num(sixes) : 0,
      bowled,
      ballsBowled: ballsBowled ?? 0,
      runsConceded: bowled ? num(runsConceded) : 0,
      wickets: bowled ? num(wickets) : 0,
      catches: num(catches),
      notes: notes.trim().slice(0, 300),
    };
    const e = checkMatch(record);
    if (didBat && runs.trim() === '') e.runs = 'Enter your runs (0 if you were out without scoring).';
    if (bowled && ballsBowled === null) e.overs = 'Write overs like 4 or 3.2 (the part after the dot is balls, 0 to 5).';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await save({ ...record, id: existing?.id ?? newId(), savedAt: Date.now() });
      router.back();
    } catch (err) {
      setFailed((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    const go = async () => {
      try {
        await remove(existing.id);
        router.back();
      } catch (err) {
        setFailed((err as Error).message);
      }
    };
    if (Platform.OS === 'web') void go();
    else Alert.alert('Delete this match?', 'Its runs and wickets are taken out of your figures.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void go() }]);
  };

  if (id && loaded && !existing) {
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title="Match" />
        <Notice>This match could not be found.</Notice>
        <Button title="Back to my matches" onPress={() => router.replace('/matches')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title={existing ? 'Change a match' : 'Add a match'} />

      <Card>
        <H3>The match</H3>
        <Field label="Day of the match (year-month-day)" value={date} onChangeText={setDate} placeholder="2026-10-25" autoCapitalize="none" error={errors.date} />
        <View style={styles.quick}>
          <Button title="Today" kind="ghost" onPress={() => setDate(dateText(midnight()))} style={{ flex: 1 }} />
          <Button title="Yesterday" kind="ghost" onPress={() => setDate(dateText(midnight(1)))} style={{ flex: 1 }} />
        </View>
        <Field label="Against (team name, optional)" value={opponent} onChangeText={setOpponent} placeholder="For example: Royal College U15" maxLength={60} />
        <Choice label="Kind of match" value={format} onChange={setFormat} options={FORMATS} />
        <Choice label="Result for your team (optional)" value={result} onChange={(v) => setResult(v === result ? null : v)} options={RESULTS} />
      </Card>

      <Card>
        <H3>Your batting</H3>
        <Choice label="How did your innings end?" value={howOut} onChange={setHowOut} options={HOW_OUT} />
        {didBat ? (
          <>
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Field label="Runs" value={runs} onChangeText={(t) => setRuns(digits(t))} keyboardType="number-pad" placeholder="0" error={errors.runs} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Balls faced (if you know)" value={balls} onChangeText={(t) => setBalls(digits(t))} keyboardType="number-pad" placeholder="–" error={errors.balls} />
              </View>
            </View>
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Field label="Fours" value={fours} onChangeText={(t) => setFours(digits(t))} keyboardType="number-pad" placeholder="0" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Sixes" value={sixes} onChangeText={(t) => setSixes(digits(t))} keyboardType="number-pad" placeholder="0" />
              </View>
            </View>
            {errors.boundaries ? <Text style={styles.error}>{errors.boundaries}</Text> : null}
          </>
        ) : (
          <Small>A match where you did not bat counts as a match, but not as an innings.</Small>
        )}
      </Card>

      <Card>
        <H3>Your bowling and fielding</H3>
        <Choice
          label="Did you bowl?"
          value={bowled ? 'yes' : 'no'}
          onChange={(v) => setBowled(v === 'yes')}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
        />
        {bowled ? (
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Field label="Overs" value={overs} onChangeText={(t) => setOvers(t.replace(/[^0-9.]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder="4 or 3.2" error={errors.overs} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Runs given" value={runsConceded} onChangeText={(t) => setRunsConceded(digits(t))} keyboardType="number-pad" placeholder="0" error={errors.runsConceded} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Wickets" value={wickets} onChangeText={(t) => setWickets(digits(t))} keyboardType="number-pad" placeholder="0" error={errors.wickets} />
            </View>
          </View>
        ) : null}
        <Field label="Catches" value={catches} onChangeText={(t) => setCatches(digits(t))} keyboardType="number-pad" placeholder="0" error={errors.catches} />
      </Card>

      <Card>
        <Field label="Notes (optional): what went well, what to work on" value={notes} onChangeText={setNotes} multiline maxLength={300} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </Card>

      {Object.keys(errors).length ? <Notice tone="warn">Check the boxes marked in red.</Notice> : null}
      {failed ? <Notice tone="warn">{failed}</Notice> : null}
      <Button title={existing ? 'Save the changes' : 'Save the match'} icon="checkmark-circle" loading={busy} onPress={submit} />
      {existing ? <Button title="Delete this match" icon="trash-outline" kind="ghost" onPress={confirmDelete} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: sp(2) },
  pair: { flexDirection: 'row', gap: sp(2.5) },
  error: { color: C.bad, fontSize: 14 },
});
