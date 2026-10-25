import type { HowOut, MatchFormat, MatchRecord, MatchResult } from '@/services/backend/types';

/**
 * The learner's own match record: what they enter after each real match, and the career
 * figures worked out from it, counted the way cricket statistics are counted:
 *  - an innings is any match in which the learner batted (not "did not bat");
 *  - not out and retired not out are not outs; every other ending is a dismissal;
 *  - batting average = runs / dismissals (no average until the first dismissal);
 *  - strike rate = runs per 100 balls, over the innings where the balls faced were entered;
 *  - a fifty is 50 to 99, a hundred is 100 or more, a duck is 0 and out;
 *  - best bowling is the most wickets in a match, then the fewest runs.
 */

export const HOW_OUT: { value: HowOut; label: string }[] = [
  { value: 'not-out', label: 'Not out' },
  { value: 'bowled', label: 'Bowled' },
  { value: 'caught', label: 'Caught' },
  { value: 'lbw', label: 'LBW' },
  { value: 'run-out', label: 'Run out' },
  { value: 'stumped', label: 'Stumped' },
  { value: 'hit-wicket', label: 'Hit wicket' },
  { value: 'hit-twice', label: 'Hit the ball twice' },
  { value: 'obstructing', label: 'Obstructing the field' },
  { value: 'handled', label: 'Handled the ball' },
  { value: 'timed-out', label: 'Timed out' },
  { value: 'retired-out', label: 'Retired out' },
  { value: 'retired-not-out', label: 'Retired not out' },
  { value: 'did-not-bat', label: 'Did not bat' },
];
export const HOW_OUT_LABEL = Object.fromEntries(HOW_OUT.map((h) => [h.value, h.label])) as Record<HowOut, string>;

export const FORMATS: { value: MatchFormat; label: string }[] = [
  { value: 'short', label: 'T20 / short' },
  { value: 'one-day', label: 'One-day' },
  { value: 'long', label: 'Two-day or longer' },
  { value: 'practice', label: 'Practice match' },
];
export const RESULTS: { value: MatchResult; label: string }[] = [
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'tied', label: 'Tied' },
  { value: 'drawn', label: 'Drawn' },
  { value: 'no-result', label: 'No result' },
];

const NOT_OUT: HowOut[] = ['not-out', 'retired-not-out'];
export const isNotOut = (h: HowOut) => NOT_OUT.includes(h);
export const batted = (m: Pick<MatchRecord, 'howOut'>) => m.howOut !== 'did-not-bat';

/** "140*" for a not-out innings, "37" otherwise, "DNB" when the learner did not bat. */
export function scoreText(m: MatchRecord): string {
  if (!batted(m)) return 'DNB';
  return `${m.runs}${isNotOut(m.howOut) ? '*' : ''}`;
}

/** Overs from legal balls: 27 balls is "4.3". */
export const oversText = (balls: number) => `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ''}`;

/** Legal balls from overs typed as "4" or "4.3". Null if it is not a valid number of overs. */
export function parseOvers(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return null;
  const [whole, part] = t.split('.');
  const extra = part ? Number(part) : 0;
  if (extra > 5) return null;
  return Number(whole) * 6 + extra;
}

export type Career = {
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  highest: { runs: number; notOut: boolean } | null;
  /** Null until the first dismissal. */
  average: number | null;
  /** Null until balls faced have been entered. */
  strikeRate: number | null;
  fifties: number;
  hundreds: number;
  ducks: number;
  fours: number;
  sixes: number;
  /** Ways out, most frequent first. */
  dismissals: { howOut: HowOut; count: number }[];
  bowling: {
    matches: number;
    balls: number;
    runs: number;
    wickets: number;
    best: { wickets: number; runs: number } | null;
    average: number | null;
    economy: number | null;
  };
  catches: number;
  won: number;
  /** The last five innings, newest first, as score text. */
  form: string[];
};

export function career(all: MatchRecord[]): Career {
  const matches = all.slice().sort((a, b) => b.at - a.at);
  const inns = matches.filter(batted);
  const notOuts = inns.filter((m) => isNotOut(m.howOut)).length;
  const runs = inns.reduce((s, m) => s + m.runs, 0);
  const outs = inns.length - notOuts;

  let highest: Career['highest'] = null;
  for (const m of inns) {
    const no = isNotOut(m.howOut);
    if (!highest || m.runs > highest.runs || (m.runs === highest.runs && no && !highest.notOut)) highest = { runs: m.runs, notOut: no };
  }

  const timed = inns.filter((m) => m.balls !== null && m.balls > 0);
  const timedBalls = timed.reduce((s, m) => s + (m.balls ?? 0), 0);
  const timedRuns = timed.reduce((s, m) => s + m.runs, 0);

  const counts = new Map<HowOut, number>();
  for (const m of inns) if (!isNotOut(m.howOut)) counts.set(m.howOut, (counts.get(m.howOut) ?? 0) + 1);

  const bowl = matches.filter((m) => m.bowled);
  const bBalls = bowl.reduce((s, m) => s + m.ballsBowled, 0);
  const bRuns = bowl.reduce((s, m) => s + m.runsConceded, 0);
  const bWkts = bowl.reduce((s, m) => s + m.wickets, 0);
  let best: Career['bowling']['best'] = null;
  for (const m of bowl) {
    if (!best || m.wickets > best.wickets || (m.wickets === best.wickets && m.runsConceded < best.runs)) best = { wickets: m.wickets, runs: m.runsConceded };
  }

  return {
    matches: matches.length,
    innings: inns.length,
    notOuts,
    runs,
    highest,
    average: outs > 0 ? runs / outs : null,
    strikeRate: timedBalls > 0 ? (timedRuns / timedBalls) * 100 : null,
    fifties: inns.filter((m) => m.runs >= 50 && m.runs < 100).length,
    hundreds: inns.filter((m) => m.runs >= 100).length,
    ducks: inns.filter((m) => m.runs === 0 && !isNotOut(m.howOut)).length,
    fours: inns.reduce((s, m) => s + m.fours, 0),
    sixes: inns.reduce((s, m) => s + m.sixes, 0),
    dismissals: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([howOut, count]) => ({ howOut, count })),
    bowling: {
      matches: bowl.length,
      balls: bBalls,
      runs: bRuns,
      wickets: bWkts,
      best,
      average: bWkts > 0 ? bRuns / bWkts : null,
      economy: bBalls > 0 ? (bRuns / bBalls) * 6 : null,
    },
    catches: matches.reduce((s, m) => s + m.catches, 0),
    won: matches.filter((m) => m.result === 'won').length,
    form: inns.slice(0, 5).map(scoreText),
  };
}

export const highestText = (c: Career) => (c.highest ? `${c.highest.runs}${c.highest.notOut ? '*' : ''}` : '–');
export const oneDecimal = (v: number | null) => (v === null ? '–' : v.toFixed(1));
export const bestBowlingText = (c: Career) => (c.bowling.best ? `${c.bowling.best.wickets}/${c.bowling.best.runs}` : '–');

/** Checks a match before it is saved. Returns a message for each field that is wrong. */
export function checkMatch(m: Omit<MatchRecord, 'id' | 'savedAt'>, today = Date.now()): Record<string, string> {
  const e: Record<string, string> = {};
  if (!Number.isFinite(m.at) || m.at > today + 86_400_000) e.date = 'Enter the day of the match, not a day in the future.';
  if (batted(m)) {
    if (m.runs < 0 || m.runs > 500) e.runs = 'Enter your runs, 0 to 500.';
    if (m.fours < 0 || m.sixes < 0) e.boundaries = 'Fours and sixes cannot be below 0.';
    else if (m.fours * 4 + m.sixes * 6 > m.runs) e.boundaries = `${m.fours} fours and ${m.sixes} sixes make ${m.fours * 4 + m.sixes * 6} runs, more than your ${m.runs}.`;
    if (m.balls !== null && (m.balls < 0 || m.balls > 1000)) e.balls = 'Enter the balls you faced, or leave it empty.';
    else if (m.balls !== null && m.balls < m.fours + m.sixes) e.balls = 'You cannot hit more fours and sixes than the balls you faced.';
    else if (m.balls === 0 && m.runs > 0) e.balls = 'You scored runs, so you faced at least one ball.';
  }
  if (m.bowled) {
    if (m.ballsBowled <= 0) e.overs = 'Enter the overs you bowled, like 4 or 3.2.';
    if (m.wickets < 0 || m.wickets > 10) e.wickets = 'Wickets are 0 to 10.';
    if (m.runsConceded < 0 || m.runsConceded > 400) e.runsConceded = 'Enter the runs given, 0 or more.';
  }
  if (m.catches < 0 || m.catches > 10) e.catches = 'Catches are 0 to 10.';
  return e;
}

/** One line about the record for the AI coach, without names. */
export function careerLine(all: MatchRecord[]): string {
  if (!all.length) return 'no matches entered';
  const c = career(all);
  const parts = [
    `${c.matches} matches, ${c.innings} innings, ${c.runs} runs, highest ${highestText(c)}, average ${oneDecimal(c.average)}, strike rate ${oneDecimal(c.strikeRate)}`,
    `last scores (newest first): ${c.form.join(', ') || 'none'}`,
  ];
  if (c.dismissals.length) parts.push(`most often out: ${c.dismissals.slice(0, 3).map((d) => `${HOW_OUT_LABEL[d.howOut].toLowerCase()} ${d.count}`).join(', ')}`);
  if (c.bowling.matches) parts.push(`bowling: ${c.bowling.wickets} wickets, best ${bestBowlingText(c)}`);
  return parts.join('; ');
}
