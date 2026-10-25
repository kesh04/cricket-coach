import { LANDMARK_COUNT, LM, sides, type Hand, type Vec3 } from './landmarks';

/**
 * The model batting stance used by the 3D figure.
 *
 * Figure space, in metres:
 *   X  along the pitch, towards the bowler
 *   Y  up from the ground
 *   Z  towards the off side of a right-handed batter (the way the chest faces)
 *
 * The right-handed stance is written out below. The left-handed stance is its mirror image.
 */
const RIGHT_HANDED: Partial<Record<number, Vec3>> = {
  // The head is turned to look down the pitch at the bowler (about 30 degrees off the pitch line).
  [LM.NOSE]: [0.0857, 1.563, 0.2428],
  [LM.L_EAR]: [0.0386, 1.583, 0.127],
  [LM.R_EAR]: [-0.0386, 1.583, 0.2556],
  // The left side leads for a right-hander.
  [LM.L_SHOULDER]: [0.18, 1.37, 0.19],
  [LM.R_SHOULDER]: [-0.18, 1.37, 0.19],
  [LM.L_ELBOW]: [0.2, 1.07, 0.27],
  [LM.R_ELBOW]: [-0.16, 1.03, 0.3],
  [LM.L_WRIST]: [0.07, 0.8, 0.24],
  [LM.R_WRIST]: [0.02, 0.72, 0.25],
  [LM.L_HIP]: [0.13, 0.92, -0.02],
  [LM.R_HIP]: [-0.13, 0.92, -0.02],
  [LM.L_KNEE]: [0.22, 0.5, 0.1],
  [LM.R_KNEE]: [-0.22, 0.5, 0.1],
  [LM.L_ANKLE]: [0.21, 0.08, 0],
  [LM.R_ANKLE]: [-0.21, 0.08, 0],
  [LM.L_HEEL]: [0.21, 0.03, -0.06],
  [LM.R_HEEL]: [-0.21, 0.03, -0.06],
  [LM.L_TOE]: [0.23, 0.02, 0.17],
  [LM.R_TOE]: [-0.21, 0.02, 0.17],
};

const SWAP: [number, number][] = [
  [LM.L_EAR, LM.R_EAR],
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_ELBOW, LM.R_ELBOW],
  [LM.L_WRIST, LM.R_WRIST],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_KNEE, LM.R_KNEE],
  [LM.L_ANKLE, LM.R_ANKLE],
  [LM.L_HEEL, LM.R_HEEL],
  [LM.L_TOE, LM.R_TOE],
];

function blank(): Vec3[] {
  return Array.from({ length: LANDMARK_COUNT }, () => [0, 0, 0] as Vec3);
}

/** Turns a right-handed pose into the same pose for a left-hander: mirror it and swap left and right. */
export function mirrorPose(pose: Vec3[]): Vec3[] {
  const mirrored = blank();
  for (let i = 0; i < LANDMARK_COUNT; i++) mirrored[i] = [pose[i][0], pose[i][1], -pose[i][2]];
  for (const [l, r] of SWAP) {
    const t = mirrored[l];
    mirrored[l] = mirrored[r];
    mirrored[r] = t;
  }
  return mirrored;
}

/** The model stance for a right- or left-handed batter, as 33 points in figure space. */
export function idealStance(hand: Hand): Vec3[] {
  const pose = blank();
  for (const [k, v] of Object.entries(RIGHT_HANDED)) pose[Number(k)] = [...(v as Vec3)] as Vec3;
  return hand === 'right' ? pose : mirrorPose(pose);
}

/**
 * How far the batter has got into the stance, one number from 0 to 1 for each part.
 * All zeros is standing upright with the arms down; all ones is the model stance.
 */
export type StanceProgress = { feet: number; knees: number; lean: number; head: number; hands: number };
export const STANDING: StanceProgress = { feet: 0, knees: 0, lean: 0, head: 0, hands: 0 };
export const IN_STANCE: StanceProgress = { feet: 1, knees: 1, lean: 1, head: 1, hands: 1 };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/**
 * Builds a pose part-way into the stance, for the animated demonstration.
 * Each part moves on its own, so the demonstration can show one thing at a time:
 * feet apart, then knees bent, then the lean from the hips, then the head, then the hands.
 */
export function buildStance(hand: Hand, p: StanceProgress): Vec3[] {
  const model = RIGHT_HANDED as Record<number, Vec3>;
  const pose = blank();

  // Feet and legs. The left side leads for a right-hander (positive X is towards the bowler).
  const ankleX = mix(0.09, 0.21, p.feet);
  const kneeX = mix(0.095, 0.22, p.feet);
  const kneeY = mix(0.52, 0.5, p.knees);
  const kneeZ = mix(0, 0.1, p.knees);
  const hipX = mix(0.11, 0.13, p.feet);
  const hipY = mix(0.96, 0.92, p.knees);
  const hipZ = mix(0, -0.02, p.knees);
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    pose[LM[`${side}_ANKLE`]] = [sign * ankleX, 0.08, 0];
    pose[LM[`${side}_HEEL`]] = [sign * ankleX, 0.03, -0.06];
    pose[LM[`${side}_TOE`]] = [sign * ankleX + (side === 'L' ? 0.02 * p.feet : 0), 0.02, 0.17];
    pose[LM[`${side}_KNEE`]] = [sign * kneeX, kneeY, kneeZ];
    pose[LM[`${side}_HIP`]] = [sign * hipX, hipY, hipZ];
  }

  // Trunk: tips forward from the hips.
  const angle = (25 * Math.PI) / 180 * p.lean;
  const shoulderY = hipY + 0.5 * Math.cos(angle);
  const shoulderZ = hipZ + 0.5 * Math.sin(angle);
  pose[LM.L_SHOULDER] = [0.18, shoulderY, shoulderZ];
  pose[LM.R_SHOULDER] = [-0.18, shoulderY, shoulderZ];

  // Head: turns from looking straight ahead to looking down the pitch at the bowler.
  const lookX = mix(0, 1, p.head);
  const lookZ = mix(1, 0.6, p.head);
  const lookLen = Math.hypot(lookX, lookZ);
  const lx = lookX / lookLen;
  const lz = lookZ / lookLen;
  pose[LM.NOSE] = [lx * 0.1, shoulderY + 0.19, shoulderZ + lz * 0.1];
  // The ears sit either side of the head, across the way it looks.
  pose[LM.L_EAR] = [0.075 * lz, shoulderY + 0.21, shoulderZ - 0.075 * lx];
  pose[LM.R_EAR] = [-0.075 * lz, shoulderY + 0.21, shoulderZ + 0.075 * lx];

  // Arms: hang by the sides, then come together on the bat by the front thigh.
  const shift: Vec3 = [0, shoulderY - model[LM.L_SHOULDER][1], shoulderZ - model[LM.L_SHOULDER][2]];
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    const shoulder = pose[LM[`${side}_SHOULDER`]];
    const hangingElbow: Vec3 = [shoulder[0] + sign * 0.03, shoulder[1] - 0.29, shoulder[2] + 0.02];
    const hangingWrist: Vec3 = [shoulder[0] + sign * 0.04, shoulder[1] - 0.55, shoulder[2] + 0.06];
    const e = model[LM[`${side}_ELBOW`]];
    const w = model[LM[`${side}_WRIST`]];
    pose[LM[`${side}_ELBOW`]] = mix3(hangingElbow, [e[0] + shift[0], e[1] + shift[1], e[2] + shift[2]], p.hands);
    pose[LM[`${side}_WRIST`]] = mix3(hangingWrist, [w[0] + shift[0], w[1] + shift[1], w[2] + shift[2]], p.hands);
  }

  return hand === 'right' ? pose : mirrorPose(pose);
}

/**
 * The model forward defence for a right-handed batter, held at the end of the shot:
 * a long step with the front (left) foot, front knee bent, head over it, back leg nearly
 * straight, bat angled down beside the front pad with the front elbow high.
 */
const DEFENCE_RIGHT: Partial<Record<number, Vec3>> = {
  [LM.NOSE]: [0.66, 1.4, 0.24],
  // The head is down, watching the ball by the front pad: the nose is below and ahead of the ears.
  [LM.L_EAR]: [0.6, 1.445, 0.17],
  [LM.R_EAR]: [0.6, 1.445, 0.3],
  [LM.L_SHOULDER]: [0.62, 1.24, 0.14],
  [LM.R_SHOULDER]: [0.27, 1.27, 0.1],
  [LM.L_ELBOW]: [0.74, 1.04, 0.3],
  [LM.R_ELBOW]: [0.46, 0.98, 0.3],
  [LM.L_WRIST]: [0.74, 0.8, 0.26],
  [LM.R_WRIST]: [0.7, 0.73, 0.27],
  [LM.L_HIP]: [0.3, 0.83, 0.02],
  [LM.R_HIP]: [0.05, 0.83, -0.02],
  [LM.L_KNEE]: [0.68, 0.47, 0.1],
  [LM.R_KNEE]: [-0.07, 0.46, 0.0],
  [LM.L_ANKLE]: [0.64, 0.08, 0.04],
  [LM.R_ANKLE]: [-0.21, 0.08, 0],
  [LM.L_HEEL]: [0.6, 0.03, -0.03],
  [LM.R_HEEL]: [-0.25, 0.07, -0.04],
  [LM.L_TOE]: [0.78, 0.02, 0.14],
  [LM.R_TOE]: [-0.18, 0.02, 0.16],
};

/** The model forward defence for a right- or left-handed batter. */
export function idealDefence(hand: Hand): Vec3[] {
  const pose = blank();
  for (const [k, v] of Object.entries(DEFENCE_RIGHT)) pose[Number(k)] = [...(v as Vec3)] as Vec3;
  return hand === 'right' ? pose : mirrorPose(pose);
}

/** Where the bat sits in the forward defence: angled down beside the front pad, handle ahead of the toe. */
export function defenceBat(hand: Hand): { top: Vec3; toe: Vec3 } {
  const z = hand === 'right' ? 1 : -1;
  return { top: [0.75, 0.84, 0.27 * z], toe: [0.6, 0.04, 0.28 * z] };
}

/**
 * How far into the forward defence the batter has moved, one number from 0 (the stance) to 1
 * (the held shot) for each part, so the demonstration can show one movement at a time.
 */
export type DefenceProgress = { step: number; knee: number; head: number; bat: number };
export const AT_STANCE: DefenceProgress = { step: 0, knee: 0, head: 0, bat: 0 };
export const IN_DEFENCE: DefenceProgress = { step: 1, knee: 1, head: 1, bat: 1 };

/** Builds a pose part-way from the stance to the forward defence. */
export function buildDefence(hand: Hand, p: DefenceProgress): Vec3[] {
  const from = idealStance('right');
  const to = idealDefence('right');
  const group = (i: number): number => {
    if (([LM.L_ANKLE, LM.L_HEEL, LM.L_TOE] as number[]).includes(i)) return p.step;
    if (([LM.L_KNEE, LM.R_KNEE, LM.L_HIP, LM.R_HIP, LM.R_ANKLE, LM.R_HEEL, LM.R_TOE] as number[]).includes(i)) return Math.min(p.step, p.knee) * 0.5 + p.knee * 0.5;
    if (([LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER] as number[]).includes(i)) return p.head;
    if (([LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST] as number[]).includes(i)) return p.bat;
    return 0;
  };
  const pose = blank();
  for (let i = 0; i < LANDMARK_COUNT; i++) pose[i] = mix3(from[i], to[i], group(i));
  return hand === 'right' ? pose : mirrorPose(pose);
}

/** The bat part-way from the stance to the forward defence. */
export function batBetween(hand: Hand, t: number): { top: Vec3; toe: Vec3 } {
  const a = idealBat(hand);
  const b = defenceBat(hand);
  return { top: mix3(a.top, b.top, t), toe: mix3(a.toe, b.toe, t) };
}

/**
 * The model front-foot drive for a right-handed batter, held at the finish: the same step and
 * front knee as the forward defence, hands high over the front shoulder, front elbow up.
 */
const DRIVE_RIGHT: Partial<Record<number, Vec3>> = {
  ...DEFENCE_RIGHT,
  [LM.NOSE]: [0.64, 1.42, 0.22],
  [LM.L_SHOULDER]: [0.58, 1.26, 0.1],
  [LM.R_SHOULDER]: [0.26, 1.28, 0.16],
  [LM.L_ELBOW]: [0.74, 1.4, 0.16],
  [LM.R_ELBOW]: [0.42, 1.36, 0.3],
  [LM.L_WRIST]: [0.56, 1.58, 0.08],
  [LM.R_WRIST]: [0.52, 1.52, 0.14],
  [LM.R_HEEL]: [-0.26, 0.14, -0.04],
};

/** The model front-foot drive for a right- or left-handed batter. */
export function idealDrive(hand: Hand): Vec3[] {
  const pose = blank();
  for (const [k, v] of Object.entries(DRIVE_RIGHT)) pose[Number(k)] = [...(v as Vec3)] as Vec3;
  return hand === 'right' ? pose : mirrorPose(pose);
}

/** Where the bat sits at the finish of the drive: up over the front shoulder. */
export function driveBat(hand: Hand): { top: Vec3; toe: Vec3 } {
  const z = hand === 'right' ? 1 : -1;
  return { top: [0.55, 1.5, 0.1 * z], toe: [0.05, 2.05, -0.35 * z] };
}

/**
 * How far into the drive the batter has moved, from 0 (the stance) to 1 (the held finish).
 * The swing goes from the stance (0) through the bat meeting the ball by the front pad (0.5)
 * to the high finish (1).
 */
export type DriveProgress = { step: number; knee: number; head: number; swing: number };
export const DRIVE_START: DriveProgress = { step: 0, knee: 0, head: 0, swing: 0 };
export const IN_DRIVE: DriveProgress = { step: 1, knee: 1, head: 1, swing: 1 };

/** Builds a pose part-way from the stance to the finish of the drive. */
export function buildDrive(hand: Hand, p: DriveProgress): Vec3[] {
  // Legs, head and trunk move exactly as in the forward defence.
  const lower = buildDefence('right', { step: p.step, knee: p.knee, head: p.head, bat: Math.min(1, p.swing * 2) });
  if (p.swing > 0.5) {
    const finish = idealDrive('right');
    const t = (p.swing - 0.5) * 2;
    for (const i of [LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST, LM.NOSE, LM.L_SHOULDER, LM.R_SHOULDER, LM.R_HEEL]) lower[i] = mix3(lower[i], finish[i], t);
  }
  return hand === 'right' ? lower : mirrorPose(lower);
}

/** The bat during the drive: from the stance, past the front pad, up to the finish. */
export function driveBatAt(hand: Hand, swing: number): { top: Vec3; toe: Vec3 } {
  if (swing <= 0.5) return batBetween(hand, swing * 2);
  const a = defenceBat(hand);
  const b = driveBat(hand);
  const t = (swing - 0.5) * 2;
  return { top: mix3(a.top, b.top, t), toe: mix3(a.toe, b.toe, t) };
}

/** Where the bat sits in the model stance: from the top of the handle to the toe of the bat. */
export function idealBat(hand: Hand): { top: Vec3; toe: Vec3 } {
  const z = hand === 'right' ? 1 : -1;
  return { top: [0.07, 0.86, 0.243 * z], toe: [-0.16, 0.0, 0.26 * z] };
}

/** The side of the pitch the figure should be viewed from by default (the off side). */
export function defaultYaw(hand: Hand): number {
  return hand === 'right' ? 0 : Math.PI;
}

/**
 * Converts MediaPipe world landmarks (flat array, y down, origin at the hips) into figure space,
 * turned so that the batter's front foot points towards the bowler, like the model stance.
 */
export function worldToFigure(world: number[], hand: Hand): Vec3[] {
  const s = sides(hand);
  const fx = world[s.frontAnkle * 3];
  const bx = world[s.backAnkle * 3];
  const turn = fx - bx >= 0 ? 1 : -1;
  let lowest = -Infinity;
  for (const i of [LM.L_ANKLE, LM.R_ANKLE, LM.L_HEEL, LM.R_HEEL, LM.L_TOE, LM.R_TOE]) {
    lowest = Math.max(lowest, world[i * 3 + 1]);
  }
  const pose = blank();
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    pose[i] = [turn * world[i * 3], lowest - world[i * 3 + 1] + 0.02, -turn * world[i * 3 + 2]];
  }
  return pose;
}

/**
 * Converts a figure-space pose into MediaPipe-style world landmarks, as a camera on the
 * batter's off side would see it. Used to test the analyser against the model stance.
 */
export function figureToWorld(pose: Vec3[], hand: Hand): number[] {
  const turn = hand === 'right' ? 1 : -1;
  const hx = (pose[LM.L_HIP][0] + pose[LM.R_HIP][0]) / 2;
  const hy = (pose[LM.L_HIP][1] + pose[LM.R_HIP][1]) / 2;
  const hz = (pose[LM.L_HIP][2] + pose[LM.R_HIP][2]) / 2;
  const out: number[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out.push(turn * (pose[i][0] - hx), -(pose[i][1] - hy), -turn * (pose[i][2] - hz));
  }
  return out;
}
