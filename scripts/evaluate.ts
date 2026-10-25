/**
 * Evaluation: how often does the app's "good / not good" agree with a human coach?
 *
 *   1. python tools/extract_landmarks.py <videos folder>        (pose model -> JSON per video)
 *   2. write <videos folder>/labels.csv                          (see tools/EVALUATION.md)
 *   3. npx tsx scripts/evaluate.ts <videos folder> [labels.csv] [--hold=2500] [--view=side|front]
 *
 * Each video is one clip with one coach label: "good" (a correct stance / shot) or "bad".
 * The app calls a clip good when a good position is held for the hold time (as in the live
 * screen). Prints accuracy, precision, recall, specificity, F1, Cohen's kappa and a confusion
 * matrix, per skill and overall; lists every wrong call with the reasons the app gave; and writes
 * results.csv and summary.md into the folder.
 *
 * Not measured offline: the bat (it is found in the camera picture, not from the landmarks),
 * so bat checks are not judged here. Say so in the paper.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRILL_BY_ID, isDrill, REP_HOLD_MS } from '../src/data/training';
import type { Skill } from '../src/lib/pose/benchmarks';
import type { Hand, PoseFrame } from '../src/lib/pose/landmarks';
import { analyzePose, isGoodPosition, StanceSmoother } from '../src/lib/pose/stanceAnalyzer';

type Label = { file: string; skill: Skill; hand: Hand; view: 'side' | 'front'; drill?: string; truth: boolean; fault: string };
type Result = Label & { predicted: boolean; goodMs: number; frames: number; goodFrames: number; reasons: string };

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const positional = args.filter((a) => !a.startsWith('--'));
const folder = positional[0];
if (!folder) {
  console.error('usage: npx tsx scripts/evaluate.ts <videos folder> [labels.csv] [--hold=2500] [--view=side|front]');
  process.exit(1);
}
const labelsPath = positional[1] ?? join(folder, 'labels.csv');
const holdMs = Number(flag('hold') ?? REP_HOLD_MS);
const viewOverride = flag('view') as 'side' | 'front' | undefined;

/** labels.csv: file,skill,label,hand,view,drill,fault  (only file, skill and label are required). */
function readLabels(path: string): Label[] {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (row: string[], name: string) => (row[head.indexOf(name)] ?? '').trim();
  return lines.slice(1).map((line) => {
    const row = line.split(',');
    const label = col(row, 'label').toLowerCase();
    if (!['good', 'bad'].includes(label)) throw new Error(`label must be good or bad: ${line}`);
    const skill = col(row, 'skill') as Skill;
    if (!['stance', 'defence', 'drive'].includes(skill)) throw new Error(`skill must be stance, defence or drive: ${line}`);
    return {
      file: col(row, 'file').replace(/\.[a-z0-9]+$/i, ''),
      skill,
      hand: (col(row, 'hand') || 'right') as Hand,
      view: (viewOverride ?? (col(row, 'view') || 'side')) as 'side' | 'front',
      drill: col(row, 'drill') || undefined,
      truth: label === 'good',
      fault: col(row, 'fault') || (label === 'good' ? '' : 'unspecified'),
    };
  });
}

function judge(l: Label): Result {
  const path = join(folder, `${l.file}.json`);
  if (!existsSync(path)) throw new Error(`missing ${path}: run tools/extract_landmarks.py first`);
  const data = JSON.parse(readFileSync(path, 'utf8')) as { fps: number; aspect: number; frames: { t: number; lm: number[]; world: number[] }[] };
  const smoother = new StanceSmoother();
  const only = l.drill && isDrill(l.drill) ? DRILL_BY_ID[l.drill].checks : undefined;
  let goodSince = 0;
  let best = 0;
  let goodFrames = 0;
  const reasons = new Map<string, number>();
  for (const f of data.frames) {
    const frame: PoseFrame = { t: f.t, lm: f.lm, world: f.world, aspect: data.aspect, bat: null };
    const a = analyzePose(l.skill, frame, l.hand, smoother, { view: l.view, only });
    if (a.state === 'ok' && isGoodPosition(a)) {
      goodFrames++;
      if (!goodSince) goodSince = f.t;
      best = Math.max(best, f.t - goodSince);
    } else {
      goodSince = 0;
      const why = a.state === 'ok' ? (a.cues[0]?.message ?? 'score too low') : a.state;
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
    }
  }
  const top = [...reasons.entries()].sort((x, y) => y[1] - x[1])[0];
  return { ...l, predicted: best >= holdMs, goodMs: best, frames: data.frames.length, goodFrames, reasons: top ? top[0] : '' };
}

type Counts = { tp: number; fp: number; tn: number; fn: number };
const count = (rs: Result[]): Counts => ({
  tp: rs.filter((r) => r.truth && r.predicted).length,
  fp: rs.filter((r) => !r.truth && r.predicted).length,
  tn: rs.filter((r) => !r.truth && !r.predicted).length,
  fn: rs.filter((r) => r.truth && !r.predicted).length,
});
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);
function metrics(c: Counts) {
  const n = c.tp + c.fp + c.tn + c.fn;
  const accuracy = div(c.tp + c.tn, n);
  const precision = div(c.tp, c.tp + c.fp);
  const recall = div(c.tp, c.tp + c.fn);
  const specificity = div(c.tn, c.tn + c.fp);
  const f1 = div(2 * precision * recall, precision + recall);
  const pe = div((c.tp + c.fp) * (c.tp + c.fn) + (c.fn + c.tn) * (c.fp + c.tn), n * n);
  const kappa = div(accuracy - pe, 1 - pe);
  return { n, accuracy, precision, recall, specificity, f1, kappa };
}
const pct = (x: number) => (Number.isNaN(x) ? '  n/a' : `${(x * 100).toFixed(1)}%`.padStart(6));
const k = (x: number) => (Number.isNaN(x) ? 'n/a' : x.toFixed(2));

function table(name: string, rs: Result[]): string {
  const c = count(rs);
  const m = metrics(c);
  return [
    `### ${name}  (${m.n} clips: ${rs.filter((r) => r.truth).length} good, ${rs.filter((r) => !r.truth).length} bad)`,
    '',
    '|                     | App: good | App: not good |',
    '|---|---|---|',
    `| **Coach: good**     | ${c.tp} (TP) | ${c.fn} (FN) |`,
    `| **Coach: bad**      | ${c.fp} (FP) | ${c.tn} (TN) |`,
    '',
    `Accuracy ${pct(m.accuracy).trim()} · Precision ${pct(m.precision).trim()} · Recall ${pct(m.recall).trim()} · Specificity ${pct(m.specificity).trim()} · F1 ${k(m.f1)} · Cohen's kappa ${k(m.kappa)}`,
    '',
  ].join('\n');
}

const labels = readLabels(labelsPath);
const results = labels.map(judge);
let out = `# Evaluation: the app against a coach\n\nHold time for a good clip: ${holdMs} ms. Bat not judged (offline landmarks only).\n\n`;
out += table('All clips', results) + '\n';
for (const skill of ['stance', 'defence', 'drive'] as Skill[]) {
  const rs = results.filter((r) => r.skill === skill);
  if (rs.length) out += table(`Skill: ${skill}`, rs) + '\n';
}
// Which kinds of fault does the app catch? (recall on the bad clips, by coach-labelled fault)
const faults = [...new Set(results.filter((r) => !r.truth).map((r) => r.fault))];
if (faults.length) {
  out += '### Faults the app catches\n\n| Coach-labelled fault | Clips | App said "not good" |\n|---|---|---|\n';
  for (const f of faults) {
    const rs = results.filter((r) => !r.truth && r.fault === f);
    out += `| ${f} | ${rs.length} | ${rs.filter((r) => !r.predicted).length} (${pct(rs.filter((r) => !r.predicted).length / rs.length).trim()}) |\n`;
  }
  out += '\n';
}
const wrong = results.filter((r) => r.truth !== r.predicted);
out += `### Disagreements (${wrong.length})\n\n`;
for (const r of wrong) {
  out += `- **${r.file}** (${r.skill}, ${r.view}): coach ${r.truth ? 'good' : `bad (${r.fault})`}, app ${r.predicted ? 'good' : 'not good'}. Longest good run ${r.goodMs} ms, ${r.goodFrames}/${r.frames} good frames. Main reason the app gave: ${r.reasons || '-'}\n`;
}
console.log(out);
writeFileSync(join(folder, 'summary.md'), out);
writeFileSync(
  join(folder, 'results.csv'),
  ['file,skill,view,coach,app,good_ms,good_frames,frames,fault,main_reason', ...results.map((r) => [r.file, r.skill, r.view, r.truth ? 'good' : 'bad', r.predicted ? 'good' : 'bad', r.goodMs, r.goodFrames, r.frames, r.fault, JSON.stringify(r.reasons)].join(','))].join('\n'),
);
console.log(`Saved ${join(folder, 'summary.md')} and ${join(folder, 'results.csv')}`);
