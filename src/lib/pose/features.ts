import type { Hand } from './landmarks';

/**
 * Feature extraction for the trained position classifier.
 *
 * THIS FILE HAS A TWIN: training/features.py. The model is trained in Google Colab on features
 * computed by the Python version, and judged in the app on features computed by this one, so the
 * two must give the same numbers for the same frame. If you change one, change the other in the
 * same way, train again, and run `npm run test:model` (it compares the two on frames saved by the
 * notebook inside the model file).
 *
 * The features describe the body in a "batter frame" that does not depend on where the phone is,
 * on how far away the learner stands, on body size, or on batting hand:
 *  - left and right landmarks are swapped for a left-hander, so the "L" slots are always the
 *    front side of the body (the side nearer the bowler);
 *  - the origin is the middle of the hips and every length is divided by the trunk length;
 *  - the body is turned about the vertical so that +x points towards the bowler (from the back
 *    shoulder and hip to the front ones), and a left-hander is mirrored so the chest faces the
 *    same way as a right-hander's.
 *
 * Output: 99 normalised coordinates (33 landmarks x 3), 32 body measures (angles, distances and
 * heights) and 7 picture measures: 138 numbers, in the order of FEATURE_NAMES.
 */

export const FEATURE_VERSION = 1;

const PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

/** For each slot, the MediaPipe landmark it is read from. */
function slotMap(hand: Hand): number[] {
  const map = Array.from({ length: 33 }, (_, i) => i);
  if (hand === 'left') for (const [a, b] of PAIRS) { map[a] = b; map[b] = a; }
  return map;
}

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V) => Math.sqrt(dot(a, a));
const DEG = 180 / Math.PI;

function angleBetween(a: V, b: V): number {
  const d = norm(a) * norm(b);
  if (d < 1e-9) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / d))) * DEG;
}
const jointAngle = (a: V, b: V, c: V) => angleBetween(sub(a, b), sub(c, b));

const NOSE = 0, L_EAR = 7, R_EAR = 8, L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16, L_IDX = 19, R_IDX = 20;
const L_HIP = 23, R_HIP = 24, L_KN = 25, R_KN = 26, L_AN = 27, R_AN = 28, L_HEEL = 29, R_HEEL = 30, L_TOE = 31, R_TOE = 32;

const COORD_NAMES: string[] = [];
for (let i = 0; i < 33; i++) for (const a of ['x', 'y', 'z']) COORD_NAMES.push(`c${i}_${a}`);

const BODY_NAMES = [
  'front_knee', 'back_knee', 'front_hip', 'back_hip', 'front_elbow', 'back_elbow', 'front_armpit', 'back_armpit',
  'trunk_lean', 'trunk_lean_fwd', 'shoulder_tilt', 'feet_dist', 'feet_along', 'feet_across', 'knee_dist', 'hip_height',
  'hands_height', 'hands_fwd', 'hands_out', 'hands_gap', 'hands_to_front_knee', 'head_height', 'head_fwd', 'head_over_front_foot',
  'neck', 'look', 'front_elbow_over_wrist', 'front_elbow_over_shoulder', 'shoulder_width', 'hip_width', 'front_toe_dir', 'back_toe_dir',
];
const PICTURE_NAMES = ['pic_hands_in', 'pic_front_ankle_drop', 'pic_feet_x', 'pic_shoulder_spread', 'pic_hip_spread', 'pic_hands_y', 'pic_nose_x'];

export const FEATURE_NAMES: string[] = [...COORD_NAMES, ...BODY_NAMES, ...PICTURE_NAMES];
export const FEATURE_COUNT = FEATURE_NAMES.length; // 138

/**
 * Features of one frame.
 * @param world  World landmarks, flat x, y, z for 33 points (metres, y down), as MediaPipe gives them.
 * @param lm     Image landmarks, flat x, y, z, visibility for 33 points (0..1).
 * @param hand   Batting hand.
 * @param aspect Picture width / height (0.75 when not known).
 */
export function extractFeatures(world: number[], lm: number[], hand: Hand, aspect?: number | null): number[] {
  const map = slotMap(hand);
  const raw = (i: number): V => {
    const j = map[i];
    return [world[j * 3], world[j * 3 + 1], world[j * 3 + 2]];
  };

  // ---- batter frame
  const origin = mid(raw(L_HIP), raw(R_HIP));
  const across = [
    raw(L_SH)[0] - raw(R_SH)[0] + raw(L_HIP)[0] - raw(R_HIP)[0],
    raw(L_SH)[2] - raw(R_SH)[2] + raw(L_HIP)[2] - raw(R_HIP)[2],
  ];
  let ax = across[0];
  let az = across[1];
  const al = Math.hypot(ax, az);
  if (al < 1e-9) { ax = 1; az = 0; } else { ax /= al; az /= al; }
  const trunk = Math.max(norm(sub(mid(raw(L_SH), raw(R_SH)), origin)), 0.1);
  const mirror = hand === 'left' ? -1 : 1;
  const C: V[] = [];
  for (let i = 0; i < 33; i++) {
    const v = sub(raw(i), origin);
    const x = v[0] * ax + v[2] * az;
    const z = -v[0] * az + v[2] * ax;
    C.push([x / trunk, v[1] / trunk, (mirror * z) / trunk]);
  }

  const out: number[] = [];
  for (let i = 0; i < 33; i++) out.push(C[i][0], C[i][1], C[i][2]);

  // ---- body measures (front side = L slots; lengths in trunk lengths; y down)
  const shMid = mid(C[L_SH], C[R_SH]);
  const hipMid = mid(C[L_HIP], C[R_HIP]);
  const ankMid = mid(C[L_AN], C[R_AN]);
  const wrMid = mid(C[L_WR], C[R_WR]);
  const trunkV = sub(shMid, hipMid);
  const sh = sub(C[L_SH], C[R_SH]);
  const head = sub(C[NOSE], mid(C[L_EAR], C[R_EAR]));
  const headFlat = Math.hypot(head[0], head[2]);
  const toeDir = (heel: number, toe: number) => {
    const d = sub(C[toe], C[heel]);
    return Math.hypot(d[0], d[2]) < 1e-9 ? 90 : Math.atan2(Math.abs(d[2]), d[0]) * DEG;
  };
  out.push(
    jointAngle(C[L_HIP], C[L_KN], C[L_AN]),
    jointAngle(C[R_HIP], C[R_KN], C[R_AN]),
    jointAngle(C[L_SH], C[L_HIP], C[L_KN]),
    jointAngle(C[R_SH], C[R_HIP], C[R_KN]),
    jointAngle(C[L_SH], C[L_EL], C[L_WR]),
    jointAngle(C[R_SH], C[R_EL], C[R_WR]),
    jointAngle(C[L_HIP], C[L_SH], C[L_EL]),
    jointAngle(C[R_HIP], C[R_SH], C[R_EL]),
    angleBetween(trunkV, [0, -1, 0]),
    Math.atan2(trunkV[0], -trunkV[1]) * DEG,
    Math.atan2(Math.abs(sh[1]), Math.hypot(sh[0], sh[2])) * DEG,
    norm(sub(C[L_AN], C[R_AN])),
    C[L_AN][0] - C[R_AN][0],
    C[L_AN][2] - C[R_AN][2],
    norm(sub(C[L_KN], C[R_KN])),
    ankMid[1] - hipMid[1],
    hipMid[1] - wrMid[1],
    wrMid[0] - hipMid[0],
    wrMid[2] - hipMid[2],
    norm(sub(C[L_WR], C[R_WR])),
    Math.hypot(wrMid[0] - C[L_KN][0], wrMid[2] - C[L_KN][2]),
    hipMid[1] - C[NOSE][1],
    C[NOSE][0] - ankMid[0],
    C[NOSE][0] - C[L_AN][0],
    headFlat + Math.abs(head[1]) < 1e-9 ? 0 : Math.atan2(-head[1], headFlat) * DEG,
    headFlat < 1e-9 ? 90 : Math.atan2(Math.abs(head[2]), head[0]) * DEG,
    C[L_WR][1] - C[L_EL][1],
    C[L_SH][1] - C[L_EL][1],
    norm(sh),
    norm(sub(C[L_HIP], C[R_HIP])),
    toeDir(L_HEEL, L_TOE),
    toeDir(R_HEEL, R_TOE),
  );

  // ---- picture measures (x scaled by the aspect ratio; turned so the bowler is to the right)
  const ar = aspect && aspect > 0 ? aspect : 0.75;
  const q = (i: number): [number, number] => {
    const j = map[i];
    return [lm[j * 4] * ar, lm[j * 4 + 1]];
  };
  const dirX = q(L_SH)[0] + q(L_HIP)[0] - q(R_SH)[0] - q(R_HIP)[0];
  const sgn = dirX < 0 ? -1 : 1;
  const m2 = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const d2 = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const pSh = m2(q(L_SH), q(R_SH));
  const pHip = m2(q(L_HIP), q(R_HIP));
  const pAnk = m2(q(L_AN), q(R_AN));
  const pWr = m2(q(L_WR), q(R_WR));
  const tp = Math.max(d2(pSh, pHip), 0.01);
  const handX = (q(L_WR)[0] + q(R_WR)[0] + q(L_IDX)[0] + q(R_IDX)[0]) / 4;
  out.push(
    Math.min(Math.abs(handX - pHip[0]), Math.abs(handX - pSh[0])) / tp,
    (q(L_AN)[1] - q(R_AN)[1]) / tp,
    (sgn * (q(L_AN)[0] - q(R_AN)[0])) / tp,
    d2(q(L_SH), q(R_SH)) / tp,
    d2(q(L_HIP), q(R_HIP)) / tp,
    (pWr[1] - pHip[1]) / tp,
    (sgn * (q(NOSE)[0] - pAnk[0])) / tp,
  );
  return out;
}
