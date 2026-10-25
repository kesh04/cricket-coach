import { personalise } from '@/data/curriculum';
import type { Status } from '@/theme';

import { MIN_BAT_CONFIDENCE, type BatSeen } from './batDetect';
import {
  BAT_CHECKS,
  BENCHMARK_BY_ID,
  BENCHMARKS,
  BENCHMARKS_BY_SKILL,
  FAIR_SCORE,
  GOOD_SCORE,
  GRIP_BENCHMARKS,
  MIN_VISIBILITY,
  MIN_VISIBILITY_HIDDEN_SIDE,
  REQUIRED_PARTS,
  SHOT_SKILLS,
  type Benchmark,
  type BodyPart,
  type CheckId,
  type Skill,
} from './benchmarks';
import { classifyFrame, predictionFrom, type ModelPrediction, type PositionModel } from './classifier';
import { angleBetween, clamp, dist, jointAngle, len, mid, sub } from './geometry';
import { LM, sides, visibility, worldPoint, type Hand, type PoseFrame, type Vec3 } from './landmarks';
import { modelFor } from './models';

export type CheckResult = {
  id: CheckId;
  label: string;
  /** Measured value, or null when the body part could not be seen. */
  value: number | null;
  /** 0 to 100. */
  score: number;
  status: Status;
  /** Corrective message. Null when the check is good. */
  message: string | null;
  /**
   * True when the check could not be measured but must be seen before the position can count
   * (the bat in the stance). Its status is then 'poor' and its message says what to do.
   */
  required?: boolean;
  /** A tip: shown and spoken, but not part of the score and never stops a repetition counting. */
  advisory?: boolean;
  /** The bat is held (seen from the hands) but its angle could not be seen in the picture. */
  unsure?: boolean;
  /** This fault was found by the trained model (the rule check only explains it). */
  byModel?: boolean;
};

/**
 * Where the phone is.
 *  'front': in front of the batter, where the bowler would be. The batter is side-on to it and
 *           looks straight at it. Feet width and knee bend point towards the phone, so they are
 *           measured less exactly than from the side.
 *  'side':  at the batter's side (the off side), where the chest points. It sees both shoulders,
 *           both hands and both feet, so every check is at its most exact.
 */
export type CameraView = 'front' | 'side';

/** Why the camera cannot judge the learner yet. */
export type CameraProblem = 'side-on' | 'back' | 'chest-on';

export type PoseAnalysis =
  /** A part of the body is out of view. */
  | { state: 'no-body'; missing: BodyPart | null }
  /** The body is in view but the phone is in the wrong place. */
  | { state: 'wrong-angle'; problem: CameraProblem }
  | {
      state: 'ok';
      /** Overall technique score, 0 to 100. */
      score: number;
      checks: CheckResult[];
      /** Checks that need work, worst first. */
      cues: CheckResult[];
      /** Landmarks to mark on the skeleton. */
      highlights: number[];
      /**
       * The trained model's verdict, when the skill has a trained model. It decides whether the
       * position is good; the rule checks then only say what to change.
       */
      model?: ModelPrediction & { classes: string[]; good?: boolean; front?: boolean };
    };
/** Kept for older code: the stance analysis is one kind of pose analysis. */
export type StanceAnalysis = PoseAnalysis;

export type Measures = Partial<Record<CheckId, number>>;


/** True when the body (feet, knees, hips, shoulders, hands) touches the left or right edge. */
export function noRoomSideways(lm: number[]): boolean {
  const joints = [LM.L_ANKLE, LM.R_ANKLE, LM.L_KNEE, LM.R_KNEE, LM.L_HIP, LM.R_HIP, LM.L_SHOULDER, LM.R_SHOULDER, LM.L_WRIST, LM.R_WRIST];
  return joints.some((j) => visibility(lm, j) >= 0.5 && (lm[j * 4] < 0.03 || lm[j * 4] > 0.97));
}

/** A joint is in the picture when it is not on or past an edge (a small margin at the bottom). */
function inFrame(lm: number[], j: number): boolean {
  const x = lm[j * 4];
  const y = lm[j * 4 + 1];
  return x > 0.01 && x < 0.99 && y > 0.01 && y < 0.965;
}

export function missingPart(lm: number[], skill: Skill, view: CameraView = 'side'): BodyPart | null {
  for (const { part, joints } of REQUIRED_PARTS[skill]) {
    // Phone in front: the hands are behind the bat and the body, and the pose model loses them
    // (field test, 12 October 2026: "I cannot see your hands" while the batter was in position).
    // The other checks do not need them, so they are not required there.
    if (part === 'hands' && view === 'front' && skill !== 'grip') continue;
    // The model guesses where feet and knees are even when they are below the bottom of the
    // picture (field test, 12 October 2026: standing close to the phone, the feet were cut off,
    // yet every leg check was judged on guesses). A joint on or past the edge does not count as seen.
    const seen = joints.map((j) => ((part === 'feet' || part === 'knees') && !inFrame(lm, j) ? 0 : visibility(lm, j)));
    const best = Math.max(...seen);
    const worst = Math.min(...seen);
    // The head counts as seen when the nose or either ear is seen: from the side, with the face
    // turned to the bowler, the phone sees one ear and the side of the face, not the nose.
    if (part === 'head') {
      if (best < MIN_VISIBILITY) return part;
      continue;
    }
    // One hand clearly seen is enough: the other is often hidden behind the bat or the body.
    if (part === 'hands' && skill !== 'grip') {
      if (best < MIN_VISIBILITY) return part;
      continue;
    }
    if (best < MIN_VISIBILITY || worst < MIN_VISIBILITY_HIDDEN_SIDE) return part;
  }
  return null;
}

/** True when enough of the body is in view to judge the stance. */
export function bodyVisible(lm: number[], skill: Skill = 'stance'): boolean {
  return missingPart(lm, skill) === null;
}

/**
 * Works out whether the phone is in a place the stance can be judged from.
 * The phone should be on the batter's off side, looking at the chest. From the bowler's end
 * the body is side-on and half of it is hidden; from the leg side the back hides the hands.
 */
/**
 * The body counts as side-on to the phone when the line across the shoulders and hips points
 * this many times further towards the phone than across the picture (2.2 is about 65 degrees).
 * It is set high on purpose: the depth of a landmark is the least exact thing the pose model
 * gives, and an open or closed stance must not be mistaken for a phone in the wrong place.
 */
export const SIDE_ON_RATIO = 2.2;

/**
 * From the bowler's end (the front view) the batter should be side-on. A body whose chest faces
 * the phone (the line across the shoulders and hips points less than this many times further
 * towards the phone than across the picture) has turned to face the phone.
 */
export const CHEST_ON_RATIO = 0.7;

export function cameraProblem(world: number[], view: CameraView = 'side'): CameraProblem | null {
  const p = (i: number) => worldPoint(world, i);
  // Line across the body from the right side to the left, averaged over shoulders and hips.
  const sh = sub(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const hip = sub(p(LM.L_HIP), p(LM.R_HIP));
  const across = sh[0] + hip[0];
  const depth = sh[2] + hip[2];
  if (view === 'front') {
    // The phone is where the bowler would be: a side-on body is what we want to see.
    return Math.abs(depth) < CHEST_ON_RATIO * Math.abs(across) ? 'chest-on' : null;
  }
  if (Math.abs(depth) > SIDE_ON_RATIO * Math.abs(across)) return 'side-on';
  // Facing the camera, the learner's left side is on the right of the picture.
  if (across < 0) return 'back';
  return null;
}

/**
 * Feature extraction for the stance: turns world landmarks into six measures.
 * World landmarks are in metres with y pointing down.
 */
export function measureStance(world: number[], hand: Hand, lm?: number[], view: CameraView = detectView(world), aspect?: number | null): Measures {
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);

  const shL = p(LM.L_SHOULDER);
  const shR = p(LM.R_SHOULDER);
  const hipL = p(LM.L_HIP);
  const hipR = p(LM.R_HIP);
  const kneeL = p(LM.L_KNEE);
  const kneeR = p(LM.R_KNEE);
  const ankL = p(LM.L_ANKLE);
  const ankR = p(LM.R_ANKLE);
  const nose = p(LM.NOSE);

  const shoulderMid = mid(shL, shR);
  const hipMid = mid(hipL, hipR);
  const kneeMid = mid(kneeL, kneeR);
  const ankleMid = mid(ankL, ankR);
  const shoulderWidth = bodyWidth(world);

  const m: Measures = {};

  // Feet: distance between the ankles as a multiple of shoulder width.
  m.feet = dist(ankL, ankR) / shoulderWidth;

  // Feet in line: neither foot ahead of the other, toes pointing the same way, to the side.
  const line = feetInLine(world, hand, lm);
  if (line !== undefined) m.feetLine = line;

  // Knees: average knee angle. 180 degrees is a straight leg.
  m.knees = (jointAngle(hipL, kneeL, ankL) + jointAngle(hipR, kneeR, ankR)) / 2;

  // Lean: angle of the trunk away from vertical.
  const up: Vec3 = [0, -1, 0];
  m.lean = angleBetween(sub(shoulderMid, hipMid), up);

  // Shoulders: tilt of the shoulder line away from horizontal.
  const sh = sub(shL, shR);
  m.shoulders = Math.atan2(Math.abs(sh[1]), Math.sqrt(sh[0] * sh[0] + sh[2] * sh[2])) * (180 / Math.PI);

  // Head: where the head sits along the line of the feet.
  // 0 is midway between the feet, +1 is one stance-width towards the bowler.
  void nose;
  void ankleMid;
  const head = headAlongFeet(world, hand, lm, view);
  if (head !== undefined) m.head = head;

  const look = lookAngle(world, hand, view);
  if (look !== undefined) m.look = look;

  const neck = neckAngle(world, lm);
  if (neck !== undefined) m.neck = neck;

  // Hands: height of the higher hand between the hips (0) and the knees (1); negative is above
  // the hips. Field test (October 2026): the middle of the two hands was used, so a learner
  // standing with the bat on one shoulder and the other hand by the hip looked "nearly right".
  // In the stance both hands are low on the handle, so the higher hand is what is judged. Only
  // a hand that is clearly seen counts (a hidden hand is a guess).
  const drop = kneeMid[1] - hipMid[1];
  // Phone in front: the hands are often behind the body or the bat, and the pose model then
  // guesses where they are with a middling visibility (field test, 19 October 2026: "Lower your
  // hands" and "Your hands and bat are too high" for hands it could not see). From the front only
  // hands seen clearly (visibility 0.65 or more) are judged.
  const handVis = view === 'front' ? FRONT_HAND_VIS : 0.5;
  const handsSeen = [LM.L_WRIST, LM.R_WRIST].filter((j) => !lm || visibility(lm, j) >= handVis);
  if (handsSeen.length && Math.abs(drop) > 0.05) {
    const top = Math.min(...handsSeen.map((j) => p(j)[1])); // y points down
    m.hands = (top - hipMid[1]) / drop;
  }

  const handsIn = handsFromBody(lm, aspect, view === 'front' ? FRONT_HAND_VIS : 0.3);
  if (handsIn !== undefined) m.handsIn = handsIn;

  return m;
}

/**
 * Hands in: how far the hands are, across the picture, from the middle of the hips or of the
 * shoulders (whichever is nearer), in trunk lengths (shoulders to hips, also in the picture). In the stance the hands rest close
 * to the body, near the front thigh, so this is small (about 0.1 to 0.35). Hands pushed out in
 * front, often with the bat held up, read 0.6 or more. Measured in the picture because sideways
 * distances there are exact, while depth is the least exact thing the pose model gives.
 * Undefined when the hands or the trunk are not seen well enough.
 */
export const FRONT_HAND_VIS = 0.65;

export function handsFromBody(lm: number[] | undefined, aspect?: number | null, minVis = 0.3): number | undefined {
  if (!lm) return undefined;
  const ar = aspect && aspect > 0 ? aspect : 0.75;
  const seen = (j: number) => visibility(lm, j) >= minVis;
  if (![LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP].every((j) => visibility(lm, j) >= 0.5)) return undefined;
  const hands = [LM.L_WRIST, LM.R_WRIST, LM.L_INDEX, LM.R_INDEX].filter(seen);
  if (hands.length < 2) return undefined;
  const x = (j: number) => lm[j * 4] * ar;
  const y = (j: number) => lm[j * 4 + 1];
  const hipX = (x(LM.L_HIP) + x(LM.R_HIP)) / 2;
  const trunk = Math.hypot((x(LM.L_SHOULDER) + x(LM.R_SHOULDER)) / 2 - hipX, (y(LM.L_SHOULDER) + y(LM.R_SHOULDER)) / 2 - (y(LM.L_HIP) + y(LM.R_HIP)) / 2);
  if (trunk < 0.03) return undefined;
  const handX = hands.reduce((t, j) => t + x(j), 0) / hands.length;
  // Field test (12 October 2026): a good stance leaning forward has the arms hanging down from the
  // shoulders, so the hands are under the shoulders but ahead of the hips. Hands pushed out (bat
  // up in the air) are far from both. The smaller distance is used.
  const shX = (x(LM.L_SHOULDER) + x(LM.R_SHOULDER)) / 2;
  return Math.min(Math.abs(handX - hipX), Math.abs(handX - shX)) / trunk;
}

/**
 * True when the picture shows the chest facing the phone: both shoulders and both hips spread
 * wide across the picture. With the phone in front (where the bowler would be) a batter should
 * be side-on, so the shoulders and hips nearly overlap. Field test (October 2026): side-on read
 * about 0.3, learners half turned or facing the phone 0.45 to 0.5 (shoulder and hip width,
 * averaged, in trunk lengths). The model stance turned up to 30 degrees towards the phone reads
 * 0.32 or less. Measured in the picture because the depth of the 3D landmarks is too rough for this.
 */
export const CHEST_ON_SPREAD = 0.38;

/**
 * Toes to the side, judged in the picture with the phone in front (where the bowler would be).
 * For each foot whose heel and toe are seen: its angle from level across the picture, in degrees.
 * A foot pointing to the side lies across the picture (near 0); a foot turned towards the phone
 * runs down the picture and looks short. A foot shorter than 0.15 trunk lengths is pointing
 * straight at the phone and reads 90. The larger of the two feet is returned, or undefined when
 * no foot is seen well enough.
 */
export function toesInPicture(lm: number[] | undefined, aspect?: number | null): number | undefined {
  if (!lm) return undefined;
  if (![LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP].every((j) => visibility(lm, j) >= 0.5)) return undefined;
  const ar = aspect && aspect > 0 ? aspect : 0.75;
  const pt = (j: number): [number, number] => [lm[j * 4] * ar, lm[j * 4 + 1]];
  const sh = pt(LM.L_SHOULDER).map((v, i) => (v + pt(LM.R_SHOULDER)[i]) / 2);
  const hip = pt(LM.L_HIP).map((v, i) => (v + pt(LM.R_HIP)[i]) / 2);
  const trunk = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]);
  if (trunk < 0.03) return undefined;
  let worst: number | undefined;
  for (const [heel, toe] of [[LM.L_HEEL, LM.L_TOE], [LM.R_HEEL, LM.R_TOE]]) {
    if (visibility(lm, heel) < 0.5 || visibility(lm, toe) < 0.5) continue;
    const dx = pt(toe)[0] - pt(heel)[0];
    const dy = pt(toe)[1] - pt(heel)[1];
    const angle = Math.hypot(dx, dy) / trunk < 0.15 ? 90 : (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    worst = worst === undefined ? angle : Math.max(worst, angle);
  }
  return worst;
}
export function chestOnInPicture(lm: number[] | undefined, aspect?: number | null): boolean {
  if (!lm) return false;
  if (![LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP].every((j) => visibility(lm, j) >= 0.6)) return false;
  const ar = aspect && aspect > 0 ? aspect : 0.75;
  const pt = (j: number): [number, number] => [lm[j * 4] * ar, lm[j * 4 + 1]];
  const d = (a: number, b: number) => Math.hypot(pt(a)[0] - pt(b)[0], pt(a)[1] - pt(b)[1]);
  const sh = pt(LM.L_SHOULDER).map((v, i) => (v + pt(LM.R_SHOULDER)[i]) / 2);
  const hip = pt(LM.L_HIP).map((v, i) => (v + pt(LM.R_HIP)[i]) / 2);
  const trunk = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]);
  if (trunk < 0.03) return false;
  return (d(LM.L_SHOULDER, LM.R_SHOULDER) + d(LM.L_HIP, LM.R_HIP)) / 2 / trunk > CHEST_ON_SPREAD;
}

/**
 * Neck: how far the head is tipped up (positive) or down (negative), in degrees, along the line
 * from the middle of the ears to the nose. With the eyes level the nose is a little below the ears.
 */
export function neckAngle(world: number[], lm?: number[]): number | undefined {
  if (lm && (visibility(lm, LM.NOSE) < 0.5 || Math.max(visibility(lm, LM.L_EAR), visibility(lm, LM.R_EAR)) < 0.5)) return undefined;
  const p = (i: number) => worldPoint(world, i);
  const v = sub(p(LM.NOSE), mid(p(LM.L_EAR), p(LM.R_EAR)));
  const flat = Math.hypot(v[0], v[2]);
  if (flat + Math.abs(v[1]) < 0.03) return undefined;
  return Math.atan2(-v[1], flat) * DEG; // y points down
}

/**
 * Shoulder width used to scale the feet, in metres. The shoulder line is the part of the body most
 * often foreshortened (it points at the phone when the phone is in front, and the depth of a
 * landmark is the least exact thing the pose model gives), which made the feet look too wide or
 * too narrow. It is averaged with a length that does not depend on where the phone is: the legs
 * (hip to knee to ankle), scaled so that the model stance gives the same width.
 */
export const SHOULDER_PER_LEG = 0.41;
export function bodyWidth(world: number[]): number {
  const p = (i: number) => worldPoint(world, i);
  const shoulders = dist(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const leg = (dist(p(LM.L_HIP), p(LM.L_KNEE)) + dist(p(LM.L_KNEE), p(LM.L_ANKLE)) + dist(p(LM.R_HIP), p(LM.R_KNEE)) + dist(p(LM.R_KNEE), p(LM.R_ANKLE))) / 2;
  const fromLegs = SHOULDER_PER_LEG * leg;
  // A shoulder line far shorter or longer than the legs suggest is mostly a measuring error.
  const s = clamp(shoulders, 0.7 * fromLegs, 1.3 * fromLegs);
  return Math.max((s + fromLegs) / 2, 0.15);
}

/**
 * Feet in line. In the stance both feet stand side by side on one line, parallel to the crease,
 * with the toes of both feet pointing to the side. Returns how far the front ankle is ahead of the
 * back ankle in the direction the toes point, as a multiple of shoulder width (positive: the front
 * foot is ahead). If the toes point down the pitch instead of to the side, the value is large too.
 * Undefined when the toes or heels cannot be seen.
 */
export function feetInLine(world: number[], hand: Hand, lm?: number[]): number | undefined {
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);
  if (lm) {
    // The toes and heels are small and often cut off when the phone is close: judge only when
    // all of them are clearly seen.
    for (const j of [LM.L_HEEL, LM.R_HEEL, LM.L_TOE, LM.R_TOE, LM.L_ANKLE, LM.R_ANKLE]) if (visibility(lm, j) < 0.6) return undefined;
  }
  // Direction of the toes, seen from above: heel to toe, both feet together.
  const toeDir: Vec3 = [0, 0, 0];
  for (const [heel, toe] of [[LM.L_HEEL, LM.L_TOE], [LM.R_HEEL, LM.R_TOE]]) {
    const f = sub(p(toe), p(heel));
    const l = Math.hypot(f[0], f[2]);
    if (l < 0.04) continue;
    toeDir[0] += f[0] / l;
    toeDir[2] += f[2] / l;
  }
  const tl = Math.hypot(toeDir[0], toeDir[2]);
  // The two feet point opposite ways: the toes cannot be read.
  if (tl < 0.6) return undefined;
  const front = p(s.frontAnkle);
  const back = p(s.backAnkle);
  const ahead = ((front[0] - back[0]) * toeDir[0] + (front[2] - back[2]) * toeDir[2]) / tl;
  return ahead / bodyWidth(world);
}

/**
 * Where the phone is, worked out from the body itself, so a wrong choice in the set-up does not
 * spoil the checks. If the line across the shoulders and hips points mostly towards the phone,
 * the learner is side-on to it: the phone is in front (where the bowler would be). Otherwise the
 * phone sees the chest: it is at the side.
 */
export function detectView(world: number[]): CameraView {
  const p = (i: number) => worldPoint(world, i);
  const sh = sub(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const hip = sub(p(LM.L_HIP), p(LM.R_HIP));
  const across = Math.abs(sh[0] + hip[0]);
  const depth = Math.abs(sh[2] + hip[2]);
  return depth > 1.2 * across ? 'front' : 'side';
}

/**
 * Head along the line of the feet: 0 midway between the feet, +1 one stance-width towards the
 * bowler. From the side the line of the feet runs across the picture, so the picture itself is
 * used (more exact than depth). From the front the line of the feet points at the phone and the
 * pose model cannot measure it well, so it is not judged (undefined).
 */
export function headAlongFeet(world: number[], hand: Hand, lm: number[] | undefined, view: CameraView): number | undefined {
  const s = sides(hand);
  if (view === 'front') return undefined;
  if (lm) {
    const fx = lm[s.frontAnkle * 4];
    const bx = lm[s.backAnkle * 4];
    const nx = lm[LM.NOSE * 4];
    const ax = fx - bx;
    if (Math.abs(ax) > 0.03) return (nx - (fx + bx) / 2) / ax;
  }
  const p = (i: number) => worldPoint(world, i);
  const front = p(s.frontAnkle);
  const back = p(s.backAnkle);
  const nose = p(LM.NOSE);
  const ankleMid = mid(front, back);
  const axis: Vec3 = [front[0] - back[0], 0, front[2] - back[2]];
  const axisLen = Math.max(len(axis), 0.15);
  return ((nose[0] - ankleMid[0]) * axis[0] + (nose[2] - ankleMid[2]) * axis[2]) / (axisLen * axisLen);
}

/**
 * Eyes: which way the head looks, seen from above. 0 degrees is looking straight at the bowler;
 * 90 is looking sideways. Measured from the middle of the ears to the nose.
 *
 * The bowler is where the front shoulder and the front hip point, wherever the phone is. (An
 * earlier version took the phone itself as the bowler whenever the body looked side-on to it.
 * With the phone a little to one side, a learner who looked at the bowler, away from the phone,
 * was then told "look at the bowler, not at the phone".)
 */
export function lookAngle(world: number[], hand: Hand, view: CameraView = detectView(world)): number | undefined {
  void view;
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);
  const fs = p(s.frontShoulder);
  const bs = p(s.backShoulder);
  const fh = p(s.frontHip);
  const bh = p(s.backHip);
  const axis: Vec3 = [fs[0] - bs[0] + fh[0] - bh[0], 0, fs[2] - bs[2] + fh[2] - bh[2]];
  const axisLen = len(axis);
  const nose = p(LM.NOSE);
  const earMid = mid(p(LM.L_EAR), p(LM.R_EAR));
  const lookX = nose[0] - earMid[0];
  const lookZ = nose[2] - earMid[2];
  const lookLen = Math.hypot(lookX, lookZ);
  if (lookLen <= 0.02 || axisLen <= 0.2) return undefined;
  const cos = (lookX * axis[0] + lookZ * axis[2]) / (lookLen * axisLen);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI);
}

/**
 * Which way round the learner is standing: as a right-handed or a left-handed batter.
 * Beginners often pick the bat up the other way round. Two clues are used, each worth one vote:
 *  - the top hand on the handle is the higher wrist (left hand for a right-hander), when the
 *    hands are together on the bat;
 *  - the head is turned towards the front shoulder, to look at the bowler (the left shoulder
 *    for a right-hander).
 * Returns a number from -1 (surely left-handed) to +1 (surely right-handed); 0 means no clue.
 * From the bowler's end (the front view) a third clue is used: the front shoulder is nearer the phone.
 */
export function standingSide(world: number[], lm?: number[], view: CameraView = 'side'): number {
  const p = (i: number) => worldPoint(world, i);
  const seen = (i: number) => !lm || visibility(lm, i) >= 0.5;
  // Field test (24 October 2026): with only the face in the picture the app said the bat was held
  // the other way round. The side is judged only when the whole body is seen (shoulders, hips,
  // knees and ankles), and only when at least two clues agree; otherwise there is no verdict.
  if (lm) {
    const pairs = [[LM.L_SHOULDER, LM.R_SHOULDER], [LM.L_HIP, LM.R_HIP], [LM.L_KNEE, LM.R_KNEE], [LM.L_ANKLE, LM.R_ANKLE]];
    if (!pairs.every(([a, b]) => Math.max(visibility(lm, a), visibility(lm, b)) >= 0.6)) return 0;
  }
  let vote = 0;
  let votes = 0;
  const signs: number[] = [];
  const shL = p(LM.L_SHOULDER);
  const shR = p(LM.R_SHOULDER);
  const shoulderWidth = Math.max(dist(shL, shR), 0.15);
  // Top hand.
  if (seen(LM.L_WRIST) && seen(LM.R_WRIST)) {
    const wl = p(LM.L_WRIST);
    const wr = p(LM.R_WRIST);
    if (dist(wl, wr) < 0.6 * shoulderWidth) {
      const lift = wr[1] - wl[1]; // y points down: positive when the left wrist is higher
      if (Math.abs(lift) > 0.025) {
        vote += Math.sign(lift) * Math.min(1, Math.abs(lift) / 0.06);
        votes++;
        signs.push(Math.sign(lift));
      }
    }
  }
  // Head turn, seen from above.
  if (seen(LM.NOSE) && (seen(LM.L_EAR) || seen(LM.R_EAR))) {
    const nose = p(LM.NOSE);
    const earMid = mid(p(LM.L_EAR), p(LM.R_EAR));
    const look: Vec3 = [nose[0] - earMid[0], 0, nose[2] - earMid[2]];
    const across: Vec3 = [shL[0] - shR[0], 0, shL[2] - shR[2]];
    const ll = len(look);
    const la = len(across);
    if (ll > 0.02 && la > 0.1) {
      const cos = (look[0] * across[0] + look[2] * across[2]) / (ll * la);
      if (Math.abs(cos) > 0.35) {
        vote += Math.sign(cos) * Math.min(1, (Math.abs(cos) - 0.35) / 0.4);
        votes++;
        signs.push(Math.sign(cos));
      }
    }
  }
  // From the bowler's end, the front shoulder is the one nearer the phone.
  if (view === 'front' && lm && seen(LM.L_SHOULDER) && seen(LM.R_SHOULDER)) {
    const nearer = lm[LM.R_SHOULDER * 4 + 2] - lm[LM.L_SHOULDER * 4 + 2]; // positive when the left shoulder is nearer
    if (Math.abs(nearer) > 0.05) {
      vote += Math.sign(nearer) * Math.min(1, Math.abs(nearer) / 0.15);
      votes++;
      signs.push(Math.sign(nearer));
    }
  }
  // One clue alone, or clues that disagree, give no verdict.
  if (votes < 2 || signs.some((s) => s !== signs[0])) return 0;
  return vote / votes;
}

/**
 * Feature extraction for the grip. The camera sees wrists, not fingers, so the measures are:
 * how far apart the hands are, which hand is higher, and how low the bat is held.
 */
export function measureGrip(world: number[], hand: Hand): Measures {
  const p = (i: number) => worldPoint(world, i);
  const shL = p(LM.L_SHOULDER);
  const shR = p(LM.R_SHOULDER);
  const shoulderMid = mid(shL, shR);
  const hipMid = mid(p(LM.L_HIP), p(LM.R_HIP));
  const shoulderWidth = Math.max(dist(shL, shR), 0.15);
  const trunk = Math.max(dist(shoulderMid, hipMid), 0.2);

  // A right-handed batter has the left hand on top; a left-hander the right.
  const top = p(hand === 'right' ? LM.L_WRIST : LM.R_WRIST);
  const bottom = p(hand === 'right' ? LM.R_WRIST : LM.L_WRIST);
  const wristMid = mid(top, bottom);

  return {
    // Hands below the shoulders, as a share of the length of the trunk.
    low: (wristMid[1] - shoulderMid[1]) / trunk,
    // Gap between the wrists as a multiple of shoulder width.
    together: dist(top, bottom) / shoulderWidth,
    // How far the top hand is above the bottom hand, in metres. Negative means the hands are swapped.
    order: bottom[1] - top[1],
  };
}

/**
 * Feature extraction for the forward defence, on the held position at the end of the shot.
 * Every measure is the same whichever way the batter faces, like the stance measures.
 */
export function measureDefence(world: number[], hand: Hand, lm?: number[], view: CameraView = detectView(world), aspect?: number | null): Measures {
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);
  const shL = p(LM.L_SHOULDER);
  const shR = p(LM.R_SHOULDER);
  const shoulderWidth = Math.max(dist(shL, shR), 0.15);
  const front = p(s.frontAnkle);
  const back = p(s.backAnkle);
  const frontKnee = p(s.frontKnee);
  const nose = p(LM.NOSE);
  const ankleMid = mid(front, back);
  const wristMid = mid(p(LM.L_WRIST), p(LM.R_WRIST));
  const frontElbow = p(hand === 'right' ? LM.L_ELBOW : LM.R_ELBOW);
  const frontWrist = p(hand === 'right' ? LM.L_WRIST : LM.R_WRIST);

  // Head along the line of the feet: 0 is midway between them, 0.5 is over the front foot.
  void nose;
  void ankleMid;
  const along = headAlongFeet(world, hand, lm, view);
  const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

  const neck = neckAngle(world, lm);
  const up: Vec3 = [0, -1, 0];
  const trunk = sub(mid(shL, shR), mid(p(LM.L_HIP), p(LM.R_HIP)));
  return {
    stride: strideLength(world, hand, lm, view, aspect),
    frontKnee: jointAngle(p(s.frontHip), frontKnee, front),
    ...(neck === undefined ? {} : { headDown: neck }),
    leanIn: angleBetween(trunk, up),
    backLeg: jointAngle(p(s.backHip), p(s.backKnee), back),
    ...(along === undefined ? {} : { headOver: along }),
    // How far the hands are from the front knee, seen from above.
    batPad: flat(wristMid, frontKnee) / shoulderWidth,
    // Height of the front elbow above the front wrist, in metres (y points down).
    elbow: frontWrist[1] - frontElbow[1],
    // Eyes down the pitch, as in the stance.
    ...lookOrNothing(world, hand, view),
  };
}

/**
 * Length of the step, front ankle to back ankle, as a multiple of shoulder width.
 *
 * From the side the step runs across the picture and the 3D landmarks measure it well. From the
 * front (the phone where the bowler is) the step points straight at the phone, and depth is what
 * the pose model measures worst: a good long step read as a short one, so the footwork step could
 * not be passed with the phone in front. The picture helps: a foot nearer the phone stands lower
 * in the picture. The drop of the front ankle below the back ankle, compared with the length of
 * the shin in the picture, gives the step (about 3.7 shoulder widths per shin length, for a phone
 * about waist high, 3 to 4 metres away). The larger of the two readings is used.
 */
export const STRIDE_PER_SHIN_DROP = 3.7;
export const STRIDE_PICTURE_MAX = 2.6;
export function strideLength(world: number[], hand: Hand, lm?: number[], view: CameraView = detectView(world), aspect?: number | null): number {
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);
  const width = Math.max(dist(p(LM.L_SHOULDER), p(LM.R_SHOULDER)), 0.15);
  const inWorld = dist(p(s.frontAnkle), p(s.backAnkle)) / width;
  if (view !== 'front' || !lm) return inWorld;
  for (const j of [s.frontAnkle, s.backAnkle, s.frontKnee, s.backKnee]) if (visibility(lm, j) < 0.5) return inWorld;
  const ar = aspect && aspect > 0 ? aspect : 0.75;
  const P = (i: number): [number, number] => [lm[i * 4] * ar, lm[i * 4 + 1]];
  const shin = (k: number, a: number) => Math.hypot(P(k)[0] - P(a)[0], P(k)[1] - P(a)[1]);
  const shinPic = (shin(s.frontKnee, s.frontAnkle) + shin(s.backKnee, s.backAnkle)) / 2;
  if (shinPic < 0.02) return inWorld;
  const drop = P(s.frontAnkle)[1] - P(s.backAnkle)[1];
  const fromPicture = (STRIDE_PER_SHIN_DROP * drop) / shinPic;
  // The picture reading is only rough (it depends on how high and how far away the phone is), so
  // it can show that a step is long enough, but never on its own that it is too long.
  return Math.max(inWorld, Math.min(fromPicture, STRIDE_PICTURE_MAX));
}

function lookOrNothing(world: number[], hand: Hand, view: CameraView): Measures {
  const look = lookAngle(world, hand, view);
  return look === undefined ? {} : { look };
}

/**
 * Feature extraction for the front-foot drive, on the held finish: the lower body as in the
 * forward defence, then how high the hands finish and whether the front elbow is up.
 */
export function measureDrive(world: number[], hand: Hand, lm?: number[], view: CameraView = detectView(world), aspect?: number | null): Measures {
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);
  const base = measureDefence(world, hand, lm, view, aspect);
  const shoulderMid = mid(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const hipMid = mid(p(LM.L_HIP), p(LM.R_HIP));
  const trunk = Math.max(dist(shoulderMid, hipMid), 0.2);
  const wristMid = mid(p(LM.L_WRIST), p(LM.R_WRIST));
  const frontElbow = p(hand === 'right' ? LM.L_ELBOW : LM.R_ELBOW);
  const frontShoulder = p(s.frontShoulder);
  return {
    stride: base.stride,
    frontKnee: base.frontKnee,
    backLeg: base.backLeg,
    headOver: base.headOver,
    // Hands above the shoulders, as a share of the trunk length (y points down).
    finish: (shoulderMid[1] - wristMid[1]) / trunk,
    // Front elbow above the front shoulder, in metres.
    elbowUp: frontShoulder[1] - frontElbow[1],
  };
}

/**
 * Feature extraction for the other basic shots (back-foot defence, pull, cut, sweep), on the held
 * position of the shot. The lower body and head are measured as in the forward defence; the
 * names say what each measure means for these shots.
 */
/** The shots after the forward defence and the drive: back-foot defence, pull, cut and sweep. */
const isOtherShot = (skill: Skill) => skill === 'backdefence' || skill === 'pull' || skill === 'cut' || skill === 'sweep';

export function measureShot(world: number[], hand: Hand, lm?: number[], view: CameraView = detectView(world), aspect?: number | null): Measures {
  const p = (i: number) => worldPoint(world, i);
  const base = measureDefence(world, hand, lm, view, aspect);
  const drive = measureDrive(world, hand, lm, view, aspect);
  const shoulderMid = mid(p(LM.L_SHOULDER), p(LM.R_SHOULDER));
  const hipMid = mid(p(LM.L_HIP), p(LM.R_HIP));
  const ankleMid = mid(p(LM.L_ANKLE), p(LM.R_ANKLE));
  const trunk = Math.max(dist(shoulderMid, hipMid), 0.2);
  const wristMid = mid(p(LM.L_WRIST), p(LM.R_WRIST));
  const out: Measures = {
    // Back foot shots: the step is short, the head is back over the back foot, the front leg is
    // light and the back knee is a little bent.
    shortStep: base.stride,
    frontLight: base.frontKnee,
    backKnee: base.backLeg,
    // The sweep: how deep the front knee bends, and how low the hips sit, as hips-to-ankles
    // height over the length of the trunk (about 1.7 standing, 1.0 in a deep sweep).
    sweepKnee: base.frontKnee,
    crouch: (ankleMid[1] - hipMid[1]) / trunk,
    // Hands above the shoulders (high) or below (low), over the length of the trunk.
    highHands: drive.finish,
    lowHands: drive.finish,
    elbowUp: drive.elbowUp,
    // How far the hands are from the shoulders, over the length of the trunk: arms out or bent.
    reach: dist(wristMid, shoulderMid) / trunk,
  };
  if (base.headOver !== undefined) {
    out.weightBack = base.headOver;
    out.headOver = base.headOver;
  }
  out.stride = base.stride;
  if (base.elbow !== undefined) out.elbow = base.elbow;
  return out;
}

/**
 * True when the face is turned to the phone: both ears are clearly seen, one each side of the
 * nose, as in a photo taken from the front. When the head is turned to look along the pitch, the
 * phone sees the face from the side: the far ear is hidden and the nose is near the edge.
 * Read from the picture, which shows this far more surely than depth does.
 */
export function facingPhone(lm: number[] | undefined): boolean {
  if (!lm) return false;
  if (visibility(lm, LM.L_EAR) < 0.6 || visibility(lm, LM.R_EAR) < 0.6 || visibility(lm, LM.NOSE) < 0.6) return false;
  const l = lm[LM.L_EAR * 4];
  const r = lm[LM.R_EAR * 4];
  const n = lm[LM.NOSE * 4];
  const span = Math.abs(l - r);
  if (span < 0.015) return false;
  return Math.abs(n - (l + r) / 2) < 0.25 * span;
}

/** True when the bat was found clearly enough to be judged. */
export function batUsable(bat: BatSeen | null | undefined): bat is BatSeen {
  return !!bat && bat.conf >= MIN_BAT_CONFIDENCE && !bat.onBody;
}

const DEG = 180 / Math.PI;

/**
 * Measures of the bat, from its direction in the picture (hands to toe; x to the right, y down).
 * The phone faces the batter's chest, so the bowler is to one side of the picture and a lean of the
 * bat towards or away from the bowler shows as a tilt to the left or right.
 *
 * - Stance, batRest: angle between the bat and straight down. 0° is a bat resting down.
 * - Defence, batTilt: tilt of the bat from straight down, positive when the toe is behind the
 *   hands (towards the back foot), which is the "hands ahead, bat angled down" position.
 *   A bat held across the body or pointing up reads as a large positive number.
 * - Drive, batFinish: angle between the bat and straight up. 0° is a bat pointing straight up;
 *   90° is level; more than about 110° means the bat never came up.
 */
export function measureBat(skill: Skill, bat: BatSeen, lm: number[], hand: Hand): Measures {
  const dy = Math.max(-1, Math.min(1, bat.dy));
  if (skill === 'stance') return { batRest: Math.acos(dy) * DEG };
  if (skill === 'drive') return { batFinish: Math.acos(-dy) * DEG };
  if (skill === 'defence') {
    const s = sides(hand);
    // Which way the bowler is in the picture: from the back ankle towards the front ankle.
    const side = Math.sign(lm[s.frontAnkle * 4] - lm[s.backAnkle * 4]) || 1;
    let tilt = Math.atan2(-bat.dx * side, bat.dy) * DEG;
    if (tilt < -60) tilt = -tilt;
    return { batTilt: tilt };
  }
  return {};
}

/** Which way the bat is held wrong in the stance, from its direction in the picture. */
export type BatFault = 'up' | 'level' | 'out' | null;

/**
 * A precise correction for the bat in the stance. Beginners hold the bat in many wrong ways: up
 * in the air, out level (often pointing at the bowler), or down but out away from the body. Each
 * one gets its own correction.
 * Picture directions: x to the right, y down. From the side the bowler is to one side of the
 * picture, where the front foot (or front shoulder) is.
 */
export function batRestFault(bat: BatSeen): BatFault {
  const dy = Math.max(-1, Math.min(1, bat.dy));
  const fromDown = Math.acos(dy) * DEG;
  // Only a bat held high, pointing up in the air, is a fault (see the batRest benchmark).
  return fromDown > 145 ? 'up' : null;
}

export function batRestMessage(bat: BatSeen, lm: number[], hand: Hand, view: CameraView): string | null {
  const fault = batRestFault(bat);
  if (!fault) return null;
  const s = sides(hand);
  // Which way the bowler is in the picture: +1 to the right, -1 to the left, 0 not known.
  let bowler = 0;
  if (view === 'side') {
    const feet = lm[s.frontAnkle * 4] - lm[s.backAnkle * 4];
    const shoulders = lm[s.frontShoulder * 4] - lm[s.backShoulder * 4];
    bowler = Math.abs(feet) > 0.03 ? Math.sign(feet) : Math.abs(shoulders) > 0.03 ? Math.sign(shoulders) : 0;
  }
  const towards = bowler !== 0 && Math.abs(bat.dx) > 0.25 ? Math.sign(bat.dx) === bowler : null;
  let text: string;
  if (fault === 'up') {
    text = 'Your bat is too high, up in the air. Bring it lower: rest it by your {back} toe, or lift it just a little behind you.';
  } else if (fault === 'level') {
    text =
      towards === true
        ? 'Your bat is pointing at the bowler. Bring it down and rest the toe on the ground, just behind your {back} toe.'
        : towards === false
          ? 'Your bat is sticking out behind you. Bring it down and rest the toe just behind your {back} toe.'
          : 'Your bat is held out level. Bring it down and rest the toe on the ground, just behind your {back} toe.';
  } else {
    text =
      towards === true
        ? 'The toe of your bat is out in front of you. Bring the bat back in, close to your body, toe just behind your {back} toe.'
        : 'Your bat is too far out from your body. Bring it in close, toe just behind your {back} toe.';
  }
  return personalise(text, hand);
}

/** Said and shown when the stance is judged but the bat cannot be seen. */
export const BAT_NOT_SEEN_MESSAGE =
  'I cannot see your bat. Hold it with both hands together on the handle, and rest the toe on the ground just behind your {back} toe.';

/** The checks a position cannot pass without: the bat must be seen in the stance. */
export const REQUIRED_CHECKS: CheckId[] = ['batRest'];

/** Status band for a score from 0 to 100. */
export function statusForScore(score: number): Status {
  return score >= GOOD_SCORE ? 'good' : score >= FAIR_SCORE ? 'fair' : 'poor';
}

/** Benchmark comparison for one measure. */
export function scoreMeasure(b: Benchmark, value: number | undefined, hand: Hand = 'right'): CheckResult {
  const label = personalise(b.label, hand);
  if (value === undefined || Number.isNaN(value)) {
    return { id: b.id, label, value: null, score: 0, status: 'fair', message: null, ...(b.advisory ? { advisory: true } : {}) };
  }
  let score = 100;
  let message: string | null = null;
  if (value < b.min) {
    score = 100 * (1 - clamp((b.min - value) / b.tolerance, 0, 1));
    message = b.tooLow;
  } else if (value > b.max) {
    score = 100 * (1 - clamp((value - b.max) / b.tolerance, 0, 1));
    message = b.tooHigh;
  }
  const status = statusForScore(score);
  return {
    id: b.id,
    label,
    value,
    score: Math.round(score),
    status,
    message: status === 'good' || !message ? null : personalise(message, hand),
    ...(b.advisory ? { advisory: true } : {}),
  };
}

/** Scores a set of measures against a list of benchmarks. */
export function scoreChecks(benchmarks: Benchmark[], measures: Measures, hand: Hand = 'right'): Extract<PoseAnalysis, { state: 'ok' }> {
  const checks = benchmarks.map((b) => scoreMeasure(b, measures[b.id], hand));
  return summarise(benchmarks, checks);
}

/**
 * The overall score, the cues and the joints to ring, from a set of scored checks.
 * Tips (advisory checks) are left out of the score; their cues come after the real faults, so
 * the voice always speaks the most important thing first.
 */
export function summarise(benchmarks: Benchmark[], checks: CheckResult[]): Extract<PoseAnalysis, { state: 'ok' }> {
  let total = 0;
  let weight = 0;
  benchmarks.forEach((b, i) => {
    const c = checks[i];
    if (c.advisory || (c.value === null && !c.required)) return;
    total += c.score * b.weight;
    weight += b.weight;
  });
  const cues = checks
    .filter((c) => (c.value !== null || c.required) && c.status !== 'good')
    .sort((a, b) => (a.advisory ? 1 : 0) - (b.advisory ? 1 : 0) || a.score - b.score);
  const ring = cues.filter((c) => !c.advisory).slice(0, 2);
  const highlights = [...new Set((ring.length ? ring : cues.slice(0, 1)).flatMap((c) => benchmarks.find((b) => b.id === c.id)!.joints))];
  return { state: 'ok', score: weight ? Math.round(total / weight) : 0, checks, cues, highlights };
}

/** True when a cue is a real fault (not a tip) that stops the position from counting. */
export function blocks(c: CheckResult): boolean {
  // A real fault (red). A "nearly" (orange) is spoken as a cue but does not stop a good stance
  // from counting: the camera cannot measure every part exactly from every side.
  return !c.advisory && c.status === 'poor' && (c.value !== null || !!c.required);
}

/**
 * The app's verdict on a position: good when the score is at least GOOD_SCORE and no single
 * check is poor. The same rule decides when a repetition counts and what the coach test records.
 */
export function isGoodPosition(analysis: Extract<PoseAnalysis, { state: 'ok' }>): boolean {
  return analysis.score >= GOOD_SCORE && !analysis.checks.some(blocks);
}

/** Scores stance measures against the stance benchmarks. */
export function scoreStance(measures: Measures, hand: Hand = 'right') {
  return scoreChecks(BENCHMARKS, measures, hand);
}

/** Measures that are only taken when the body part is clearly seen. */
const SOMETIMES_MEASURED: CheckId[] = ['feetLine', 'neck', 'look', 'head', 'hands', 'handsIn', 'toesSide', 'headOver', 'headDown'];

/** Frames (about 15 a second) a bat found a moment ago is kept after it is lost. */
export const BAT_KEEP_FRAMES = 5;

/**
 * Smooths the measures between frames so the feedback does not flicker.
 * Uses an exponential moving average; a higher alpha reacts faster.
 */
/**
 * Smoothing over TIME, not over frames. Field test (19 October 2026, phone in front): the camera
 * page now runs at 40 to 60 frames a second, and the old per-frame smoothing (35 % of each new
 * frame) then followed every shake within about 50 ms, so the score jumped 22, 11, 91, 100, 29 on
 * a stance that did not change. The weights are now set from the time between frames: a measure
 * follows a real change in about a quarter of a second, the model's probabilities in about half a
 * second, whatever the frame rate.
 */
export const MEASURE_TAU_MS = 250;
export const PROBS_TAU_MS = 550;
/** The model's "good" verdict, once given, is kept until P(correct) drops this far below the threshold. */
export const MODEL_HYSTERESIS = 0.12;

export class StanceSmoother {
  private values: Measures = {};
  private alpha: number;
  constructor(alpha = 0.35) {
    this.alpha = alpha;
  }

  /** Weight of a new value: from the time since the last one when known, else the fixed alpha. */
  private weight(lastT: number | null, t: number | undefined, tau: number): number {
    if (t === undefined || lastT === null || t <= lastT) return this.alpha;
    const dt = Math.min(500, t - lastT);
    return 1 - Math.exp(-dt / tau);
  }

  private probs: number[] | null = null;
  private probsT: number | null = null;
  /** The model's last verdict (true = good), for the hysteresis in judgeWithModel. */
  modelGood = false;
  /** Smooths the trained model's class probabilities, so its verdict does not flicker. */
  pushProbs(next: number[], t?: number): number[] {
    if (!this.probs || this.probs.length !== next.length || (t !== undefined && this.probsT !== null && t - this.probsT > 1500)) {
      this.probs = next.slice();
      this.modelGood = false;
    } else {
      const a = this.weight(this.probsT, t, PROBS_TAU_MS);
      this.probs = this.probs.map((p, i) => p + a * (next[i] - p));
    }
    if (t !== undefined) this.probsT = t;
    return this.probs.slice();
  }

  private valuesT: number | null = null;
  push(next: Measures, t?: number): Measures {
    const a = this.weight(this.valuesT, t, MEASURE_TAU_MS);
    if (t !== undefined && this.valuesT !== null && t - this.valuesT > 1500) this.values = {};
    for (const key of Object.keys(next) as CheckId[]) {
      const v = next[key];
      if (v === undefined || Number.isNaN(v)) continue;
      const prev = this.values[key];
      this.values[key] = prev === undefined ? v : prev + a * (v - prev);
    }
    if (t !== undefined) this.valuesT = t;
    return { ...this.values };
  }

  /** Drops measures that were not seen in the latest frame, so an old value is not reused. */
  forget(ids: CheckId[]) {
    for (const id of ids) delete this.values[id];
  }

  private missed = 0;
  /**
   * The bat was not found in this frame. A bat found a moment ago is kept for a few frames (the
   * camera page looks for it on every other frame, and a single missed frame should not reset a
   * held stance); after that it is dropped.
   */
  missBat(ids: CheckId[], keepFrames = BAT_KEEP_FRAMES) {
    this.missed++;
    if (this.missed > keepFrames) this.forget(ids);
  }
  sawBat() {
    this.missed = 0;
  }
  /** The latest smoothed value of a measure, if any. */
  value(id: CheckId): number | undefined {
    return this.values[id];
  }

  reset() {
    this.values = {};
    this.missed = 0;
    this.probs = null;
    this.probsT = null;
    this.valuesT = null;
    this.modelGood = false;
  }
}

/**
 * Full pipeline for one frame of a skill:
 * visibility filter, camera-position check, feature extraction, benchmark comparison.
 */
export type AnalyzeOptions = {
  /**
   * Where the learner said the phone is (see CameraView). The checks work out the real position
   * from the body (detectView), so this is only kept for the record.
   */
  view?: CameraView;
  /** Judge only these checks (one step of a skill). */
  only?: CheckId[];
  /**
   * The stance cannot count without the bat (default false). When the bat is not seen, the bat
   * check says so and the position is not good.
   */
  requireBat?: boolean;
  /**
   * The trained model to judge with. Left out: the model for the skill in models/index.ts, if
   * any. null: judge by the rules alone. A part of a skill (`only`) is always judged by the rules.
   */
  model?: PositionModel | null;
};

export function analyzePose(skill: Skill, frame: PoseFrame, hand: Hand, smoother?: StanceSmoother, options: AnalyzeOptions = {}): PoseAnalysis {
  if (!frame.world || frame.world.length < 33 * 3) return { state: 'no-body', missing: null };

  // If the head and trunk can be seen, a wrong camera position explains everything else,
  // so it is reported first.
  // The phone may be in front or at the side; which one is worked out from the body (detectView),
  // so both work whatever was chosen in the set-up. Only a learner with their back to a phone at
  // the side cannot be judged.
  const view = detectView(frame.world);
  const trunkSeen = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP].some((j) => visibility(frame.lm, j) >= MIN_VISIBILITY);
  if (trunkSeen && view === 'side') {
    const problem = cameraProblem(frame.world, 'side');
    if (problem === 'back') return { state: 'wrong-angle', problem };
  }
  // With the phone in front (where the bowler would be) the batter must be side-on. A learner
  // facing the phone with the chest is not in a batting stance at all (field test, October 2026:
  // standing square-on, the bat between the legs, scored 98), so this is said first.
  if (options.view === 'front' && skill === 'stance' && chestOnInPicture(frame.lm, frame.aspect)) {
    return { state: 'wrong-angle', problem: 'chest-on' };
  }

  const missing = missingPart(frame.lm, skill, view);
  if (missing) return { state: 'no-body', missing };
  // A shot steps forward, which across the picture (phone at the side) means sideways. If the body
  // runs into the left or right edge, the step is cut off and cannot be judged (field test,
  // 12 October 2026, "at the side"): ask for more room instead of judging a cut-off shot.
  if (SHOT_SKILLS.includes(skill) && noRoomSideways(frame.lm)) return { state: 'no-body', missing: 'room' };

  const raw =
    skill === 'grip'
      ? measureGrip(frame.world, hand)
      : skill === 'defence'
        ? measureDefence(frame.world, hand, frame.lm, view, frame.aspect)
        : skill === 'drive'
          ? measureDrive(frame.world, hand, frame.lm, view, frame.aspect)
          : isOtherShot(skill)
            ? measureShot(frame.world, hand, frame.lm, view, frame.aspect)
            : measureStance(frame.world, hand, frame.lm, view, frame.aspect);
  // Toes to the side: judged in the picture, with the phone in front only.
  if (skill === 'stance' && options.view === 'front') {
    const toes = toesInPicture(frame.lm, frame.aspect);
    if (toes !== undefined) raw.toesSide = toes;
  }
  // The bat is judged only when the camera page found it clearly.
  const batSeen = skill !== 'grip' && batUsable(frame.bat);
  // A bat known only from the hands is held, but its angle is a guess: it is not judged.
  const batGuess = batSeen && !!frame.bat!.est;
  if (batSeen && !batGuess) {
    Object.assign(raw, measureBat(skill, frame.bat!, frame.lm, hand));
    smoother?.sawBat();
  } else if (smoother) smoother.missBat(BAT_CHECKS);
  // Measures that could not be taken in this frame (a hidden wrist, the toes cut off) are
  // dropped, so an old value is not judged again.
  if (smoother) smoother.forget(SOMETIMES_MEASURED.filter((id) => raw[id] === undefined));
  const measures = smoother ? smoother.push(raw, frame.t) : raw;
  const chosen = options.only ? options.only.map((id) => BENCHMARK_BY_ID[id]).filter(Boolean) : BENCHMARKS_BY_SKILL[skill];
  // With the phone in front, knee bend and lean come from depth, the least exact thing the pose
  // model gives (field test, 12 October 2026: a correct shot was told "Bend your front knee"). In
  // the defence they are tips there, not faults.
  // The same holds for the stance seen from the front (field test, 18 October 2026: from the
  // bowler's end the stance check never passed, so the shot never started): the width of the feet
  // and the lean run along the line to the phone, so they are tips there.
  const DEPTH_TIPS: Partial<Record<Skill, CheckId[]>> = { defence: ['frontKnee', 'leanIn'], stance: ['feet', 'lean'] };
  const tips = view === 'front' ? DEPTH_TIPS[skill] ?? [] : [];
  const benchmarks = tips.length ? chosen.map((b) => (tips.includes(b.id) ? { ...b, advisory: true } : b)) : chosen;
  const result = scoreChecks(benchmarks, measures, hand);
  const refined = refineMessages(result, benchmarks, frame, hand, view, batSeen ? frame.bat! : null, options.requireBat ?? false);
  const model = options.only ? null : options.model === undefined ? modelFor(skill) : options.model;
  if (!model) return refined;
  const rawProbs = classifyFrame(model, frame.world, frame.lm, hand, frame.aspect);
  const probs = smoother ? smoother.pushProbs(rawProbs, frame.t) : rawProbs;
  const front = options.view === 'front' || view === 'front';
  const judged = judgeWithModel(refined, benchmarks, model, predictionFrom(model, probs), hand, { front, wasGood: smoother?.modelGood ?? false });
  if (smoother) smoother.modelGood = judged.model?.good ?? false;
  return judged;
}

/** Probability of the correct class at or above which a position is good, unless the model file says otherwise. */
export const MODEL_GOOD_PROB = 0.6;

/**
 * The trained model decides; the rules explain.
 *  - The score is the model's probability that the position is correct, scaled so that the
 *    model's "good" threshold lands on GOOD_SCORE (a good position scores 85 to 100).
 *  - When the model names a fault, the rule check linked to that fault (FaultLink in the model
 *    file) is marked poor and its correction is spoken first, so the learner hears what to change.
 *  - A position counts only when the model AND the coaching-range rules both accept it. The model
 *    was trained on a small dataset and can accept a position no coach would (field test,
 *    16 October 2026: standing up straight counted as a good stance), so a position the rules
 *    reject (score below GOOD_SCORE or a poor check) does not count, and the rule's correction is
 *    spoken. A "nearly" (fair) check never blocks, as without a model.
 */
/**
 * Phone in front (where the bowler would be): the batter stands side-on, so the line of the
 * shoulders and hips points at the phone and is measured from depth, the least exact thing the
 * pose model gives. The model's features depend on that line, and the field test (19 October 2026)
 * showed the model calling a good stance a fault (scores 4 to 18) and back again. From the front
 * the model therefore stops a position only when it is fairly sure of a fault (P(correct) below
 * FRONT_VETO), and the score is the mean of the model's and the rules' scores. From the side the
 * model decides as before. Record front-view clips and train again to make the front as reliable.
 */
export const FRONT_VETO = 0.35;

export function judgeWithModel(
  result: Extract<PoseAnalysis, { state: 'ok' }>,
  benchmarks: Benchmark[],
  model: PositionModel,
  pred: ModelPrediction,
  hand: Hand,
  opts: { front?: boolean; wasGood?: boolean } = {},
): Extract<PoseAnalysis, { state: 'ok' }> {
  const goodProb = model.good_prob ?? MODEL_GOOD_PROB;
  // Hysteresis: a position the model already accepts stays accepted until P(correct) falls a
  // little below the threshold, so a value hovering at the threshold does not flicker.
  const keep = opts.wasGood ? MODEL_HYSTERESIS : 0;
  const good = opts.front
    ? pred.pCorrect >= FRONT_VETO - keep
    : (pred.label === model.correct_class || opts.wasGood === true) && pred.pCorrect >= goodProb - keep;
  const modelScore0 = Math.round(
    pred.pCorrect >= goodProb ? GOOD_SCORE + ((100 - GOOD_SCORE) * (pred.pCorrect - goodProb)) / Math.max(1e-6, 1 - goodProb) : (GOOD_SCORE * pred.pCorrect) / goodProb,
  );
  const modelScore = opts.front ? Math.round((modelScore0 + result.score) / 2) : modelScore0;
  // Both must accept: the rules' own verdict on this frame.
  const rulesGood = isGoodPosition(result);
  const score = !good
    ? Math.min(modelScore, GOOD_SCORE - 1)
    : !rulesGood
      ? Math.min(modelScore, result.score, GOOD_SCORE - 1)
      : Math.max(modelScore, GOOD_SCORE);
  let checks = result.checks;
  let list = benchmarks;
  if (good) {
    // The model accepts; the rule checks are left as they are, so a poor check still blocks.
  } else {
    const link = pred.label !== model.correct_class ? model.faults?.[pred.label] : undefined;
    // A fault with no link (the faults merged into one class, "fault"): the rule check that is
    // furthest from its coaching range says what to change.
    const worst = link ? undefined : checks.filter((c) => c.value !== null && !c.advisory && !c.required).sort((x, y) => x.score - y.score)[0];
    const b = link ? BENCHMARK_BY_ID[link.check as CheckId] : worst ? BENCHMARK_BY_ID[worst.id] : undefined;
    const text =
      link?.message ??
      (link && b ? (link.dir === 'low' ? b.tooLow : b.tooHigh) : worst && worst.score < 100 && worst.message ? worst.message : 'Not quite right yet. Watch the demonstration again and copy the position.');
    const message = personalise(text, hand);
    const i = b ? checks.findIndex((c) => c.id === b.id) : -1;
    if (i >= 0) {
      checks = checks.map((c, j) => (j === i ? { ...c, status: 'poor' as Status, score: Math.min(c.score, FAIR_SCORE - 1), message, advisory: undefined, byModel: true } : c));
    } else {
      const id = (b?.id ?? benchmarks[0].id) as CheckId;
      const extra = b ?? { ...benchmarks[0], joints: [] };
      list = [...benchmarks, { ...extra, weight: 0 }];
      checks = [...checks, { id, label: personalise(extra.label, hand), value: null, score: 0, status: 'poor', message, required: true, byModel: true }];
    }
  }
  const summary = summarise(list, checks);
  // The model's fault is said first, whatever the rule scores say.
  const cues = [...summary.cues.filter((c) => c.byModel), ...summary.cues.filter((c) => !c.byModel)];
  return { ...summary, cues, score, model: { ...pred, classes: model.classes, good, front: !!opts.front } };
}

/**
 * Replaces the general corrections with precise ones where the picture says more:
 *  - the bat in the stance: up, level (towards the bowler or behind), or out from the body;
 *    and, when it cannot be seen, a clear "I cannot see your bat", which stops the stance from
 *    counting (a stance without the bat in the right place is not a good stance);
 *  - the eyes: "not at the phone" only when the face really is turned to the phone;
 *  - the feet: toes turned towards the bowler, or one foot ahead of the other.
 */
function refineMessages(
  result: Extract<PoseAnalysis, { state: 'ok' }>,
  benchmarks: Benchmark[],
  frame: PoseFrame,
  hand: Hand,
  view: CameraView,
  bat: BatSeen | null,
  requireBat: boolean,
): Extract<PoseAnalysis, { state: 'ok' }> {
  let changed = false;
  const checks = result.checks.map((c) => {
    if (c.id === 'batRest') {
      if (c.value === null) {
        if (bat?.est) {
          // Held, pointing down by the hands, but the angle cannot be seen in the picture: not
          // judged, and the stance can still count.
          changed = true;
          return { ...c, unsure: true };
        }
        if (!requireBat) return c;
        changed = true;
        // Phone in front: in a side-on stance the bat often hangs behind the front leg, out of
        // the phone's sight (field test, 19 October 2026: "I cannot see your bat" on most frames of
        // a good stance). From the front it is a tip, not a fault that stops the stance.
        if (view === 'front') return { ...c, status: 'fair' as Status, score: FAIR_SCORE, required: true, advisory: true, message: personalise(BAT_NOT_SEEN_MESSAGE, hand) };
        return { ...c, status: 'poor' as Status, score: 0, required: true, message: personalise(BAT_NOT_SEEN_MESSAGE, hand) };
      }
      if (c.message && bat) {
        const precise = batRestMessage(bat, frame.lm, hand, view);
        if (precise) {
          changed = true;
          return { ...c, message: precise };
        }
      }
      return c;
    }
    if ((c.id === 'batTilt' || c.id === 'batFinish') && c.value === null && requireBat && !bat?.est) {
      // In a shot the bat moves fast and is often hidden for a moment, so a bat that is not seen
      // is a tip that is shown and spoken, not a fault that stops the repetition.
      changed = true;
      return { ...c, status: 'fair' as Status, required: true, advisory: true, message: 'I cannot see your bat. Keep it in view of the phone, not hidden behind your body.' };
    }
    if (c.id === 'look' && c.message) {
      changed = true;
      const message =
        c.value !== null && c.value > LOOK_OTHER_WAY
          ? personalise('Keep your neck straight. You are looking the other way: turn your head to the bowler, over your {front} shoulder.', hand)
          : view !== 'front' && facingPhone(frame.lm)
            ? 'Look at the bowler, not at the phone.'
            : personalise('Turn your head towards the bowler, over your {front} shoulder. Keep both eyes level.', hand);
      return { ...c, message };
    }
    if (c.id === 'hands' && c.message && c.value !== null && c.value < HANDS_HIGH) {
      changed = true;
      return { ...c, message: personalise('Your hands and bat are too high. Bring the bat down: hold it low with both hands, near your {front} thigh.', hand) };
    }
    if (c.id === 'feetLine' && c.message) {
      const toesTurned = toesTowardsBowler(frame.world, hand);
      if (toesTurned) {
        changed = true;
        return { ...c, message: 'Turn your toes to point to the side, not at the bowler. Both feet side by side on one line.' };
      }
    }
    return c;
  });
  if (!changed) return result;
  // Score again: a required check that was not seen counts as 0.
  return summarise(benchmarks, checks);
}

/** A hand higher than this (above the hips, in hip-to-knee lengths) is carrying the bat up: on the shoulder, or lifted high. */
export const HANDS_HIGH = -0.5;

/** Beyond this many degrees from the bowler, the head is turned the other way. */
export const LOOK_OTHER_WAY = 100;

/** True when the toes point along the pitch (within 40 degrees) rather than to the side. */
export function toesTowardsBowler(world: number[], hand: Hand): boolean {
  const p = (i: number) => worldPoint(world, i);
  const s = sides(hand);
  const pitch: Vec3 = sub(p(s.frontAnkle), p(s.backAnkle));
  const pl = Math.hypot(pitch[0], pitch[2]);
  if (pl < 0.1) return false;
  let along = 0;
  let n = 0;
  for (const [heel, toe] of [[LM.L_HEEL, LM.L_TOE], [LM.R_HEEL, LM.R_TOE]]) {
    const f = sub(p(toe), p(heel));
    const l = Math.hypot(f[0], f[2]);
    if (l < 0.04) continue;
    along += Math.abs((f[0] * pitch[0] + f[2] * pitch[2]) / (l * pl));
    n++;
  }
  return n > 0 && along / n > Math.cos((40 * Math.PI) / 180);
}

/**
 * Combines the checks of several repetitions into one set of checks: each measure is averaged
 * over the repetitions in which it was seen, then scored again against its benchmark.
 */
export function averageChecks(skill: Skill, reps: CheckResult[][], hand: Hand, only?: CheckId[]): CheckResult[] {
  const benchmarks = only ? only.map((id) => BENCHMARK_BY_ID[id]) : BENCHMARKS_BY_SKILL[skill];
  return benchmarks.map((b) => {
    const seen = reps.map((checks) => checks.find((c) => c.id === b.id)?.value).filter((v): v is number => typeof v === 'number');
    return scoreMeasure(b, seen.length ? seen.reduce((t, v) => t + v, 0) / seen.length : undefined, hand);
  });
}

/** The stance pipeline for one frame. */
export function analyzeStance(frame: PoseFrame, hand: Hand, smoother?: StanceSmoother): PoseAnalysis {
  return analyzePose('stance', frame, hand, smoother);
}

/** Formats a measured value for the result screen. */
export function formatValue(id: CheckId, value: number | null): string {
  if (value === null) return 'Not seen';
  switch (id) {
    case 'feet':
      return `${value.toFixed(2)} × shoulder width`;
    case 'toesSide':
      return value <= 45 ? 'To the side' : 'Turned to the bowler';
    case 'feetLine':
      return Math.abs(value) <= 0.35 ? 'In line' : value > 0 ? 'Front foot ahead' : 'Back foot ahead';
    case 'knees':
    case 'lean':
    case 'shoulders':
      return `${Math.round(value)}°`;
    case 'head':
      return value > 0.5 ? 'Too far forward' : value < -0.2 ? 'Too far back' : 'Balanced';
    case 'look':
      return value <= 45 ? 'At the bowler' : value < 75 ? 'Partly turned' : value > LOOK_OTHER_WAY ? 'The other way' : 'Not at the bowler';
    case 'neck':
      return value > 8 ? 'Looking up' : value < -45 ? 'Looking down' : 'Straight';
    case 'hands':
      return value < -0.25 ? 'Too high' : value > 0.8 ? 'Too low' : 'Near the thigh';
    case 'handsIn':
      return value > 0.35 ? 'Out from the body' : 'Close to the body';
    case 'together':
      return value > 0.55 ? 'Apart' : 'Together';
    case 'order':
      return value < 0.012 ? 'Swapped' : 'Correct';
    case 'low':
      return value < 0.5 ? 'Too high' : 'Down';
    case 'stride':
      return `${value.toFixed(1)} × shoulder width`;
    case 'headDown':
      return value > -18 ? 'Head up' : value < -75 ? 'Too far down' : 'Down, over the ball';
    case 'leanIn':
      return value < 18 ? 'Upright' : value > 65 ? 'Too far' : 'Leaning in';
    case 'frontKnee':
    case 'backLeg':
      return `${Math.round(value)}°`;
    case 'headOver':
      return value < 0.3 ? 'Behind' : value > 0.85 ? 'Too far' : 'Over the knee';
    case 'batPad':
      return value > 0.9 ? 'Gap' : 'Close';
    case 'elbow':
      return value < 0.05 ? 'Low' : 'High';
    case 'finish':
      return value < 0.1 ? 'Low' : 'High';
    case 'elbowUp':
      return value < -0.05 ? 'Low' : 'Up';
    case 'batRest':
      return value <= 35 ? 'Resting down' : value <= 145 ? 'Lifted a little' : 'Up in the air';
    case 'batTilt':
      return value < -8 ? 'Toe ahead of hands' : value > 28 ? 'Not straight' : 'Straight';
    case 'batFinish':
      return value <= 110 ? 'High' : 'Low';
    case 'shortStep':
      return `${value.toFixed(1)} × shoulder width`;
    case 'weightBack':
      return value > 0 ? 'Weight forward' : value < -0.9 ? 'Too far back' : 'Over the back foot';
    case 'frontLight':
      return value < 140 ? 'Weight on it' : 'Light';
    case 'backKnee':
      return `${Math.round(value)}°`;
    case 'highHands':
      return value < -0.35 ? 'Low' : 'High';
    case 'lowHands':
      return value > -0.3 ? 'Too high' : 'Low';
    case 'reach':
      return value < 0.9 ? 'Arms bent' : 'Arms out';
    case 'crouch':
      return value > 1.25 ? 'Too upright' : value < 0.6 ? 'Very low' : 'Low';
    case 'sweepKnee':
      return `${Math.round(value)}°`;
  }
}

export { GRIP_BENCHMARKS };