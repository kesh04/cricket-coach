import type { BatSeen } from './batDetect';

// MediaPipe Pose (BlazePose) landmark indices. 33 landmarks per frame.
export const LM = {
  NOSE: 0,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_INDEX: 19,
  R_INDEX: 20,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_TOE: 31,
  R_TOE: 32,
} as const;

export const LANDMARK_COUNT = 33;

export type Vec3 = [number, number, number];
export type Hand = 'right' | 'left';

/** One frame from the pose camera. */
export type PoseFrame = {
  /** Timestamp in milliseconds. */
  t: number;
  /** Image landmarks, flat: x, y, z, visibility for each of the 33 points (x and y are 0..1). */
  lm: number[];
  /** World landmarks in metres, flat: x, y, z for each point. Origin is the middle of the hips, y points down. */
  world: number[];
  /** The bat, when the camera page found it in the picture. */
  bat?: BatSeen | null;
  /** Width of the picture divided by its height, so distances in the picture can be compared. */
  aspect?: number | null;
};

/** Bones drawn for the skeleton and the 3D figure. */
export const BONES: [number, number][] = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
  [LM.L_ANKLE, LM.L_TOE],
  [LM.R_ANKLE, LM.R_TOE],
];

/** A right-handed batter leads with the left side of the body; a left-hander with the right. */
export function sides(hand: Hand) {
  const leftLeads = hand === 'right';
  return {
    frontShoulder: leftLeads ? LM.L_SHOULDER : LM.R_SHOULDER,
    backShoulder: leftLeads ? LM.R_SHOULDER : LM.L_SHOULDER,
    frontHip: leftLeads ? LM.L_HIP : LM.R_HIP,
    backHip: leftLeads ? LM.R_HIP : LM.L_HIP,
    frontKnee: leftLeads ? LM.L_KNEE : LM.R_KNEE,
    backKnee: leftLeads ? LM.R_KNEE : LM.L_KNEE,
    frontAnkle: leftLeads ? LM.L_ANKLE : LM.R_ANKLE,
    backAnkle: leftLeads ? LM.R_ANKLE : LM.L_ANKLE,
  };
}

export function worldPoint(world: number[], i: number): Vec3 {
  return [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]];
}

export function visibility(lm: number[], i: number): number {
  return lm[i * 4 + 3] ?? 0;
}
