import { StyleSheet, Text, View } from 'react-native';

import { bestBowlingText, type Career, highestText, HOW_OUT_LABEL, oneDecimal } from '@/data/matchStats';
import { C, F, R, sp } from '@/theme';

/** One figure: a big number and a small label. */
function Tile({ value, label, wide }: { value: string | number; label: string; wide?: boolean }) {
  return (
    <View style={[styles.tile, wide && { flexBasis: '47%' }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

/** The headline figures: matches, runs, best, average. Used on the profile. */
export function CareerHeadline({ c }: { c: Career }) {
  return (
    <View style={styles.grid}>
      <Tile value={c.matches} label="Matches" />
      <Tile value={c.runs} label="Runs" />
      <Tile value={highestText(c)} label="Best" />
      <Tile value={oneDecimal(c.average)} label="Average" />
    </View>
  );
}

/** Every figure, batting, bowling and fielding. */
export function CareerFull({ c }: { c: Career }) {
  return (
    <View style={{ gap: sp(3) }}>
      <Text style={styles.section}>Batting</Text>
      <View style={styles.grid}>
        <Tile value={c.matches} label="Matches" />
        <Tile value={c.innings} label="Innings" />
        <Tile value={c.notOuts} label="Not outs" />
        <Tile value={c.runs} label="Runs" />
        <Tile value={highestText(c)} label="Highest" />
        <Tile value={oneDecimal(c.average)} label="Average" />
        <Tile value={oneDecimal(c.strikeRate)} label="Strike rate" />
        <Tile value={`${c.fifties} / ${c.hundreds}`} label="50s / 100s" />
        <Tile value={c.ducks} label="Ducks" />
        <Tile value={c.fours} label="Fours" />
        <Tile value={c.sixes} label="Sixes" />
        <Tile value={c.won} label="Matches won" />
      </View>
      {c.form.length ? (
        <View style={{ gap: sp(1.5) }}>
          <Text style={styles.small}>Last {c.form.length} innings, newest first</Text>
          <View style={styles.formRow}>
            {c.form.map((s, i) => (
              <View key={i} style={styles.formChip}>
                <Text style={styles.formText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {c.dismissals.length ? (
        <View style={{ gap: sp(1.5) }}>
          <Text style={styles.small}>How you got out</Text>
          {c.dismissals.map((d) => {
            const outs = c.innings - c.notOuts;
            return (
              <View key={d.howOut} style={styles.barRow}>
                <Text style={styles.barLabel}>{HOW_OUT_LABEL[d.howOut]}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round((d.count / Math.max(1, outs)) * 100)}%` }]} />
                </View>
                <Text style={styles.barCount}>{d.count}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={styles.section}>Bowling and fielding</Text>
      <View style={styles.grid}>
        <Tile value={c.bowling.wickets} label="Wickets" />
        <Tile value={bestBowlingText(c)} label="Best bowling" />
        <Tile value={oneDecimal(c.bowling.average)} label="Bowling average" />
        <Tile value={oneDecimal(c.bowling.economy)} label="Economy" />
        <Tile value={c.catches} label="Catches" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  tile: { flexBasis: '22%', flexGrow: 1, minWidth: 72, backgroundColor: C.outfieldTint, borderRadius: R.md, paddingVertical: sp(2.5), paddingHorizontal: sp(2), alignItems: 'center', gap: 2 },
  value: { fontFamily: F.displayBold, fontSize: 26, color: C.ink },
  label: { fontSize: 12, color: C.inkSoft, textAlign: 'center' },
  section: { fontFamily: F.display, fontSize: 20, color: C.ink, marginTop: sp(1) },
  small: { fontSize: 13, color: C.inkSoft },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  formChip: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: sp(3), paddingVertical: sp(1.5) },
  formText: { fontSize: 16, fontWeight: '700', color: C.ink },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  barLabel: { width: 110, fontSize: 14, color: C.ink },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.line, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.ball, borderRadius: 5 },
  barCount: { width: 24, textAlign: 'right', fontSize: 14, fontWeight: '700', color: C.ink },
});
