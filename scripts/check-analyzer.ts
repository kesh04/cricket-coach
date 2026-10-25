/**
 * Checks the pose analyser against the model stance, a model grip, wrong camera positions
 * and partly hidden bodies.
 * Run with: npm run test:pose
 */
import { DEMO_STEPS, stepForCheck } from '../src/data/skills';
import { BAT_CHECKS, BENCHMARKS, GRIP_BENCHMARKS, PASS_SCORE } from '../src/lib/pose/benchmarks';
import { buildStance, figureToWorld, idealDefence, idealDrive, idealStance, IN_STANCE, STANDING, worldToFigure } from '../src/lib/pose/idealStance';
import { LM, sides, type Hand, type PoseFrame, type Vec3 } from '../src/lib/pose/landmarks';
import { analyzePose, analyzeStance, cameraProblem, chestOnInPicture, toesInPicture, facingPhone, handsFromBody, isGoodPosition, measureStance, scoreStance, StanceSmoother, strideLength } from '../src/lib/pose/stanceAnalyzer';
import type { BatSeen } from '../src/lib/pose/batDetect';
import { MODELS } from '../src/lib/pose/models';

// These checks test the coaching-range rules on drawn figures, so the trained models are switched
// off here. scripts/check-model.ts tests the trained models.
for (const k of Object.keys(MODELS)) delete (MODELS as Record<string, unknown>)[k];

let failed = 0;
function expect(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

/** A bat resting down, as the camera page reports it (hands to toe, nearly straight down). */
const RESTING_BAT: BatSeen = { dx: 0.17, dy: 0.98, hx: 0.5, hy: 0.55, tx: 0.55, ty: 0.85, conf: 0.9, onBody: false };

/** A frame of a pose; in the stance the bat must be seen, so a resting bat is included. */
function frameOf(pose: Vec3[], hand: Hand, bat: BatSeen | null = RESTING_BAT): PoseFrame {
  const lm: number[] = [];
  for (let i = 0; i < 33; i++) lm.push(0.5, 0.5, 0, 0.99);
  return { t: 0, lm, world: figureToWorld(pose, hand), bat };
}

for (const hand of ['right', 'left'] as Hand[]) {
  const pose = idealStance(hand);
  const world = figureToWorld(pose, hand);
  const m = measureStance(world, hand);
  console.log(`\nModel stance, ${hand}-handed:`, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v!.toFixed(2)])));
  const a = scoreStance(m);
  expect(`${hand}: model stance scores 100`, a.score === 100, `score ${a.score}`);
  expect(`${hand}: model stance has no cues`, a.cues.length === 0);
  for (const b of BENCHMARKS) {
    if (BAT_CHECKS.includes(b.id) || b.id === 'handsIn' || b.id === 'toesSide') continue; // measured from the picture, not the body (handsIn is tested below)
    const v = m[b.id]!;
    const margin = Math.min(v - b.min, b.max - v);
    expect(`${hand}: ${b.id} sits inside its range`, margin >= 0, `value ${v.toFixed(2)} in ${b.min}..${b.max}`);
  }

  // Round trip: world landmarks back to figure space should give the same shape.
  const back = worldToFigure(world, hand);
  const dx = back[LM.L_SHOULDER][0] - back[LM.R_SHOULDER][0];
  const want = pose[LM.L_SHOULDER][0] - pose[LM.R_SHOULDER][0];
  expect(`${hand}: figure round trip keeps the shoulders the right way round`, Math.abs(dx - want) < 1e-6);

  // Faults: each one should produce the matching cue first.
  const straightLegs = idealStance(hand).map((p) => [...p] as Vec3);
  for (const [hip, knee, ankle] of [[LM.L_HIP, LM.L_KNEE, LM.L_ANKLE], [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE]]) {
    straightLegs[knee] = [0, 1, 2].map((i) => (straightLegs[hip][i] + straightLegs[ankle][i]) / 2) as Vec3;
  }
  let r = analyzeStance(frameOf(straightLegs, hand), hand);
  expect(`${hand}: straight legs gives a knees cue`, r.state === 'ok' && r.cues[0]?.id === 'knees', r.state === 'ok' ? r.cues.map((c) => c.id + ':' + c.score).join(',') : '');

  const narrow = idealStance(hand).map((p) => [...p] as Vec3);
  for (const k of [LM.L_ANKLE, LM.L_KNEE, LM.L_HEEL, LM.L_TOE, LM.R_ANKLE, LM.R_KNEE, LM.R_HEEL, LM.R_TOE]) narrow[k][0] *= 0.3;
  r = analyzeStance(frameOf(narrow, hand), hand);
  expect(`${hand}: narrow feet gives a feet cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'feet' && c.message!.includes('wider')));

  const upright = idealStance(hand).map((p) => [...p] as Vec3);
  for (const k of [LM.L_SHOULDER, LM.R_SHOULDER]) upright[k][2] = hand === 'right' ? -0.02 : 0.02;
  r = analyzeStance(frameOf(upright, hand), hand);
  expect(`${hand}: upright trunk gives a lean cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'lean'));

  const leaningBack = idealStance(hand).map((p) => [...p] as Vec3);
  leaningBack[LM.NOSE][0] = -0.3;
  r = analyzeStance(frameOf(leaningBack, hand), hand);
  expect(`${hand}: head behind the feet gives a head cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'head' && c.message!.includes('leaning back')));

  const handsHigh = idealStance(hand).map((p) => [...p] as Vec3);
  for (const k of [LM.L_WRIST, LM.R_WRIST]) handsHigh[k][1] = 1.25;
  r = analyzeStance(frameOf(handsHigh, hand), hand);
  expect(`${hand}: hands held high gives a hands cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'hands' && /Lower|too high/.test(c.message!)));
}

// ---------------------------------------------------------------- what the camera can see

/** Turns world landmarks about the vertical axis, as if the phone had been moved round the batter. */
function turned(world: number[], degrees: number): number[] {
  const a = (degrees * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 0; i < world.length; i += 3) {
    out.push(world[i] * Math.cos(a) + world[i + 2] * Math.sin(a), world[i + 1], -world[i] * Math.sin(a) + world[i + 2] * Math.cos(a));
  }
  return out;
}

console.log('\nWhat the camera can see:');
for (const hand of ['right', 'left'] as Hand[]) {
  const frame = frameOf(idealStance(hand), hand);

  // A joint that cannot be seen at all.
  const hidden = { ...frame, lm: [...frame.lm] };
  hidden.lm[LM.L_ANKLE * 4 + 3] = 0.1;
  let r = analyzeStance(hidden, hand);
  expect(`${hand}: a hidden ankle is reported as feet out of view`, r.state === 'no-body' && r.missing === 'feet');
  // A shot that runs into the side edge of the picture (phone at the side).
  const wide = { ...frame, lm: [...frame.lm] };
  wide.lm[LM.L_ANKLE * 4] = 0.02;
  expect(`${hand}: a step cut off at the side edge asks for room`, (() => { const q = analyzePose('defence', wide, hand); return q.state === 'no-body' && q.missing === 'room'; })());
  // Feet below the bottom edge: the model still guesses them with high visibility (field test, 12 Oct).
  const cut = { ...frame, lm: [...frame.lm] };
  cut.lm[LM.L_ANKLE * 4 + 1] = 1.02;
  cut.lm[LM.R_ANKLE * 4 + 1] = 1.0;
  r = analyzeStance(cut, hand);
  expect(`${hand}: feet below the picture edge are reported, not judged`, r.state === 'no-body' && r.missing === 'feet');

  // In a real stance the far side of the body is partly hidden behind the near side.
  const farSide = { ...frame, lm: [...frame.lm] };
  for (const j of [LM.R_SHOULDER, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE, LM.R_WRIST]) farSide.lm[j * 4 + 3] = 0.3;
  r = analyzeStance(farSide, hand);
  expect(`${hand}: a partly hidden far side is still judged`, r.state === 'ok' && r.score === 100, r.state);

  // The phone in the wrong place.
  for (const angle of [90, -90, 75, -75]) {
    r = analyzeStance({ ...frame, world: turned(frame.world, angle) }, hand);
    expect(`${hand}: phone in front, side-on (${angle} degrees) is judged`, r.state === 'ok', r.state === 'ok' ? `score ${r.score}` : r.state);
  }
  r = analyzeStance({ ...frame, world: turned(frame.world, 180) }, hand);
  expect(`${hand}: phone behind the batter is reported as back`, r.state === 'wrong-angle' && r.problem === 'back', r.state);
  for (const angle of [30, -30, 55, -55]) {
    r = analyzeStance({ ...frame, world: turned(frame.world, angle) }, hand);
    expect(`${hand}: a slightly open or closed stance (${angle} degrees) is still judged`, r.state === 'ok' && r.score >= PASS_SCORE, r.state === 'ok' ? `score ${r.score}` : r.state);
  }
  expect(`${hand}: phone on the off side has no camera problem`, cameraProblem(frame.world) === null);
}

// ---------------------------------------------------------------- the grip

/** A batter standing up, facing the phone, holding the bat upright in front with the toe on the ground. */
function gripPose(hand: Hand, change?: (top: Vec3, bottom: Vec3) => void): Vec3[] {
  const pose = buildStance(hand, STANDING);
  const z = hand === 'right' ? 1 : -1;
  const top = pose[hand === 'right' ? LM.L_WRIST : LM.R_WRIST];
  const bottom = pose[hand === 'right' ? LM.R_WRIST : LM.L_WRIST];
  top.splice(0, 3, 0.02, 0.97, 0.26 * z);
  bottom.splice(0, 3, -0.02, 0.89, 0.27 * z);
  change?.(top, bottom);
  return pose;
}

console.log('\nThe grip:');
for (const hand of ['right', 'left'] as Hand[]) {
  let r = analyzePose('grip', frameOf(gripPose(hand), hand), hand);
  expect(`${hand}: model grip scores 100`, r.state === 'ok' && r.score === 100, r.state === 'ok' ? `score ${r.score} ${r.cues.map((c) => c.id + ':' + c.score).join(',')}` : r.state);

  r = analyzePose('grip', frameOf(gripPose(hand, (top, bottom) => { const y = top[1]; top[1] = bottom[1]; bottom[1] = y; }), hand), hand);
  const wantTop = hand === 'right' ? 'left' : 'right';
  expect(
    `${hand}: hands the wrong way up gives a swap cue naming the ${wantTop} hand`,
    r.state === 'ok' && r.cues[0]?.id === 'order' && r.cues[0].message!.includes('Swap') && r.cues[0].message!.includes(`${wantTop} hand`) && r.score < PASS_SCORE,
    r.state === 'ok' ? `score ${r.score}: ${r.cues[0]?.message}` : r.state,
  );

  r = analyzePose('grip', frameOf(gripPose(hand, (top, bottom) => { top[0] = 0.25; bottom[0] = -0.25; }), hand), hand);
  expect(`${hand}: hands apart gives a hands-together cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'together' && c.message!.includes('together')) && r.score < PASS_SCORE);

  r = analyzePose('grip', frameOf(gripPose(hand, (top, bottom) => { top[1] = 1.45; bottom[1] = 1.37; }), hand), hand);
  expect(`${hand}: bat held up at the shoulders gives a lower-the-bat cue`, r.state === 'ok' && r.cues.some((c) => c.id === 'low' && c.message!.includes('Lower')));

  // The grip is checked with the learner facing the phone, and only the upper body is needed.
  const noFeet = frameOf(gripPose(hand), hand);
  for (const j of [LM.L_ANKLE, LM.R_ANKLE, LM.L_KNEE, LM.R_KNEE]) noFeet.lm[j * 4 + 3] = 0.05;
  r = analyzePose('grip', noFeet, hand);
  expect(`${hand}: the grip is judged without the feet in view`, r.state === 'ok');
  const noHands = frameOf(gripPose(hand), hand);
  for (const j of [LM.L_WRIST, LM.R_WRIST]) noHands.lm[j * 4 + 3] = 0.05;
  r = analyzePose('grip', noHands, hand);
  expect(`${hand}: hidden hands are reported`, r.state === 'no-body' && r.missing === 'hands');
}

// ---------------------------------------------------------------- the demonstration

console.log('\nThe demonstration:');
for (const hand of ['right', 'left'] as Hand[]) {
  const built = buildStance(hand, IN_STANCE);
  const model = idealStance(hand);
  let worst = 0;
  for (const j of [LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]) {
    for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(built[j][i] - model[j][i]));
  }
  expect(`${hand}: the demonstration ends in the model stance`, worst < 0.03, `largest difference ${(worst * 100).toFixed(1)} cm`);
  const end = analyzeStance(frameOf(built, hand), hand);
  expect(`${hand}: the end of the demonstration scores 100`, end.state === 'ok' && end.score === 100, end.state === 'ok' ? `score ${end.score}` : end.state);
  const start = analyzeStance(frameOf(buildStance(hand, STANDING), hand), hand);
  expect(`${hand}: standing upright does not pass as a stance`, start.state === 'ok' && start.score < PASS_SCORE, start.state === 'ok' ? `score ${start.score}` : start.state);
}

// ---- Checks of the bat (found in the picture by the camera page) ----
console.log('\nBat checks:');
{
  const deg = Math.PI / 180;
  // Direction of the bat from the hands to the toe; x to the right, y down.
  const bat = (angleFromDown: number, conf = 0.9, onBody = false): BatSeen => ({
    dx: Math.sin(angleFromDown * deg), dy: Math.cos(angleFromDown * deg), hx: 0.5, hy: 0.5, tx: 0.5, ty: 0.8, conf, onBody,
  });
  for (const hand of ['right', 'left'] as Hand[]) {
    // Put the front foot to the right of the picture, so the bowler is to the right.
    const withFeet = (f: PoseFrame): PoseFrame => {
      const lm = [...f.lm];
      const front = hand === 'right' ? LM.L_ANKLE : LM.R_ANKLE, back = hand === 'right' ? LM.R_ANKLE : LM.L_ANKLE;
      lm[front * 4] = 0.7; lm[back * 4] = 0.3;
      return { ...f, lm };
    };
    const check = (r: ReturnType<typeof analyzePose>, id: string) => (r.state === 'ok' ? r.checks.find((c) => c.id === id) : undefined);

    // Stance: bat resting down is good; a bat held up is corrected.
    let r = analyzePose('stance', { ...frameOf(idealStance(hand), hand), bat: bat(10) }, hand);
    expect(`${hand}: stance with the bat resting down scores 100`, r.state === 'ok' && r.score === 100, r.state === 'ok' ? `score ${r.score}` : r.state);
    r = analyzePose('stance', { ...frameOf(idealStance(hand), hand), bat: bat(170) }, hand);
    expect(`${hand}: stance with the bat held up is told to rest it`, r.state === 'ok' && r.cues[0]?.id === 'batRest', r.state === 'ok' ? r.cues[0]?.message ?? '' : '');

    // Defence: toe behind the hands (towards the back foot, so to the left) is good.
    const def = withFeet(frameOf(idealDefence(hand), hand, null));
    r = analyzePose('defence', { ...def, bat: bat(-15) }, hand);
    expect(`${hand}: defence with a straight bat, hands ahead, passes the bat check`, check(r, 'batTilt')?.status === 'good', `value ${check(r, 'batTilt')?.value?.toFixed(0)}`);
    r = analyzePose('defence', { ...def, bat: bat(30) }, hand);
    expect(`${hand}: defence with the toe ahead of the hands is told to keep the hands ahead`, check(r, 'batTilt')?.message?.startsWith('Keep your hands ahead') === true, check(r, 'batTilt')?.message ?? '');
    r = analyzePose('defence', { ...def, bat: bat(-90) }, hand);
    expect(`${hand}: defence with the bat across the body is told to keep it straight`, check(r, 'batTilt')?.message?.startsWith('Keep the bat straight') === true, check(r, 'batTilt')?.message ?? '');
    r = analyzePose('defence', { ...def, bat: bat(160) }, hand);
    expect(`${hand}: defence with the bat pointing up is told to keep it straight`, check(r, 'batTilt')?.message?.startsWith('Keep the bat straight') === true, check(r, 'batTilt')?.message ?? '');

    // Drive: bat high at the finish is good; a bat still pointing down is corrected.
    const drv = withFeet(frameOf(idealDrive(hand), hand, null));
    r = analyzePose('drive', { ...drv, bat: bat(150) }, hand);
    expect(`${hand}: drive finishing with the bat high passes the bat check`, check(r, 'batFinish')?.status === 'good');
    r = analyzePose('drive', { ...drv, bat: bat(10) }, hand);
    expect(`${hand}: drive with the bat still down is told to finish high`, check(r, 'batFinish')?.status === 'poor');

    // A bat that was not found clearly is not judged at all.
    r = analyzePose('defence', { ...def, bat: bat(-90, 0.2) }, hand);
    expect(`${hand}: a doubtful bat is not judged`, check(r, 'batTilt')?.value === null);
    r = analyzePose('defence', { ...def, bat: bat(-90, 0.9, true) }, hand);
    expect(`${hand}: a bat lying along a leg is not judged`, check(r, 'batTilt')?.value === null);
    r = analyzePose('defence', def, hand);
    expect(`${hand}: no bat leaves the body score unchanged`, r.state === 'ok' && check(r, 'batTilt')?.value === null);

    // An old bat reading is kept for a moment (one missed frame), then dropped.
    const sm = new StanceSmoother();
    analyzePose('defence', { ...def, bat: bat(-90) }, hand, sm);
    r = analyzePose('defence', { ...def, bat: null }, hand, sm);
    expect(`${hand}: one missed frame keeps the bat`, check(r, 'batTilt')?.value !== null);
    for (let i = 0; i < 8; i++) r = analyzePose('defence', { ...def, bat: null }, hand, sm);
    expect(`${hand}: the bat check clears when the bat is lost`, check(r, 'batTilt')?.value === null);
  }
}

// ---- Fixes asked for after the field test (October 2026) ----
console.log('\nField test fixes:');
for (const hand of ['right', 'left'] as Hand[]) {
  const check = (r: ReturnType<typeof analyzePose>, id: string) => (r.state === 'ok' ? r.checks.find((c) => c.id === id) : undefined);
  const first = (r: ReturnType<typeof analyzePose>) => (r.state === 'ok' ? r.cues[0] : undefined);
  const front = hand === 'right' ? LM.L_ANKLE : LM.R_ANKLE;
  const back = hand === 'right' ? LM.R_ANKLE : LM.L_ANKLE;
  // Side view: the front foot to the right of the picture, so the bowler is to the right.
  const sideFrame = (f: PoseFrame): PoseFrame => {
    const lm = [...f.lm];
    lm[front * 4] = 0.62; lm[back * 4] = 0.38;
    return { ...f, lm };
  };
  const batAt = (dx: number, dy: number): BatSeen => {
    const l = Math.hypot(dx, dy);
    return { dx: dx / l, dy: dy / l, hx: 0.5, hy: 0.55, tx: 0.5, ty: 0.85, conf: 0.9, onBody: false };
  };

  // 1. The bat (field test, October 2026). The bat is corrected only when it is held high, up in
  // the air. Resting down, lifted a little behind (as Virat Kohli holds it), or not seen at all:
  // nothing is said about the bat and the stance counts.
  let r = analyzePose('stance', frameOf(idealStance(hand), hand, null), hand);
  expect(`${hand}: no bat seen: nothing said about the bat, the stance counts`, r.state === 'ok' && isGoodPosition(r) && !r.cues.some((c) => c.id === 'batRest'), r.state === 'ok' ? `score ${r.score}` : r.state);
  r = analyzePose('stance', frameOf(idealStance(hand), hand), hand);
  expect(`${hand}: bat resting down: the stance counts`, r.state === 'ok' && isGoodPosition(r) && r.score === 100, r.state === 'ok' ? `score ${r.score}` : r.state);
  const base = sideFrame(frameOf(idealStance(hand), hand));
  for (const [name, dx, dy] of [['lifted a little behind (Kohli)', -0.85, -0.5], ['held out level', 1, 0], ['lifted behind, 45 degrees', -0.7, -0.7], ['down but out in front', 1, 0.9]] as [string, number, number][]) {
    r = analyzePose('stance', { ...base, bat: batAt(dx, dy) }, hand);
    expect(`${hand}: bat ${name}: nothing said, the stance counts`, check(r, 'batRest')?.status === 'good' && r.state === 'ok' && isGoodPosition(r), `${check(r, 'batRest')?.value?.toFixed(0)}° ${check(r, 'batRest')?.message ?? ''}`);
  }
  r = analyzePose('stance', { ...base, bat: batAt(0.15, -1) }, hand);
  expect(`${hand}: bat straight up in the air: "too high, up in the air", does not count`, check(r, 'batRest')?.message?.startsWith('Your bat is too high, up in the air') === true && r.state === 'ok' && !isGoodPosition(r), `${check(r, 'batRest')?.value?.toFixed(0)}° ${check(r, 'batRest')?.message ?? ''}`);
  expect(`${hand}: the bat message names the ${hand} toe`, check(r, 'batRest')?.message?.includes(`${hand} toe`) === true);

  // 2. Feet in line. Side by side passes; one foot ahead of the other, or toes at the bowler, does not.
  const z = hand === 'right' ? 1 : -1; // figure Z points where the toes point
  const ahead = idealStance(hand).map((p) => [...p] as Vec3);
  for (const k of hand === 'right' ? [LM.L_ANKLE, LM.L_HEEL, LM.L_TOE] : [LM.R_ANKLE, LM.R_HEEL, LM.R_TOE]) ahead[k][2] += 0.25 * z;
  r = analyzePose('stance', frameOf(ahead, hand), hand);
  expect(`${hand}: front foot ahead of the back foot gives a feet-in-line cue`, check(r, 'feetLine')?.message?.includes('foot is ahead') === true && check(r, 'feetLine')!.message!.includes(hand === 'right' ? 'left foot is ahead' : 'right foot is ahead'), check(r, 'feetLine')?.message ?? '');
  const toesAtBowler = idealStance(hand).map((p) => [...p] as Vec3);
  for (const [heel, toe, ankle] of [[LM.L_HEEL, LM.L_TOE, LM.L_ANKLE], [LM.R_HEEL, LM.R_TOE, LM.R_ANKLE]]) {
    toesAtBowler[heel] = [toesAtBowler[ankle][0] - 0.06, 0.03, toesAtBowler[ankle][2]];
    toesAtBowler[toe] = [toesAtBowler[ankle][0] + 0.17, 0.02, toesAtBowler[ankle][2]];
  }
  r = analyzePose('stance', frameOf(toesAtBowler, hand), hand);
  expect(`${hand}: toes pointing at the bowler are corrected`, check(r, 'feetLine')?.message?.startsWith('Turn your toes') === true, check(r, 'feetLine')?.message ?? '');

  // 3. Feet width must not change with the phone position. The shoulder line is often measured
  // short (it points at the phone); that used to make good feet look too wide.
  const shortShoulders = idealStance(hand).map((p) => [...p] as Vec3);
  for (const k of [LM.L_SHOULDER, LM.R_SHOULDER]) shortShoulders[k][0] *= 0.6;
  r = analyzePose('stance', frameOf(shortShoulders, hand), hand);
  expect(`${hand}: good feet stay good when the shoulders are measured short`, check(r, 'feet')?.status === 'good', `value ${check(r, 'feet')?.value?.toFixed(2)}`);
  for (const angle of [0, 30, 45, 60, 75, 90, -45, -75]) {
    r = analyzeStance({ ...frameOf(idealStance(hand), hand), world: turned(frameOf(idealStance(hand), hand).world, angle) }, hand);
    expect(`${hand}: phone at ${angle} degrees: feet and feet-in-line are good`, check(r, 'feet')?.status === 'good' && check(r, 'feetLine')?.status === 'good', `${check(r, 'feet')?.value?.toFixed(2)} ${check(r, 'feetLine')?.value?.toFixed(2)}`);
  }

  // 4. Eyes. Looking at the bowler is good wherever the phone is (side, diagonal or in front).
  for (const angle of [0, 20, 40, 55, 60, 70, 80, 90, -40, -60, -90]) {
    r = analyzeStance({ ...frameOf(idealStance(hand), hand), world: turned(frameOf(idealStance(hand), hand).world, angle) }, hand);
    expect(`${hand}: phone at ${angle} degrees, looking at the bowler: eyes good`, check(r, 'look')?.status === 'good', `angle ${check(r, 'look')?.value?.toFixed(0)}`);
  }
  // Head turned the other way (away from the bowler, over the back shoulder).
  const away = idealStance(hand).map((p) => [...p] as Vec3);
  away[LM.NOSE][0] = -away[LM.NOSE][0];
  r = analyzeStance(frameOf(away, hand), hand);
  expect(`${hand}: looking the other way: "keep your neck straight"`, check(r, 'look')?.message?.startsWith('Keep your neck straight. You are looking the other way') === true, check(r, 'look')?.message ?? '');
  expect(`${hand}: eyes are only a tip: looking away does not stop the stance counting`, r.state === 'ok' && isGoodPosition(r) && r.score === 100, r.state === 'ok' ? `score ${r.score}` : r.state);
  // Head turned to the chest side (where the phone is, from the side).
  const toChest = idealStance(hand).map((p) => [...p] as Vec3);
  const zc = hand === 'right' ? 1 : -1;
  toChest[LM.NOSE] = [0, 1.563, 0.29 * zc];
  toChest[LM.L_EAR] = [0.075, 1.583, 0.19 * zc];
  toChest[LM.R_EAR] = [-0.075, 1.583, 0.19 * zc];
  const chestFrame = frameOf(toChest, hand);
  r = analyzeStance(chestFrame, hand);
  expect(`${hand}: head turned to the side, face not to the phone: told to turn the head, not "phone"`, check(r, 'look')?.message?.startsWith('Turn your head') === true, check(r, 'look')?.message ?? '');
  // The same, but the picture shows a face turned to the phone (both ears seen, nose between them).
  const lm = [...chestFrame.lm];
  lm[LM.L_EAR * 4] = 0.56; lm[LM.R_EAR * 4] = 0.44; lm[LM.NOSE * 4] = 0.5;
  r = analyzeStance({ ...chestFrame, lm }, hand);
  expect(`${hand}: face turned to the phone: "not at the phone"`, check(r, 'look')?.message === 'Look at the bowler, not at the phone.', check(r, 'look')?.message ?? '');
  expect(`${hand}: the eyes tip comes after the real faults and is marked as a tip`, r.state === 'ok' && r.cues.find((c) => c.id === 'look')?.advisory === true);
  // A profile face (one ear hidden) is never called "looking at the phone".
  const prof = [...lm];
  prof[LM.R_EAR * 4 + 3] = 0.2;
  expect(`${hand}: a face seen from the side is not "facing the phone"`, !facingPhone(prof));
}

// ---- Neck and tips (October 2026, second round) ----
console.log('\nNeck and tips:');
for (const hand of ['right', 'left'] as Hand[]) {
  const check = (r: ReturnType<typeof analyzePose>, id: string) => (r.state === 'ok' ? r.checks.find((c) => c.id === id) : undefined);
  // Looking up: the nose well above the ears.
  const up = idealStance(hand).map((p) => [...p] as Vec3);
  up[LM.NOSE][1] = 1.583 + 0.06;
  let r = analyzeStance(frameOf(up, hand), hand);
  expect(`${hand}: looking up gives "keep your neck straight"`, check(r, 'neck')?.message?.startsWith('Keep your neck straight. Do not look up') === true, `${check(r, 'neck')?.value?.toFixed(0)}° ${check(r, 'neck')?.message ?? ''}`);
  expect(`${hand}: looking up is a tip: the stance still counts`, r.state === 'ok' && isGoodPosition(r), r.state === 'ok' ? `score ${r.score}` : r.state);
  r = analyzeStance(frameOf(idealStance(hand), hand), hand);
  expect(`${hand}: model stance: neck straight`, check(r, 'neck')?.status === 'good', `${check(r, 'neck')?.value?.toFixed(0)}°`);

  // A bat known only from the hands is never judged and never blocks, whichever way the guess points.
  for (const [dx, dy] of [[0.17, 0.98], [0.6, -0.8]]) {
    r = analyzeStance({ ...frameOf(idealStance(hand), hand), bat: { ...RESTING_BAT, dx, dy, est: true } }, hand);
    expect(`${hand}: a guessed bat (${dy > 0 ? 'down' : 'up'}) is not judged and does not block`, check(r, 'batRest')?.unsure === true && r.state === 'ok' && isGoodPosition(r), r.state === 'ok' ? `score ${r.score}` : r.state);
  }

  // Knees: from the side the bend is in depth, so a "nearly" does not stop the stance counting.
  const tall = idealStance(hand).map((p) => [...p] as Vec3);
  for (const [hip, knee, ankle] of [[LM.L_HIP, LM.L_KNEE, LM.L_ANKLE], [LM.R_HIP, LM.R_KNEE, LM.R_ANKLE]]) {
    tall[knee] = [0, 1, 2].map((i) => tall[hip][i] * 0.5 + tall[ankle][i] * 0.5 + (i === 2 ? 0.04 : 0)) as Vec3;
  }
  r = analyzeStance(frameOf(tall, hand), hand);
  expect(`${hand}: knees a little straight (169 degrees) are not marked wrong`, check(r, 'knees')?.status !== 'poor' && r.state === 'ok' && isGoodPosition(r), `knees ${check(r, 'knees')?.value?.toFixed(0)}° ${check(r, 'knees')?.status}`);

  // The head seen from the side, face turned to the bowler: the nose is hidden, one ear is seen.
  const profile = frameOf(idealStance(hand), hand);
  profile.lm[LM.NOSE * 4 + 3] = 0.2;
  profile.lm[LM.R_EAR * 4 + 3] = 0.2;
  r = analyzeStance(profile, hand);
  expect(`${hand}: face turned to the bowler (nose hidden): the stance is still judged`, r.state === 'ok', r.state);

  // Defence: the head must be down, watching the ball.
  r = analyzePose('defence', frameOf(idealDefence(hand), hand, null), hand);
  expect(`${hand}: model defence: head down and leaning in`, check(r, 'headDown')?.status === 'good' && check(r, 'leanIn')?.status === 'good', `head ${check(r, 'headDown')?.value?.toFixed(0)}° lean ${check(r, 'leanIn')?.value?.toFixed(0)}°`);
  const headUp = idealDefence(hand).map((p) => [...p] as Vec3);
  headUp[LM.NOSE][1] = headUp[LM.L_EAR][1] - 0.005;
  r = analyzePose('defence', frameOf(headUp, hand, null), hand);
  expect(`${hand}: defence with the head up: "get your head down", does not count`, check(r, 'headDown')?.message?.startsWith('Get your head down') === true && r.state === 'ok' && !isGoodPosition(r), `${check(r, 'headDown')?.value?.toFixed(0)}°`);

  // Defence: a step that is too long is wrong.
  const longStep = idealDefence(hand).map((p) => [...p] as Vec3);
  const fa = hand === 'right' ? [LM.L_ANKLE, LM.L_HEEL, LM.L_TOE] : [LM.R_ANKLE, LM.R_HEEL, LM.R_TOE];
  for (const k of fa) longStep[k][0] += 0.55;
  r = analyzePose('defence', frameOf(longStep, hand, null), hand, undefined, { only: ['stride'] });
  expect(`${hand}: defence step too long: "take a shorter step"`, check(r, 'stride')?.message?.startsWith('Your step is too long') === true, `${check(r, 'stride')?.value?.toFixed(2)} ${check(r, 'stride')?.message ?? ''}`);
  r = analyzePose('defence', frameOf(idealDefence(hand), hand, null), hand, undefined, { only: ['stride'] });
  expect(`${hand}: model defence step is good`, check(r, 'stride')?.status === 'good', `${check(r, 'stride')?.value?.toFixed(2)}`);

  // Defence from the front: the step points at the phone and looks short in 3D. A front ankle
  // lower in the picture than the back ankle shows a long step.
  const fr = frameOf(idealDefence(hand), hand, null);
  const sd = sides(hand);
  const flat = [...fr.world];
  // Squash the step in depth, as the pose model does when it points at the phone.
  flat[sd.frontAnkle * 3] = flat[sd.backAnkle * 3] + 0.15;
  const lmF = [...fr.lm];
  lmF[sd.backKnee * 4 + 1] = 0.7; lmF[sd.backAnkle * 4 + 1] = 0.82;
  lmF[sd.frontKnee * 4 + 1] = 0.78; lmF[sd.frontAnkle * 4 + 1] = 0.92;
  const shortIn3d = strideLength(flat, hand, undefined, 'front');
  const withPicture = strideLength(flat, hand, lmF, 'front', 0.75);
  expect(`${hand}: from the front a long step is read from the picture`, shortIn3d < 1.7 && withPicture >= 1.7, `3D ${shortIn3d.toFixed(2)}, with picture ${withPicture.toFixed(2)}`);
  // The both-hands check was removed (October 2026): it must never be reported.
  r = analyzeStance(frameOf(idealStance(hand), hand), hand);
  expect(`${hand}: there is no both-hands check`, r.state === 'ok' && !r.checks.some((c) => (c.id as string) === 'twoHands'));
}

for (const b of BENCHMARKS) expect(`stance check "${b.id}" has a step that teaches it`, DEMO_STEPS.stance[stepForCheck('stance', b.id)].teaches?.includes(b.id) === true);
for (const b of GRIP_BENCHMARKS) expect(`grip check "${b.id}" has a step that teaches it`, DEMO_STEPS.grip[stepForCheck('grip', b.id)].teaches?.includes(b.id) === true);


// ---------------------------------------------------------------- field test, 12 October 2026
// Two screenshots from the phone: (1) side-on, hands pushed out in front with the bat up in the
// air, scored 100; (2) phone in front, learner facing it with the bat between the legs, scored 98.
console.log('\nField test, 12 October (hands out, facing the phone):');
{
  // A picture of the body: world landmarks seen straight on (x across, y down), 0..1 of the frame.
  const picture = (world: number[], ar = 0.75) => {
    const lm: number[] = [];
    for (let i = 0; i < 33; i++) lm.push(0.5 + (world[i * 3] * 0.38) / ar, 0.5 + world[i * 3 + 1] * 0.38, 0, 0.95);
    return lm;
  };
  for (const hand of ['right', 'left'] as Hand[]) {
    // Phone in front: the batter is side-on to it (body turned 90 degrees from facing it).
    const sideOn = turned(figureToWorld(idealStance(hand), hand), 90);
    const good: PoseFrame = { t: 0, lm: picture(sideOn), world: sideOn, aspect: 0.75 };
    let r = analyzePose('stance', good, hand, undefined, { view: 'front' });
    expect(`${hand}: phone in front, side-on model stance is judged`, r.state === 'ok', r.state);
    const inIdeal = handsFromBody(good.lm, 0.75)!;
    expect(`${hand}: model stance has the hands close to the body`, inIdeal <= 0.35, `hands in ${inIdeal.toFixed(2)}`);
    expect(`${hand}: model stance gives no hands-in cue`, r.state === 'ok' && !r.cues.some((c) => c.id === 'handsIn'));

    // Hands pushed out in front of the body (screenshot 1).
    const out = { ...good, lm: [...good.lm] };
    const hipX = (out.lm[LM.L_HIP * 4] + out.lm[LM.R_HIP * 4]) / 2;
    const shX = (out.lm[LM.L_SHOULDER * 4] + out.lm[LM.R_SHOULDER * 4]) / 2;
    for (const j of [LM.L_WRIST, LM.R_WRIST, LM.L_INDEX, LM.R_INDEX]) out.lm[j * 4] = Math.min(hipX, shX) - 0.2;
    expect(`${hand}: hands out in front measure far from the body`, handsFromBody(out.lm, 0.75)! > 0.6, `hands in ${handsFromBody(out.lm, 0.75)!.toFixed(2)}`);
    // Leaning forward with the arms hanging from the shoulders (screenshot, 12 October): the hands
    // are ahead of the hips but under the shoulders. This is a good stance.
    const leanFwd = { ...good, lm: [...good.lm] };
    const shX0 = (leanFwd.lm[LM.L_SHOULDER * 4] + leanFwd.lm[LM.R_SHOULDER * 4]) / 2;
    const dirOut = Math.sign(shX0 - hipX) || -1;
    for (const j of [LM.L_SHOULDER, LM.R_SHOULDER, LM.NOSE, LM.L_EAR, LM.R_EAR]) leanFwd.lm[j * 4] += dirOut * 0.12;
    const shX1 = (leanFwd.lm[LM.L_SHOULDER * 4] + leanFwd.lm[LM.R_SHOULDER * 4]) / 2;
    for (const j of [LM.L_WRIST, LM.R_WRIST, LM.L_INDEX, LM.R_INDEX]) leanFwd.lm[j * 4] = shX1;
    const hl = handsFromBody(leanFwd.lm, 0.75)!;
    expect(`${hand}: leaning forward, hands under the shoulders, is not "hands out"`, hl <= 0.35, `hands in ${hl.toFixed(2)}`);
    r = analyzePose('stance', out, hand, undefined, { view: 'front' });
    const c = r.state === 'ok' ? r.checks.find((x) => x.id === 'handsIn') : undefined;
    expect(`${hand}: hands out in front gives the hands-in correction`, c?.status === 'poor' && /out away from your body/.test(c.message ?? ''), c?.message ?? r.state);
    expect(`${hand}: hands out in front does not count as a good stance`, r.state === 'ok' && !isGoodPosition(r));

    // Facing the phone when it is in front (screenshot 2).
    const facing = figureToWorld(idealStance(hand), hand);
    const square: PoseFrame = { t: 0, lm: picture(facing), world: facing, aspect: 0.75 };
    expect(`${hand}: chest facing the phone is seen in the picture`, chestOnInPicture(square.lm, 0.75));
    r = analyzePose('stance', square, hand, undefined, { view: 'front' });
    expect(`${hand}: phone in front, facing it gives "stand side-on"`, r.state === 'wrong-angle' && r.problem === 'chest-on', r.state);
    r = analyzePose('defence', square, hand, undefined, { view: 'front' });
    expect(`${hand}: in the shot itself, turning the shoulders is not blocked (stance check only)`, r.state !== 'wrong-angle');
    // With the phone at the side, facing it is right.
    r = analyzePose('stance', square, hand, undefined, { view: 'side' });
    expect(`${hand}: phone at the side, facing it is judged normally`, r.state === 'ok', r.state);
    expect(`${hand}: side-on body is not taken as facing the phone`, !chestOnInPicture(good.lm, 0.75));

    // Toes (12 October): a front foot turned to point at the phone must not count.
    const toes = toesInPicture(good.lm, 0.75)!;
    expect(`${hand}: model stance has the toes to the side`, toes <= 45, `${toes.toFixed(0)} degrees`);
    r = analyzePose('stance', good, hand, undefined, { view: 'front' });
    expect(`${hand}: model stance gives no toes cue`, r.state === 'ok' && !r.cues.some((c) => c.id === 'toesSide'));
    const turnedFoot = { ...good, lm: [...good.lm] };
    const s2 = sides(hand);
    const heel = hand === 'right' ? LM.L_HEEL : LM.R_HEEL, toe = hand === 'right' ? LM.L_TOE : LM.R_TOE; // front foot
    void s2;
    turnedFoot.lm[toe * 4] = turnedFoot.lm[heel * 4] + 0.01;
    turnedFoot.lm[toe * 4 + 1] = turnedFoot.lm[heel * 4 + 1] + 0.06;
    r = analyzePose('stance', turnedFoot, hand, undefined, { view: 'front' });
    const tc = r.state === 'ok' ? r.checks.find((x) => x.id === 'toesSide') : undefined;
    expect(`${hand}: front foot turned to the phone gives the toes correction`, tc?.status === 'poor' && /toes point to the side/.test(tc.message ?? ''), tc?.message ?? r.state);
    expect(`${hand}: front foot turned to the phone does not count`, r.state === 'ok' && !isGoodPosition(r));
    r = analyzePose('stance', turnedFoot, hand, undefined, { view: 'side' });
    expect(`${hand}: toes are not judged with the phone at the side`, r.state === 'ok' && !r.checks.find((x) => x.id === 'toesSide' && x.value !== null));
  }
}

// Field test, 18 October 2026.
// (1) Practising with a bat: a stance whose bat is not seen must not count, and the learner must
//     be told; practising without a bat, the same stance counts.
// (2) Phone in front: the width of the feet and the lean run along the line to the phone, so they
//     are tips there; a narrow stance is then said but does not stop the stance check.
// (3) In a shot, a bat that is not seen is a tip, not a fault.
for (const hand of ['right', 'left'] as Hand[]) {
  const noBat = frameOf(idealStance(hand), hand, null);
  let r = analyzePose('stance', noBat, hand, undefined, { requireBat: true });
  const bat = r.state === 'ok' ? r.checks.find((c) => c.id === 'batRest') : undefined;
  expect(`${hand}: with a bat, a stance whose bat is not seen does not count`, r.state === 'ok' && !isGoodPosition(r) && !!bat?.message?.includes('cannot see your bat'), bat?.message ?? r.state);
  r = analyzePose('stance', noBat, hand, undefined, { requireBat: false });
  expect(`${hand}: without a bat, the same stance counts`, r.state === 'ok' && isGoodPosition(r), r.state === 'ok' ? `score ${r.score}` : r.state);

  const narrow = idealStance(hand).map((p) => [...p] as Vec3);
  const sd = sides(hand);
  narrow[sd.frontAnkle][2] = narrow[sd.backAnkle][2] + 0.12;
  narrow[sd.frontAnkle][0] = narrow[sd.backAnkle][0];
  const w = turned(figureToWorld(narrow, hand), 90);
  const lm: number[] = [];
  for (let i = 0; i < 33; i++) lm.push(0.5 + (w[i * 3] * 0.38) / 0.75, 0.5 + w[i * 3 + 1] * 0.38, 0, 0.95);
  r = analyzePose('stance', { t: 0, lm, world: w, aspect: 0.75, bat: RESTING_BAT }, hand, undefined, { view: 'front' });
  const feet = r.state === 'ok' ? r.checks.find((c) => c.id === 'feet') : undefined;
  expect(`${hand}: phone in front, the feet width is a tip, not a fault`, r.state === 'ok' && !!feet?.advisory, feet ? `feet ${feet.status}, advisory ${!!feet.advisory}` : r.state);

  const shot = frameOf(idealDefence(hand), hand, null);
  r = analyzePose('defence', shot, hand, undefined, { requireBat: true });
  const tilt = r.state === 'ok' ? r.checks.find((c) => c.id === 'batTilt') : undefined;
  expect(`${hand}: in a shot, a bat that is not seen is a tip that does not block`, r.state === 'ok' && !!tilt?.advisory && !!tilt.message?.includes('cannot see your bat') && !r.cues.some((c) => c.id === 'batTilt' && !c.advisory), tilt?.message ?? r.state);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
