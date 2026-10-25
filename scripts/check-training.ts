/**
 * Checks the forward defence analyser, the training programme rules and the coach-test statistics.
 * Run with: npm run test:pose
 */
import { DEMO_STEPS, stepForCheck } from '../src/data/skills';
import { DAYS_PER_STAGE, dayKey, dayPlan, DRILLS, introducedIn, KEEP_SHARP_REPS, programme, repsByDay, taskKey, type DrillId } from '../src/data/training';
import { agreement, trialsCsv } from '../src/lib/agreement';
import { BENCHMARKS, CAMERA_SKILLS, DEFENCE_BENCHMARKS, DRIVE_BENCHMARKS, GOOD_SCORE } from '../src/lib/pose/benchmarks';
import { buildDefence, buildDrive, figureToWorld, idealDefence, idealDrive, idealStance, IN_DEFENCE, IN_DRIVE, mirrorPose } from '../src/lib/pose/idealStance';
import { LM, type Hand, type PoseFrame, type Vec3 } from '../src/lib/pose/landmarks';
import { analyzePose as analyzePoseRaw, averageChecks, isGoodPosition, measureStance, scoreChecks, standingSide } from '../src/lib/pose/stanceAnalyzer';

// The shots are tested here without the bat (the bat checks are tested in check-analyzer.ts);
// the stance cannot count without it, so stance frames keep their resting bat.
const analyzePose: typeof analyzePoseRaw = (skill, frame, ...rest) => analyzePoseRaw(skill, skill === 'stance' ? frame : { ...frame, bat: null }, ...rest);
import { BENCHMARK_BY_ID } from '../src/lib/pose/benchmarks';
import type { CoachTrial, PracticeSession } from '../src/services/backend/types';
import { MODELS } from '../src/lib/pose/models';

// These checks test the coaching-range rules on drawn figures, so the trained models are switched
// off here. scripts/check-model.ts tests the trained models.
for (const k of Object.keys(MODELS)) delete (MODELS as Record<string, unknown>)[k];

let failed = 0;
function expect(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}
/** A bat resting down; the stance cannot count without the bat. */
const RESTING_BAT = { dx: 0.17, dy: 0.98, hx: 0.5, hy: 0.55, tx: 0.55, ty: 0.85, conf: 0.9, onBody: false };
function frameOf(pose: Vec3[], hand: Hand): PoseFrame {
  const lm: number[] = [];
  for (let i = 0; i < 33; i++) lm.push(0.5, 0.5, 0, 0.99);
  return { t: 0, lm, world: figureToWorld(pose, hand), bat: RESTING_BAT };
}
const copy = (pose: Vec3[]) => pose.map((p) => [...p] as Vec3);

// ---------------------------------------------------------------- forward defence
console.log('\nForward defence:');
for (const hand of ['right', 'left'] as Hand[]) {
  let r = analyzePose('defence', frameOf(idealDefence(hand), hand), hand);
  expect(`${hand}: model defence scores 100 and counts as good`, r.state === 'ok' && r.score === 100 && isGoodPosition(r), r.state === 'ok' ? `score ${r.score}` : r.state);

  r = analyzePose('defence', frameOf(idealStance(hand), hand), hand);
  expect(`${hand}: standing in the stance is not a defence`, r.state === 'ok' && !isGoodPosition(r) && r.cues[0]?.id === 'stride', r.state === 'ok' ? `score ${r.score}, first cue ${r.cues[0]?.id}` : r.state);

  // Head left back over the back foot.
  const headBack = copy(idealDefence(hand));
  headBack[LM.NOSE][0] = 0.1;
  r = analyzePose('defence', frameOf(headBack, hand), hand);
  expect(`${hand}: head back gives a head cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'headOver' && c.message!.includes('head forward')));

  // Bat held away from the pad.
  const gap = copy(idealDefence(hand));
  const z = hand === 'right' ? 1 : -1;
  for (const k of [LM.L_WRIST, LM.R_WRIST]) gap[k][2] = 0.75 * z;
  r = analyzePose('defence', frameOf(gap, hand), hand);
  expect(`${hand}: bat away from the pad gives a bat cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'batPad'));

  // Front elbow dropped below the hands.
  const elbowDown = copy(idealDefence(hand));
  const frontElbow = hand === 'right' ? LM.L_ELBOW : LM.R_ELBOW;
  elbowDown[frontElbow][1] = 0.7;
  r = analyzePose('defence', frameOf(elbowDown, hand), hand);
  expect(`${hand}: a low front elbow gives an elbow cue naming the ${hand === 'right' ? 'left' : 'right'} elbow`, r.state === 'ok' && r.cues.some((c) => c.id === 'elbow' && c.message!.includes(hand === 'right' ? 'left' : 'right')));

  // The defence is not judged from the bowler's end.
  const w = figureToWorld(idealDefence(hand), hand);
  const side: number[] = [];
  for (let i = 0; i < w.length; i += 3) side.push(w[i + 2], w[i + 1], -w[i]);
  r = analyzePose('defence', { t: 0, lm: frameOf(idealDefence(hand), hand).lm, world: side }, hand);
  expect(`${hand}: defence with the phone in front (side-on to it) is judged`, r.state === 'ok', r.state);

  // The demonstration ends in the model defence.
  const built = buildDefence(hand, IN_DEFENCE);
  const model = idealDefence(hand);
  let worst = 0;
  for (const j of [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_WRIST, LM.R_WRIST, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]) for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(built[j][i] - model[j][i]));
  expect(`${hand}: the defence demonstration ends in the model defence`, worst < 1e-9);
}
for (const b of DEFENCE_BENCHMARKS) expect(`defence check "${b.id}" has a step that teaches it`, DEMO_STEPS.defence[stepForCheck('defence', b.id)].teaches?.includes(b.id) === true);
for (const k of ['grip', 'stance', 'defence', 'drive'] as const) expect(`every ${k} step after the first explains why or is the last`, DEMO_STEPS[k].slice(0, -1).every((s) => !!s.why || s.id === 'bat'));

// Averaging the checks of several repetitions.
{
  const a = scoreChecks(BENCHMARKS, measureStance(figureToWorld(idealStance('right'), 'right'), 'right'), 'right');
  const narrow = copy(idealStance('right'));
  for (const k of [LM.L_ANKLE, LM.R_ANKLE]) narrow[k][0] *= 0.5;
  const b = scoreChecks(BENCHMARKS, measureStance(figureToWorld(narrow, 'right'), 'right'), 'right');
  const avg = averageChecks('stance', [a.checks, b.checks], 'right');
  const feet = (cs: typeof avg) => cs.find((c) => c.id === 'feet')!.value!;
  expect('averaged feet value sits between the two repetitions', feet(avg) < feet(a.checks) && feet(avg) > feet(b.checks), `${feet(b.checks).toFixed(2)} < ${feet(avg).toFixed(2)} < ${feet(a.checks).toFixed(2)}`);
}

// ---------------------------------------------------------------- eyes on the bowler
console.log('\nEyes on the bowler:');
for (const hand of ['right', 'left'] as Hand[]) {
  // Head turned to look at the phone (the way the chest faces) instead of at the bowler.
  const right = copy(idealStance('right'));
  right[LM.NOSE] = [0, 1.563, 0.29];
  right[LM.L_EAR] = [0.075, 1.583, 0.19];
  right[LM.R_EAR] = [-0.075, 1.583, 0.19];
  const atPhone = hand === 'right' ? right : mirrorPose(right);
  // The picture shows the face from the front: both ears, one each side of the nose.
  const atPhoneFrame = frameOf(atPhone, hand);
  atPhoneFrame.lm[LM.L_EAR * 4] = 0.53;
  atPhoneFrame.lm[LM.R_EAR * 4] = 0.47;
  const r = analyzePose('stance', atPhoneFrame, hand);
  expect(`${hand}: looking at the phone gives "look at the bowler"`, r.state === 'ok' && r.cues.some((c) => c.id === 'look' && c.message!.includes('Look at the bowler')), r.state === 'ok' ? r.cues.map((c) => `${c.id}:${c.score}`).join(',') : r.state);
  const ok = analyzePose('stance', frameOf(idealStance(hand), hand), hand);
  expect(`${hand}: looking at the bowler is good`, ok.state === 'ok' && ok.checks.find((c) => c.id === 'look')!.status === 'good', ok.state === 'ok' ? `${Math.round(ok.checks.find((c) => c.id === 'look')!.value!)}°` : ok.state);
}

// ---------------------------------------------------------------- front-foot drive
console.log('\nFront-foot drive:');
for (const hand of ['right', 'left'] as Hand[]) {
  let r = analyzePose('drive', frameOf(idealDrive(hand), hand), hand);
  expect(`${hand}: model drive finish scores 100 and counts as good`, r.state === 'ok' && r.score === 100 && isGoodPosition(r), r.state === 'ok' ? `score ${r.score}` : r.state);
  r = analyzePose('drive', frameOf(idealDefence(hand), hand), hand);
  expect(`${hand}: a forward defence is not a drive (no high finish)`, r.state === 'ok' && !isGoodPosition(r) && r.cues.some((c) => c.id === 'finish'), r.state === 'ok' ? `score ${r.score}` : r.state);
  r = analyzePose('defence', frameOf(idealDrive(hand), hand), hand);
  expect(`${hand}: a drive finish is not a forward defence`, r.state === 'ok' && !isGoodPosition(r));
  r = analyzePose('drive', frameOf(idealStance(hand), hand), hand);
  expect(`${hand}: standing in the stance is not a drive`, r.state === 'ok' && !isGoodPosition(r) && r.cues.some((c) => c.id === 'stride'));
  const lowElbow = copy(idealDrive(hand));
  lowElbow[hand === 'right' ? LM.L_ELBOW : LM.R_ELBOW][1] = 0.95;
  r = analyzePose('drive', frameOf(lowElbow, hand), hand);
  expect(`${hand}: a dropped front elbow gives an elbow cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'elbowUp'));
  const built = buildDrive(hand, IN_DRIVE);
  const model = idealDrive(hand);
  let worst = 0;
  for (const j of [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_WRIST, LM.R_WRIST, LM.L_ELBOW, LM.R_ELBOW, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]) for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(built[j][i] - model[j][i]));
  expect(`${hand}: the drive demonstration ends in the model finish`, worst < 1e-9, `${worst}`);
}
for (const b of DRIVE_BENCHMARKS) expect(`drive check "${b.id}" has a step that teaches it`, DEMO_STEPS.drive[stepForCheck('drive', b.id)].teaches?.includes(b.id) === true);
expect('the grip is not a camera skill', !CAMERA_SKILLS.includes('grip'));

// ---------------------------------------------------------------- the training plan
console.log('\nTraining plan:');
const DAY = 24 * 3600 * 1000;
const start = new Date(2026, 9, 1, 12).getTime();
const set = (kind: PracticeSession['kind'], at: number, n: number, drill?: DrillId): PracticeSession => ({
  id: `${kind}${at}${n}${Math.random()}`,
  kind,
  ...(drill ? { drill } : {}),
  hand: 'right',
  score: 90,
  checks: [],
  reps: Array.from({ length: n }, (_, i) => ({ score: 90, at: at + i * 1000 })),
  at,
});
expect('a day key is the local date', dayKey(start) === '2026-10-01');
expect('stage 1 is the stance: 10, 20, 30, 40, 50', [1, 2, 3, 4, 5].map((d) => dayPlan(0, d).tasks.map((t) => `${t.skill}${t.reps}`).join()).join() === 'stance10,stance20,stance30,stance40,stance50');
expect('stage 2 is the defence in 2 parts', dayPlan(1, 1).tasks.map((t) => t.drill).join() === DRILLS.map((d) => d.id).join() && dayPlan(1, 1).tasks.every((t) => t.skill === 'defence' && t.reps === 10));
expect('stage 2, day 5 is 50 of each step', dayPlan(1, 5).tasks.every((t) => t.reps === 50));
expect('stage 3 is the drive', dayPlan(2, 3).tasks.map((t) => `${t.skill}${t.reps}`).join() === 'drive30');
expect('after the 7 stages: keep sharp', dayPlan(7, 1).tasks.map((t) => `${taskKey(t)}${t.reps}`).join() === `def-full${KEEP_SHARP_REPS},drive${KEEP_SHARP_REPS}`);
expect('the defence comes in at stage 2 and the drive at stage 3', introducedIn('defence') === 1 && introducedIn('drive') === 2 && introducedIn('stance') === 0);

// Stance days 1 to 4 done (10, 20, 30, 40), a short day, then day 5 done with two sets.
const days: PracticeSession[] = [];
for (let d = 0; d < 4; d++) days.push(set('stance', start + d * DAY, 10 * (d + 1)));
days.push(set('stance', start + 4 * DAY, 30));
let p = programme(days, start + 4 * DAY + 3600e3);
expect('a short day does not count towards the stage', p.days.get('2026-10-05')?.status === 'some' && p.today.day === 5 && p.today.tasks[0].reps === 50, `day ${p.today.day}`);
days.push(set('stance', start + 5 * DAY, 30), set('stance', start + 5 * DAY + 3600e3, 20));
p = programme(days, start + 5 * DAY + 7200e3);
expect('two sets on one day add up', repsByDay(days).get('2026-10-06') === 50);
expect('the 5th full day finishes stage 1', p.todayDone && p.daysDone === DAYS_PER_STAGE && p.nextStageTomorrow && p.today.stage === 1, `stage ${p.today.stage}, days ${p.daysDone}`);
expect('the streak stops at the short day', p.streak === 1, `streak ${p.streak}`);
p = programme(days, start + 6 * DAY);
expect('the next day is stage 2, day 1', p.today.stage === 2 && p.today.day === 1 && p.daysDone === 0 && !p.todayDone);
// One part of the defence done, the second not yet.
for (const d of DRILLS.slice(0, 1)) days.push(set('defence', start + 6 * DAY, 10, d.id));
p = programme(days, start + 6 * DAY + 3600e3);
expect('every step of the defence is needed', !p.todayDone && p.days.get('2026-10-07')?.status === 'some');
days.push(set('defence', start + 6 * DAY + 7200e3, 10, 'def-full'));
p = programme(days, start + 6 * DAY + 9000e3);
expect('both parts finish a stage 2 day', p.todayDone && p.daysDone === 1 && p.streak === 2, `days ${p.daysDone}, streak ${p.streak}`);
p = programme(days, start + 7 * DAY);
expect('the next day each step is 20', p.today.day === 2 && p.today.tasks.every((t) => t.reps === 20));
expect('an untouched day is not in the history', !p.days.has('2026-09-30'));

// ---------------------------------------------------------------- defence steps, phone in front, bat the wrong way round
console.log('\nDefence steps and the phone in front:');
for (const d of DRILLS) expect(`step "${d.id}" judges known checks`, d.checks.every((c) => !!BENCHMARK_BY_ID[c]));
for (const hand of ['right', 'left'] as Hand[]) {
  const other: Hand = hand === 'right' ? 'left' : 'right';
  for (const d of DRILLS) {
    const pose = d.judge === 'stance' ? idealStance(hand) : idealDefence(hand);
    const r = analyzePose(d.judge, frameOf(pose, hand), hand, undefined, { only: d.checks });
    expect(`${hand}: the model scores 100 on "${d.id}"`, r.state === 'ok' && r.score === 100 && r.checks.length === d.checks.length, r.state === 'ok' ? `score ${r.score}` : r.state);
  }
  const footwork = analyzePose('defence', frameOf(idealStance(hand), hand), hand, undefined, { only: DRILLS[1].checks });
  expect(`${hand}: standing still is not footwork`, footwork.state === 'ok' && !isGoodPosition(footwork) && footwork.cues[0]?.id === 'stride');
  // Phone in front, at the bowler's end: the body is turned a quarter round.
  const w = figureToWorld(idealStance(hand), hand);
  const turned: number[] = [];
  const sg = hand === 'right' ? 1 : -1; // the bowler, and so the phone, is where the front shoulder points
  for (let i = 0; i < w.length; i += 3) turned.push(sg * w[i + 2], w[i + 1], -sg * w[i]);
  const front = analyzePose('stance', { t: 0, lm: frameOf(idealStance(hand), hand).lm, world: turned, bat: RESTING_BAT }, hand, undefined, { view: 'front' });
  expect(`${hand}: from the front a side-on stance is judged`, front.state === 'ok' && front.score === 100, front.state);
  const facing = analyzePose('stance', frameOf(idealStance(hand), hand), hand, undefined, { view: 'front' });
  expect(`${hand}: a wrong view setting does not matter (the view is found from the body)`, facing.state === 'ok' && facing.score === 100);
  // Which way round the bat is held.
  expect(`${hand}: a ${hand}-handed stance reads as ${hand}-handed`, standingSide(w) * (hand === 'right' ? 1 : -1) > 0.5);
  const mirrored = figureToWorld(idealStance(other), other);
  expect(`${hand}: a ${other}-handed stance reads as the other way round`, standingSide(mirrored) * (hand === 'right' ? 1 : -1) < -0.5);
}

// ---------------------------------------------------------------- coach test
console.log('\nCoach test statistics:');
const trial = (coach: CoachTrial['coach'], app: CoachTrial['app']): CoachTrial => ({ id: Math.random().toString(36), skill: 'stance', hand: 'right', coach, app, score: 80, appFault: null, blind: true, rater: 'A', at: start });
// A worked example: 20 both good, 5 coach only, 10 app only, 15 neither (n = 50).
const trials = [
  ...Array.from({ length: 20 }, () => trial('good', 'good')),
  ...Array.from({ length: 5 }, () => trial('good', 'not')),
  ...Array.from({ length: 10 }, () => trial('not', 'good')),
  ...Array.from({ length: 15 }, () => trial('not', 'not')),
  trial('good', 'unseen'),
];
const a = agreement(trials);
// po = 35/50 = 0.7; coach good 0.5, app good 0.6; pe = 0.5*0.6 + 0.5*0.4 = 0.5; kappa = 0.4
expect('agreement leaves out unseen trials', a.n === 50 && a.unseen === 1);
expect('agreement is 70%', Math.abs(a.accuracy! - 0.7) < 1e-9);
expect("Cohen's kappa is 0.40", Math.abs(a.kappa! - 0.4) < 1e-9, a.kappa!.toFixed(3));
expect('faults caught is 60%', Math.abs(a.catchesFaults! - 0.6) < 1e-9);
expect('CSV has a header and one row per trial', trialsCsv(trials).split('\n').length === trials.length + 1);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
