import { idealBat, idealStance, mirrorPose } from './idealStance';
import { LANDMARK_COUNT, LM, type Hand, type Vec3 } from './landmarks';

/**
 * The model positions of the other basic shots, for the 3D demonstration and for the tests:
 *
 *   backdefence  back-foot defence: weight back, head over the back foot, front leg light
 *   pull         the pull shot: weight back, body turns, hands high and across
 *   cut          the square cut: back foot back and across, arms out to the off side
 *   sweep        the sweep: front foot forward, deep front knee, head down, hands low
 *
 * Poses are written for a right-handed batter in figure space (X towards the bowler, Y up,
 * Z towards the off side, the way the chest faces) and mirrored for a left-hander. Each is
 * described by a few positions (hips, shoulders, feet, hands) and the arms and legs are filled
 * in with real bone lengths, so a figure always has a believable body.
 *
 * THESE ARE TEXTBOOK POSITIONS, a starting point. Check them with a coach and tune the ranges in
 * benchmarks.ts, as for the stance.
 */
export type ShotId = 'backdefence' | 'pull' | 'cut' | 'sweep';
export const SHOT_IDS: ShotId[] = ['backdefence', 'pull', 'cut', 'sweep'];
export const isShotId = (s: string): s is ShotId => (SHOT_IDS as string[]).includes(s);

const UPPER_ARM = 0.3;
const FOREARM = 0.27;
const THIGH = 0.43;
const SHIN = 0.43;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** The middle joint of a two-bone limb from `root` to `end`, bending towards `pole`. */
function twoBone(root: Vec3, end: Vec3, l1: number, l2: number, pole: Vec3): { joint: Vec3; end: Vec3 } {
  let axis = sub(end, root);
  let d = len(axis);
  const reach = (l1 + l2) * 0.999;
  if (d > reach) {
    axis = scale(unit(axis), reach);
    end = add(root, axis);
    d = reach;
  }
  const dir = unit(axis);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // The direction to bend: the part of the pole at right angles to the limb.
  let perp = sub(pole, scale(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = [0, 0, 1];
  return { joint: add(add(root, scale(dir, a)), scale(unit(perp), h)), end };
}

type Spec = {
  hip: Vec3;
  /** Direction across the hips, front hip minus back hip, in the floor plane (x, z). */
  hipAcross: [number, number];
  shoulder: Vec3;
  shoulderAcross: [number, number];
  /** Front (left) and back (right) ankle. */
  ankleF: Vec3;
  ankleB: Vec3;
  /** Direction the toes point, in the floor plane. */
  toesF: [number, number];
  toesB: [number, number];
  /** Where the knees bend to; the default is forwards. */
  kneeF?: Vec3;
  kneeB?: Vec3;
  /** Which way the head looks (x, z) and how far it is tipped down, 0 to 1. */
  look: [number, number];
  tilt: number;
  wristF: Vec3;
  wristB: Vec3;
  /** Which way the elbows bend to. */
  poleF: Vec3;
  poleB: Vec3;
  bat: { top: Vec3; toe: Vec3 };
};

function build(spec: Spec): Vec3[] {
  const pose: Vec3[] = Array.from({ length: LANDMARK_COUNT }, () => [0, 0, 0] as Vec3);
  const across = (a: [number, number]): Vec3 => unit([a[0], 0, a[1]]);
  const hAcross = scale(across(spec.hipAcross), 0.13);
  const sAcross = scale(across(spec.shoulderAcross), 0.18);
  const hipF = add(spec.hip, hAcross);
  const hipB = sub(spec.hip, hAcross);
  const shF = add(spec.shoulder, sAcross);
  const shB = sub(spec.shoulder, sAcross);
  pose[LM.L_HIP] = hipF;
  pose[LM.R_HIP] = hipB;
  pose[LM.L_SHOULDER] = shF;
  pose[LM.R_SHOULDER] = shB;

  // Legs.
  for (const [hip, ankle, knee, toes, L, K, A, H, T] of [
    [hipF, spec.ankleF, spec.kneeF, spec.toesF, 'F', LM.L_KNEE, LM.L_ANKLE, LM.L_HEEL, LM.L_TOE],
    [hipB, spec.ankleB, spec.kneeB, spec.toesB, 'B', LM.R_KNEE, LM.R_ANKLE, LM.R_HEEL, LM.R_TOE],
  ] as const) {
    void L;
    const leg = twoBone(hip, ankle, THIGH, SHIN, [0, 0, 1]);
    pose[K] = knee ?? leg.joint;
    pose[A] = leg.end;
    const t = unit([toes[0], 0, toes[1]]);
    pose[H] = [leg.end[0] - t[0] * 0.06, leg.end[1] - 0.05, leg.end[2] - t[2] * 0.06];
    pose[T] = [leg.end[0] + t[0] * 0.17, 0.02, leg.end[2] + t[2] * 0.17];
  }

  // Head.
  const look = unit([spec.look[0], 0, spec.look[1]]);
  const sc = spec.shoulder;
  const ear = scale(unit([look[2], 0, -look[0]]), 0.075);
  pose[LM.NOSE] = [sc[0] + look[0] * 0.1, sc[1] + 0.19 - 0.09 * spec.tilt, sc[2] + look[2] * 0.1];
  pose[LM.L_EAR] = [sc[0] + ear[0], sc[1] + 0.21 + 0.02 * spec.tilt, sc[2] + ear[2]];
  pose[LM.R_EAR] = [sc[0] - ear[0], sc[1] + 0.21 + 0.02 * spec.tilt, sc[2] - ear[2]];

  // Arms.
  for (const [sh, wrist, pole, E, W] of [
    [shF, spec.wristF, spec.poleF, LM.L_ELBOW, LM.L_WRIST],
    [shB, spec.wristB, spec.poleB, LM.R_ELBOW, LM.R_WRIST],
  ] as const) {
    const arm = twoBone(sh, wrist, UPPER_ARM, FOREARM, pole);
    pose[E] = arm.joint;
    pose[W] = arm.end;
  }
  return pose;
}

const SPECS: Record<ShotId, Spec> = {
  // Back-foot defence: the back foot goes back and across, the weight is on it, the head is over
  // it, the front leg is light and nearly straight, the bat is straight in front of the body.
  backdefence: {
    hip: [-0.18, 0.88, 0],
    hipAcross: [1, 0],
    shoulder: [-0.28, 1.34, 0.15],
    shoulderAcross: [1, 0],
    ankleF: [0.18, 0.08, 0.02],
    ankleB: [-0.34, 0.08, 0.06],
    toesF: [0.1, 1],
    toesB: [0, 1],
    look: [0.8, 0.6],
    tilt: 0.3,
    wristF: [0.0, 0.92, 0.3],
    wristB: [-0.08, 0.86, 0.3],
    poleF: [0.3, 0.9, 0.4],
    poleB: [-0.4, -0.3, 0.8],
    bat: { top: [0.0, 0.92, 0.3], toe: [0.02, 0.08, 0.33] },
  },
  // Pull: weight back, the body turns to face the leg side, the hands finish high and across.
  pull: {
    hip: [-0.2, 0.9, 0],
    hipAcross: [0.82, -0.57],
    shoulder: [-0.26, 1.35, 0.1],
    shoulderAcross: [0.57, -0.82],
    ankleF: [0.12, 0.08, -0.12],
    ankleB: [-0.34, 0.08, 0.16],
    toesF: [0.5, 0.2],
    toesB: [0.3, 0.9],
    look: [0.7, -0.3],
    tilt: 0.2,
    wristF: [0.06, 1.4, -0.22],
    wristB: [-0.04, 1.3, -0.1],
    poleF: [0, 0.4, -1],
    poleB: [0.2, -0.8, 0.5],
    bat: { top: [0.04, 1.36, -0.15], toe: [0.34, 1.12, -0.7] },
  },
  // Square cut: the back foot goes back and across, the weight is back, the arms reach out to the
  // off side with the hands high, the body stays side-on.
  cut: {
    hip: [-0.2, 0.88, 0.02],
    hipAcross: [1, 0.1],
    shoulder: [-0.3, 1.35, 0.15],
    shoulderAcross: [0.98, 0.18],
    ankleF: [0.18, 0.08, 0.02],
    ankleB: [-0.5, 0.08, 0.2],
    toesF: [0.1, 1],
    toesB: [0, 1],
    look: [0.8, 0.5],
    tilt: 0.3,
    wristF: [-0.06, 1.3, 0.66],
    wristB: [-0.14, 1.26, 0.6],
    poleF: [0, 0.7, 0.2],
    poleB: [-0.3, -0.5, 0.2],
    bat: { top: [-0.1, 1.3, 0.64], toe: [-0.02, 1.02, 1.4] },
  },
  // Sweep: a long front step, deep front knee, back knee near the ground, head down over the
  // front knee, the hands low, the bat swept along the ground to the leg side.
  sweep: {
    hip: [0.0, 0.55, 0],
    hipAcross: [1, 0],
    shoulder: [0.26, 0.98, 0.1],
    shoulderAcross: [1, 0],
    ankleF: [0.5, 0.08, 0.04],
    ankleB: [-0.45, 0.1, 0.02],
    toesF: [0.2, 1],
    toesB: [0.2, 1],
    kneeB: [-0.1, 0.13, 0.02],
    look: [0.8, 0.5],
    tilt: 0.8,
    wristF: [0.56, 0.5, 0.2],
    wristB: [0.5, 0.46, 0.18],
    poleF: [0.2, 0.2, 1],
    poleB: [-0.5, -0.4, 0.6],
    bat: { top: [0.54, 0.5, 0.2], toe: [0.9, 0.12, -0.45] },
  },
};

/** The model position of a shot, held at its end, for a right- or left-handed batter. */
export function idealShot(shot: ShotId, hand: Hand): Vec3[] {
  const pose = build(SPECS[shot]);
  return hand === 'right' ? pose : mirrorPose(pose);
}

/** Where the bat is at the end of a shot: from the top of the handle to the toe. */
export function shotBat(shot: ShotId, hand: Hand): { top: Vec3; toe: Vec3 } {
  const z = hand === 'right' ? 1 : -1;
  const b = SPECS[shot].bat;
  return { top: [b.top[0], b.top[1], b.top[2] * z], toe: [b.toe[0], b.toe[1], b.toe[2] * z] };
}

/**
 * How far into a shot the batter has moved, each part from 0 (the stance) to 1 (the held shot):
 * the feet, the knees and hips, the head and trunk, and the swing of the arms and bat.
 */
export type ShotProgress = { step: number; knee: number; head: number; swing: number };
export const SHOT_START: ShotProgress = { step: 0, knee: 0, head: 0, swing: 0 };
export const SHOT_END: ShotProgress = { step: 1, knee: 1, head: 1, swing: 1 };

/** Builds a pose part-way from the stance into a shot. */
export function buildShot(shot: ShotId, hand: Hand, p: ShotProgress): Vec3[] {
  const from = idealStance('right');
  const to = build(SPECS[shot]);
  const feet: number[] = [LM.L_ANKLE, LM.L_HEEL, LM.L_TOE, LM.R_ANKLE, LM.R_HEEL, LM.R_TOE];
  const legs: number[] = [LM.L_KNEE, LM.R_KNEE, LM.L_HIP, LM.R_HIP];
  const upper: number[] = [LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER];
  const arms: number[] = [LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST];
  const group = (i: number) => (feet.includes(i) ? p.step : legs.includes(i) ? p.knee * 0.7 + p.step * 0.3 : upper.includes(i) ? p.head : arms.includes(i) ? p.swing : 0);
  const pose: Vec3[] = Array.from({ length: LANDMARK_COUNT }, (_, i) => mix3(from[i], to[i], group(i)));
  return hand === 'right' ? pose : mirrorPose(pose);
}

/** The bat part-way from the stance into a shot. */
export function shotBatAt(shot: ShotId, hand: Hand, swing: number): { top: Vec3; toe: Vec3 } {
  const a = idealBat(hand);
  const b = shotBat(shot, hand);
  return { top: mix3(a.top, b.top, swing), toe: mix3(a.toe, b.toe, swing) };
}
