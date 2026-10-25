import { LM } from './landmarks';

/**
 * Stance benchmarks.
 *
 * Each check measures one thing about the stance and compares it with an ideal range.
 * Inside the range the check scores 100. Outside it, the score falls in a straight line
 * and reaches 0 when the value is `tolerance` away from the range.
 *
 * THESE RANGES ARE STARTING VALUES. Tune `min`, `max` and `tolerance` with a qualified
 * coach (record a few good and bad stances, look at the measured values on the result
 * screen and adjust). Nothing else in the app needs to change.
 */
export type StanceCheckId = 'feet' | 'feetLine' | 'knees' | 'lean' | 'shoulders' | 'head' | 'look' | 'neck' | 'hands' | 'handsIn' | 'toesSide' | 'batRest';
export type GripCheckId = 'together' | 'order' | 'low';
export type DefenceCheckId = 'stride' | 'frontKnee' | 'backLeg' | 'headOver' | 'headDown' | 'leanIn' | 'batPad' | 'elbow' | 'batTilt';
export type DriveCheckId = 'finish' | 'elbowUp' | 'batFinish';
/** Checks of the other basic shots: back-foot defence, pull, cut and sweep. */
export type ShotCheckId = 'shortStep' | 'weightBack' | 'frontLight' | 'backKnee' | 'highHands' | 'lowHands' | 'reach' | 'crouch' | 'sweepKnee';
/** Checks of the bat itself, measured from the picture rather than the body. */
export const BAT_CHECKS: CheckId[] = ['batRest', 'batTilt', 'batFinish'];
export type CheckId = StanceCheckId | GripCheckId | DefenceCheckId | DriveCheckId | ShotCheckId;

/** The skills that are taught, in order. */
export type Skill = 'grip' | 'stance' | 'defence' | 'drive' | 'backdefence' | 'pull' | 'cut' | 'sweep';
export const SKILLS: Skill[] = ['grip', 'stance', 'defence', 'drive', 'backdefence', 'pull', 'cut', 'sweep'];
/**
 * The skills the camera practises. The grip is taught but not checked by the camera: the pose
 * model sees wrists, not fingers, so it cannot tell a good grip from a bad one reliably.
 */
export const CAMERA_SKILLS: Skill[] = ['stance', 'defence', 'drive', 'backdefence', 'pull', 'cut', 'sweep'];
/** Shots start from the stance, and every repetition begins with a stance check. */
export const SHOT_SKILLS: Skill[] = ['defence', 'drive', 'backdefence', 'pull', 'cut', 'sweep'];
export const SKILL_SHORT: Record<Skill, string> = { grip: 'Grip', stance: 'Stance', defence: 'Defence', drive: 'Drive', backdefence: 'Back defence', pull: 'Pull', cut: 'Cut', sweep: 'Sweep' };
export const SKILL_NAME: Record<Skill, string> = { grip: 'The grip', stance: 'The stance', defence: 'The forward defence', drive: 'The front-foot drive', backdefence: 'The back-foot defence', pull: 'The pull shot', cut: 'The square cut', sweep: 'The sweep' };

export type Benchmark = {
  id: CheckId;
  /** Short name shown on chips and lists. */
  label: string;
  /** What the learner should aim for, one sentence. */
  aim: string;
  unit: string;
  min: number;
  max: number;
  tolerance: number;
  /** Share of the overall score. */
  weight: number;
  /** Shown and spoken when the value is below the range. */
  tooLow: string;
  /** Shown and spoken when the value is above the range. */
  tooHigh: string;
  /** Landmarks to mark on the skeleton when this check fails. */
  joints: number[];
  /**
   * A tip, not a requirement: it is shown and spoken, but it does not change the score and does
   * not stop a repetition from counting. Used for the head and the eyes, which the camera
   * measures less surely than the rest of the body.
   */
  advisory?: boolean;
};

export const BENCHMARKS: Benchmark[] = [
  {
    id: 'feet',
    label: 'Feet',
    aim: 'Feet about shoulder-width apart.',
    unit: '× shoulder width',
    min: 0.85,
    max: 1.6,
    tolerance: 0.5,
    weight: 1.2,
    tooLow: 'Move your feet a little wider.',
    tooHigh: 'Bring your feet closer together.',
    joints: [LM.L_ANKLE, LM.R_ANKLE],
  },
  {
    // Both feet on one line, parallel to the crease: neither foot in front of the other, and the
    // toes of both feet pointing the same way, to the side (not at the bowler). Measured as how
    // far the {front} foot is ahead of the {back} foot in the direction the toes point, as a
    // share of shoulder width. Positive: the {front} foot is ahead.
    id: 'feetLine',
    label: 'Feet in line',
    aim: 'Both feet on one line, side by side, toes pointing to the side.',
    unit: '× shoulder width',
    min: -0.35,
    max: 0.35,
    tolerance: 0.35,
    weight: 1,
    tooLow: 'Your {back} foot is ahead of your {front} foot. Put both feet on one line, side by side.',
    tooHigh: 'Your {front} foot is ahead of your {back} foot. Put both feet on one line, side by side.',
    joints: [LM.L_ANKLE, LM.R_ANKLE],
  },
  {
    // Field test (12 October 2026): a stance with the front foot turned to point at the phone (the
    // bowler) still counted. Judged in the picture with the phone in front only: from there a foot
    // pointing to the side lies across the picture, and a foot pointing at the phone looks short
    // and runs down the picture. Value: the larger angle of the two feet from level, in degrees;
    // a foot too short to measure (pointing straight at the phone) reads 90.
    id: 'toesSide',
    label: 'Toes',
    aim: 'Both feet side by side, toes pointing to the side, not at the bowler.',
    unit: '°',
    min: 0,
    max: 45,
    tolerance: 20,
    weight: 1,
    tooLow: 'Turn your feet so your toes point to the side, not at the bowler. Both feet side by side on one line.',
    tooHigh: 'Turn your feet so your toes point to the side, not at the bowler. Both feet side by side on one line.',
    joints: [LM.L_TOE, LM.R_TOE],
  },
  {
    id: 'knees',
    label: 'Knees',
    aim: 'Knees slightly bent, ready to move.',
    unit: '°',
    // The knees bend towards the chest, which from the side points at the phone: the bend is in
    // depth, the least exact thing the pose model measures, so the range is kept forgiving.
    min: 130,
    max: 168,
    tolerance: 22,
    weight: 1.2,
    tooLow: 'Stand a little taller. Your knees are too bent.',
    tooHigh: 'Bend your knees a little.',
    joints: [LM.L_KNEE, LM.R_KNEE],
  },
  {
    id: 'lean',
    label: 'Lean',
    aim: 'Lean forward slightly from the hips.',
    unit: '°',
    min: 8,
    max: 38,
    tolerance: 18,
    weight: 1,
    tooLow: 'Lean forward a little from your hips.',
    tooHigh: 'Stand up a bit. You are bending over too far.',
    joints: [LM.L_HIP, LM.R_HIP, LM.L_SHOULDER, LM.R_SHOULDER],
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    aim: 'Shoulders level.',
    unit: '°',
    min: 0,
    max: 14,
    tolerance: 18,
    weight: 0.8,
    tooLow: 'Keep your shoulders level.',
    tooHigh: 'Keep your shoulders level.',
    joints: [LM.L_SHOULDER, LM.R_SHOULDER],
  },
  {
    id: 'head',
    label: 'Head',
    aim: 'Head still, between your feet.',
    unit: '',
    min: -0.2,
    max: 0.5,
    tolerance: 0.45,
    weight: 1,
    tooLow: 'You are leaning back. Keep your head over your feet.',
    tooHigh: 'Your head is too far forward. Balance on both feet.',
    joints: [LM.NOSE],
    advisory: true,
  },
  {
    id: 'look',
    label: 'Eyes',
    aim: 'Head turned to look at the bowler, over your {front} shoulder.',
    unit: '°',
    min: 0,
    max: 45,
    tolerance: 35,
    weight: 0.8,
    tooLow: 'Turn your head towards the bowler, over your {front} shoulder.',
    tooHigh: 'Turn your head towards the bowler, over your {front} shoulder.',
    joints: [LM.NOSE],
    advisory: true,
  },
  {
    // How far the head is tipped up (positive) or down (negative), in degrees, from the line of
    // the ears to the nose. With the eyes level the nose sits a little below the ears (about -10).
    id: 'neck',
    label: 'Neck',
    aim: 'Neck straight, head level, eyes looking at the bowler.',
    unit: '°',
    min: -45,
    max: 8,
    tolerance: 15,
    weight: 0.6,
    tooLow: 'Keep your neck straight. Lift your head a little and look at the bowler, not at the ground.',
    tooHigh: 'Keep your neck straight. Do not look up: keep your eyes level and look at the bowler.',
    joints: [LM.NOSE],
    advisory: true,
  },
  {
    id: 'hands',
    label: 'Hands',
    aim: 'Hands low and relaxed, near your front thigh.',
    unit: '',
    min: -0.25,
    max: 0.8,
    tolerance: 0.5,
    weight: 0.8,
    tooLow: 'Lower your hands to your front thigh.',
    tooHigh: 'Raise your hands a little. Do not reach down.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    // Field test (October 2026): a learner holding the bat up in the air with the hands pushed
    // out in front scored 100, because the bat was not seen and the hands were at hip height.
    // In the stance the hands rest close to the body, near the front thigh. Measured in the
    // picture (more exact than depth): how far the hands are from the middle of the hips or the
    // shoulders (the nearer) across the picture, in trunk lengths. A good stance leaning forward,
    // arms hanging from the shoulders, reads about 0.0 to 0.2; hands pushed out read 0.55 or more.
    id: 'handsIn',
    label: 'Hands in',
    aim: 'Hands close to your body, resting near your {front} thigh.',
    unit: '× trunk length',
    min: 0,
    max: 0.35,
    tolerance: 0.2,
    weight: 1,
    tooLow: 'Your hands are out away from your body. Bring them in close, near your {front} thigh, and rest the bat down by your {back} toe.',
    tooHigh: 'Your hands are out away from your body. Bring them in close, near your {front} thigh, and rest the bat down by your {back} toe.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    id: 'batRest',
    label: 'Bat',
    // Angle of the bat from straight down (0) to straight up (180). Field test (October 2026):
    // good batters hold the bat in many ways in the stance (resting by the back toe, or lifted a
    // little behind them, as Virat Kohli does), so only a bat held high, pointing up in the air,
    // is corrected.
    aim: 'Bat resting down by your {back} toe, or lifted a little behind you. Not up in the air.',
    unit: '°',
    min: 0,
    max: 145,
    tolerance: 20,
    weight: 0.8,
    tooLow: 'Your bat is too high, up in the air. Bring it lower: rest it by your {back} toe, or lift it just a little behind you.',
    tooHigh: 'Your bat is too high, up in the air. Bring it lower: rest it by your {back} toe, or lift it just a little behind you.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
];

/**
 * Grip benchmarks. The camera cannot see fingers, so it checks what it can from the wrists:
 * that the hands are together, that the correct hand is on top, and that the bat is held down
 * in front of the body. Messages may use {topHand} and {bottomHand}; they are filled in for
 * the learner's batting hand.
 */
export const GRIP_BENCHMARKS: Benchmark[] = [
  {
    id: 'low',
    label: 'Bat down',
    aim: 'Hold the bat in front of you with its toe on the ground.',
    unit: '',
    min: 0.5,
    max: 1.7,
    tolerance: 0.4,
    weight: 0.8,
    tooLow: 'Lower the bat. Rest its toe on the ground in front of you.',
    tooHigh: 'Stand up and hold the bat in front of you.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    id: 'together',
    label: 'Hands together',
    aim: 'Both hands close together on the handle.',
    unit: '× shoulder width',
    min: 0,
    max: 0.55,
    tolerance: 0.45,
    weight: 1.2,
    tooLow: 'Keep both hands on the handle.',
    tooHigh: 'Bring your hands together on the handle.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    id: 'order',
    label: 'Top hand',
    aim: 'Your {topHand} hand above your {bottomHand} hand.',
    unit: 'm',
    min: 0.012,
    max: 0.3,
    tolerance: 0.05,
    weight: 1.4,
    tooLow: 'Swap your hands. Your {topHand} hand goes on top.',
    tooHigh: 'Bring your hands closer together.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
];

/**
 * Forward defence benchmarks, checked on the position the batter holds at the end of the shot:
 * a long step towards the ball, the front knee bent with the head over it, the back leg nearly
 * straight, the bat close to the front pad and the front elbow high.
 */
export const DEFENCE_BENCHMARKS: Benchmark[] = [
  {
    id: 'stride',
    label: 'Step',
    aim: 'A comfortable step forward with your {front} foot, towards the ball. Not too short, not too long.',
    unit: '× shoulder width',
    min: 1.5,
    max: 2.8,
    tolerance: 0.5,
    weight: 1.2,
    tooLow: 'Step forward. Bring your {front} foot forward, towards the ball.',
    tooHigh: 'Your step is too long. Take a shorter step, so you stay balanced over your front foot.',
    joints: [LM.L_ANKLE, LM.R_ANKLE],
  },
  {
    id: 'frontKnee',
    label: 'Front knee',
    aim: 'Front knee bent, over your front foot.',
    unit: '°',
    min: 95,
    max: 142,
    tolerance: 20,
    weight: 1.2,
    tooLow: 'You are too low. Do not bend your front knee so much.',
    tooHigh: 'Bend your front knee and lean into the shot.',
    joints: [LM.L_KNEE, LM.R_KNEE],
  },
  {
    id: 'backLeg',
    label: 'Back leg',
    aim: 'Back leg nearly straight.',
    unit: '°',
    min: 155,
    max: 181,
    tolerance: 25,
    weight: 0.8,
    tooLow: 'Keep your back leg straighter.',
    tooHigh: 'Keep your back leg straighter.',
    joints: [LM.L_KNEE, LM.R_KNEE],
  },
  {
    id: 'headOver',
    label: 'Head',
    aim: 'Head forward, over your front knee.',
    unit: '',
    min: 0.3,
    max: 0.85,
    tolerance: 0.3,
    weight: 1.2,
    tooLow: 'Get your head forward, over your front knee.',
    tooHigh: 'You are over-balancing. Keep your head over your front knee.',
    joints: [LM.NOSE],
  },
  {
    // The head tipped down to watch the ball onto the bat: the angle of the line from the ears
    // to the nose below level, in degrees (negative is down). With the head up, as in the stance,
    // it is about -10; watching the ball by the front pad, about -25 to -60.
    id: 'headDown',
    label: 'Head down',
    aim: 'Head down, eyes over the ball, watching it onto the bat next to your front pad.',
    unit: '°',
    min: -75,
    max: -18,
    tolerance: 15,
    weight: 1.2,
    tooLow: 'Do not drop your head so far. Keep your eyes on the ball, just in front of your front pad.',
    tooHigh: 'Get your head down. Eyes over the ball, watching it onto the bat next to your front pad.',
    joints: [LM.NOSE],
  },
  {
    // The trunk leaning forward into the shot, in degrees from upright.
    id: 'leanIn',
    label: 'Lean in',
    aim: 'Lean forward into the shot, head and {front} shoulder towards the ball.',
    unit: '°',
    min: 18,
    max: 65,
    tolerance: 15,
    weight: 1,
    tooLow: 'Lean forward into the shot. Head and {front} shoulder go towards the ball.',
    tooHigh: 'Do not bend over so far. Bend the front knee instead.',
    joints: [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP],
  },
  {
    id: 'batPad',
    label: 'Bat by the pad',
    aim: 'Bat close to your front pad, no gap.',
    unit: '× shoulder width',
    min: 0,
    max: 0.9,
    tolerance: 0.6,
    weight: 1,
    tooLow: 'Bring the bat close to your front pad.',
    tooHigh: 'Bring the bat close to your front pad. Do not leave a gap.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    id: 'elbow',
    label: 'Front elbow',
    aim: 'Front elbow high, above your hands.',
    unit: 'm',
    min: 0.05,
    max: 0.6,
    tolerance: 0.12,
    weight: 0.8,
    tooLow: 'Lift your {front} elbow higher.',
    tooHigh: 'Keep your hands closer to your body.',
    joints: [LM.L_ELBOW, LM.R_ELBOW],
  },
  {
    id: 'batTilt',
    label: 'Straight bat',
    aim: 'Bat straight down beside your {front} pad, hands ahead of the blade.',
    unit: '°',
    min: -8,
    max: 28,
    tolerance: 20,
    weight: 1.2,
    tooLow: 'Keep your hands ahead of the bat, so the bat angles down.',
    tooHigh: 'Keep the bat straight. Bring it down next to your {front} pad.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
];

const defence = (id: DefenceCheckId) => DEFENCE_BENCHMARKS.find((b) => b.id === id)!;

/**
 * Front-foot drive benchmarks, checked on the held finish of the shot: the same step, front knee,
 * back leg and head as the forward defence, then a high finish with the front elbow up.
 */
export const DRIVE_BENCHMARKS: Benchmark[] = [
  defence('stride'),
  defence('frontKnee'),
  defence('backLeg'),
  defence('headOver'),
  {
    id: 'finish',
    label: 'High finish',
    aim: 'Finish with your hands high, the bat over your {front} shoulder.',
    unit: '× trunk length',
    min: 0.1,
    max: 1.3,
    tolerance: 0.45,
    weight: 1.2,
    tooLow: 'Finish high. Swing the bat up over your {front} shoulder.',
    tooHigh: 'Do not reach so high. Keep your balance.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    id: 'elbowUp',
    label: 'Front elbow',
    aim: 'Front elbow up at the finish.',
    unit: 'm',
    min: -0.05,
    max: 0.6,
    tolerance: 0.15,
    weight: 0.8,
    tooLow: 'Lead with your {front} elbow and keep it high.',
    tooHigh: 'Lead with your {front} elbow and keep it high.',
    joints: [LM.L_ELBOW, LM.R_ELBOW],
  },
  {
    id: 'batFinish',
    label: 'Bat finish',
    aim: 'Bat finishes high, over your {front} shoulder.',
    unit: '°',
    min: 0,
    max: 110,
    tolerance: 35,
    weight: 1,
    tooLow: 'Swing through and finish with the bat high over your {front} shoulder.',
    tooHigh: 'Swing through and finish with the bat high over your {front} shoulder.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
];

const drive = (id: DriveCheckId) => DRIVE_BENCHMARKS.find((b) => b.id === id)!;

/**
 * Benchmarks of the other basic shots, checked on the held position of the shot. THESE ARE
 * TEXTBOOK STARTING VALUES taken from the model positions in shotPoses.ts: check them with a
 * coach and tune min, max and tolerance, as for the stance.
 */
const BACK_FOOT: Benchmark[] = [
  {
    id: 'shortStep',
    label: 'Back step',
    aim: 'Take a short step back with your back foot. The front foot stays.',
    unit: '× shoulder width',
    min: 0.9,
    max: 2.4,
    tolerance: 0.5,
    weight: 1,
    tooLow: 'Move your back foot back and across, towards the stumps, to give yourself time.',
    tooHigh: 'Your step is too big. Take a smaller step back, so you stay balanced.',
    joints: [LM.L_ANKLE, LM.R_ANKLE],
  },
  {
    id: 'weightBack',
    label: 'Weight back',
    aim: 'Weight on your back foot, head back over it.',
    unit: '',
    min: -0.9,
    max: 0.0,
    tolerance: 0.15,
    weight: 1.3,
    tooLow: 'Do not fall backwards. Keep your head steady over your back foot.',
    tooHigh: 'Your weight is going forward. Get your head back, over your back foot.',
    joints: [LM.NOSE],
  },
  {
    id: 'frontLight',
    label: 'Front leg light',
    aim: 'Front leg light and nearly straight: no weight on it.',
    unit: '°',
    min: 140,
    max: 180,
    tolerance: 20,
    weight: 0.9,
    tooLow: 'Keep your front leg light and nearly straight. Your weight is on the back foot.',
    tooHigh: 'Keep your front leg light and nearly straight.',
    joints: [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE],
  },
  {
    id: 'backKnee',
    label: 'Back knee',
    aim: 'Back knee a little bent, taking your weight.',
    unit: '°',
    min: 125,
    max: 170,
    tolerance: 20,
    weight: 0.9,
    tooLow: 'Do not crouch so much. Keep your back knee only a little bent.',
    tooHigh: 'Bend your back knee a little, and keep your weight on it.',
    joints: [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE],
  },
];
const backFoot = (id: ShotCheckId) => BACK_FOOT.find((b) => b.id === id)!;

const SHOT_EXTRA: Benchmark[] = [
  {
    id: 'highHands',
    label: 'Hands up',
    aim: 'Hands about shoulder height or higher at the finish.',
    unit: '× trunk length',
    min: -0.35,
    max: 1.1,
    tolerance: 0.45,
    weight: 1,
    tooLow: 'Bring your hands up. Finish with them about shoulder height or higher.',
    tooHigh: 'Do not reach so high. Keep your balance.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
  {
    id: 'reach',
    label: 'Arms out',
    aim: 'Arms reaching out to the ball, away from your body.',
    unit: '× trunk length',
    min: 0.9,
    max: 1.6,
    tolerance: 0.35,
    weight: 1,
    tooLow: 'Reach out to the ball. Extend your arms towards the off side.',
    tooHigh: 'Do not over-reach. Keep your balance.',
    joints: [LM.L_WRIST, LM.R_WRIST, LM.L_SHOULDER, LM.R_SHOULDER],
  },
  {
    id: 'crouch',
    label: 'Low down',
    aim: 'Hips low: sit down into the shot.',
    unit: '× trunk length',
    min: 0.6,
    max: 1.25,
    tolerance: 0.3,
    weight: 1.2,
    tooLow: 'Not so low. Keep your balance.',
    tooHigh: 'Get lower. Bend your front knee and sit down into the shot.',
    joints: [LM.L_HIP, LM.R_HIP, LM.L_ANKLE, LM.R_ANKLE],
  },
  {
    id: 'sweepKnee',
    label: 'Front knee',
    aim: 'Front knee deeply bent, over your front foot.',
    unit: '°',
    min: 65,
    max: 118,
    tolerance: 20,
    weight: 1.1,
    tooLow: 'Not so deep. Keep your balance over your front foot.',
    tooHigh: 'Bend your front knee more. Get down to the ball.',
    joints: [LM.L_HIP, LM.L_KNEE, LM.L_ANKLE, LM.R_HIP, LM.R_KNEE, LM.R_ANKLE],
  },
  {
    id: 'lowHands',
    label: 'Hands low',
    aim: 'Hands low, the bat close to the ground.',
    unit: '× trunk length',
    min: -1.5,
    max: -0.3,
    tolerance: 0.4,
    weight: 1,
    tooLow: 'Do not drop your hands so far. Keep them in front of you.',
    tooHigh: 'Keep your hands low, with the bat close to the ground.',
    joints: [LM.L_WRIST, LM.R_WRIST],
  },
];
const extra = (id: ShotCheckId) => SHOT_EXTRA.find((b) => b.id === id)!;

export const BACKDEFENCE_BENCHMARKS: Benchmark[] = [backFoot('shortStep'), backFoot('weightBack'), backFoot('frontLight'), backFoot('backKnee'), defence('elbow')];
export const PULL_BENCHMARKS: Benchmark[] = [backFoot('shortStep'), backFoot('weightBack'), backFoot('frontLight'), backFoot('backKnee'), extra('highHands'), drive('elbowUp')];
export const CUT_BENCHMARKS: Benchmark[] = [backFoot('shortStep'), backFoot('weightBack'), backFoot('frontLight'), backFoot('backKnee'), extra('highHands'), extra('reach')];
export const SWEEP_BENCHMARKS: Benchmark[] = [defence('stride'), extra('sweepKnee'), extra('crouch'), defence('headOver'), extra('lowHands')];

export const BENCHMARKS_BY_SKILL: Record<Skill, Benchmark[]> = { grip: GRIP_BENCHMARKS, stance: BENCHMARKS, defence: DEFENCE_BENCHMARKS, drive: DRIVE_BENCHMARKS, backdefence: BACKDEFENCE_BENCHMARKS, pull: PULL_BENCHMARKS, cut: CUT_BENCHMARKS, sweep: SWEEP_BENCHMARKS };

export const BENCHMARK_BY_ID = Object.fromEntries([...BENCHMARKS, ...GRIP_BENCHMARKS, ...DEFENCE_BENCHMARKS, ...DRIVE_BENCHMARKS, ...BACK_FOOT, ...SHOT_EXTRA].map((b) => [b.id, b])) as Record<CheckId, Benchmark>;

/** A check counts as good at or above this score, and as "nearly" at or above FAIR. */
export const GOOD_SCORE = 85;
export const FAIR_SCORE = 55;

/** A score at or above this passes a skill and opens the next one. */
export const PASS_SCORE = 80;

/** A landmark is treated as seen at or above this visibility. */
export const MIN_VISIBILITY = 0.5;
/**
 * In a side-on stance one side of the body is partly hidden by the other. For a pair of
 * joints (both knees, say) the clearer one must reach MIN_VISIBILITY and the other this.
 */
export const MIN_VISIBILITY_HIDDEN_SIDE = 0.2;

/** Parts of the body that must be in view for each skill, checked from the top down. */
export type BodyPart = 'head' | 'shoulders' | 'hands' | 'hips' | 'knees' | 'feet' | 'room';
export const REQUIRED_PARTS: Record<Skill, { part: BodyPart; joints: number[] }[]> = {
  stance: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  grip: [
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
  ],
  drive: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  backdefence: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  pull: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  cut: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  sweep: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
  defence: [
    { part: 'head', joints: [LM.NOSE, LM.L_EAR, LM.R_EAR] },
    { part: 'shoulders', joints: [LM.L_SHOULDER, LM.R_SHOULDER] },
    { part: 'hands', joints: [LM.L_WRIST, LM.R_WRIST] },
    { part: 'hips', joints: [LM.L_HIP, LM.R_HIP] },
    { part: 'knees', joints: [LM.L_KNEE, LM.R_KNEE] },
    { part: 'feet', joints: [LM.L_ANKLE, LM.R_ANKLE] },
  ],
};

/** What to tell the learner when a part of the body is out of view. */
export const MISSING_PART_MESSAGE: Record<BodyPart, string> = {
  head: 'I cannot see your head. Step back a little.',
  shoulders: 'I cannot see your shoulders. Step back a little.',
  hands: 'I cannot see your hands. Hold the bat in front of you.',
  hips: 'I cannot see your hips. Step back a little.',
  knees: 'I cannot see your legs. Step back until your whole body is in view.',
  feet: 'I cannot see your feet. Step back, or tilt the phone down.',
  room: 'Your step needs room. Move the phone back a little, so your whole body and your step stay in the picture.',
};
