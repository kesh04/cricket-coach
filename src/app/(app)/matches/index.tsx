import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { CareerFull } from '@/components/MatchStats';
import { Button, Card, H3, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { career, FORMATS, HOW_OUT_LABEL, oversText, RESULTS, scoreText } from '@/data/matchStats';
import { useMatches } from '@/state/useMatches';
import { C, F, R, sp } from '@/theme';

const FORMAT_LABEL = Object.fromEntries(FORMATS.map((f) => [f.value, f.label]));
const RESULT_LABEL = Object.fromEntries(RESULTS.map((r) => [r.value, r.label]));
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** My matches: the career figures and every match, like a player's own score book. */
export default function Matches() {
  const { matches, loaded, error } = useMatches();
  const c = useMemo(() => career(matches), [matches]);

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="My matches" />
      <Button title="Add a match" icon="add-circle" onPress={() => router.push('/matches/edit')} />
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {!loaded ? (
        <ActivityIndicator color={C.outfield} />
      ) : matches.length === 0 ? (
        <Card>
          <H3>Your own score book</H3>
          <P soft>After each match you play, add your runs, the balls you faced, how you got out, and your bowling. The app adds them up: matches, runs, your best score, your average and more.</P>
        </Card>
      ) : (
        <>
          <Card>
            <CareerFull c={c} />
          </Card>
          <View style={{ gap: sp(1) }}>
            <H3>Every match</H3>
            <Small>Tap a match to change or delete it.</Small>
          </View>
          {matches.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/matches/edit', params: { id: m.id } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
              <View style={styles.score}>
                <Text style={styles.scoreText}>{scoreText(m)}</Text>
                {m.howOut !== 'did-not-bat' && m.balls !== null ? <Text style={styles.balls}>{m.balls} balls</Text> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {m.opponent ? `v ${m.opponent}` : 'Match'}
                </Text>
                <Text style={styles.meta}>
                  {day(m.at)} · {FORMAT_LABEL[m.format]}
                  {m.result ? ` · ${RESULT_LABEL[m.result]}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {m.howOut === 'did-not-bat' ? 'Did not bat' : HOW_OUT_LABEL[m.howOut]}
                  {m.fours || m.sixes ? ` · ${m.fours}×4, ${m.sixes}×6` : ''}
                  {m.bowled ? ` · bowling ${m.wickets}/${m.runsConceded} (${oversText(m.ballsBowled)} ov)` : ''}
                  {m.catches ? ` · ${m.catches} catch${m.catches === 1 ? '' : 'es'}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.inkMute} />
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(3), backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: sp(3.5) },
  score: { width: 66, alignItems: 'center' },
  scoreText: { fontFamily: F.displayBold, fontSize: 30, color: C.ink },
  balls: { fontSize: 12, color: C.inkSoft },
  title: { fontSize: 16, fontWeight: '700', color: C.ink },
  meta: { fontSize: 13, color: C.inkSoft },
});
