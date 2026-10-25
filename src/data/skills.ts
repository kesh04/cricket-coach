import type { CheckId, Skill } from '@/lib/pose/benchmarks';
import { AT_STANCE, DRIVE_START, IN_DEFENCE, IN_DRIVE, IN_STANCE, STANDING, type DefenceProgress, type DriveProgress, type StanceProgress } from '@/lib/pose/idealStance';
import { LM } from '@/lib/pose/landmarks';
import type { ShotProgress } from '@/lib/pose/shotPoses';
import { SHOT_DEMO_STEPS, SHOT_INFO } from '@/data/shotContent';

/**
 * What the app teaches for each skill the camera can check, and the order it is taught in:
 *
 *   1. Watch    the whole movement is shown once
 *   2. Listen   a voice explains it one step at a time, and why each part matters
 *   3. Set up   what today's practice is, where to put the phone and where to stand
 *   4. Practise the camera checks every repetition and speaks the corrections
 *   5. Review   the learner's own photo, the score and what to do next
 *
 * Text may use the placeholders described in data/curriculum.ts ({front}, {topHand} and so on).
 */

/** What the grip picture shows at each step. */
export type GripStage = 'bat' | 'pickup' | 'top' | 'bottom' | 'vs' | 'pressure' | 'check';

export type DemoStep = {
  id: string;
  /** Short heading shown above the caption. */
  title: string;
  /** What to do. Spoken by the voice and shown as the caption. */
  say: string;
  /** Why it is done this way. Spoken after `say` and shown under it. */
  why?: string;
  /** Checks that this step teaches. A learner who fails one is sent back to this step. */
  teaches?: CheckId[];
  // Stance demonstration
  /** How far into the stance the figure is. */
  progress?: StanceProgress;
  // Forward defence demonstration
  /** How far from the stance into the forward defence the figure is. */
  defence?: DefenceProgress;
  // Front-foot drive demonstration
  /** How far from the stance into the drive the figure is. */
  drive?: DriveProgress;
  // Back-foot defence, pull, cut and sweep demonstrations
  /** How far from the stance into the shot the figure is. */
  shot?: ShotProgress;
  /**
   * Where the figure is seen from: 'front' is the bowler's view, 'side' is the phone's view,
   * 'profile' is straight across the batter so that bent knees and the lean are easy to see.
   */
  view?: 'front' | 'side' | 'profile';
  /** Show the angle at each knee on the figure. */
  kneeAngles?: boolean;
  /** Landmarks to ring on the figure. */
  highlight?: number[];
  /** Whether the figure holds a bat. */
  bat?: boolean;
  // Grip demonstration
  grip?: GripStage;
};

const at = (p: Partial<StanceProgress>): StanceProgress => ({ ...STANDING, ...p });
const def = (p: Partial<DefenceProgress>): DefenceProgress => ({ ...AT_STANCE, ...p });

const GRIP_STEPS: DemoStep[] = [
  {
    id: 'why',
    title: 'Why the grip matters',
    say: 'The grip is how you hold the bat.',
    why: 'It decides which way the face of the bat points. A good grip keeps the face straight, so the ball goes where you aim it and you are less likely to edge it to a fielder. A bad grip is the most common reason beginners hit the ball in the air.',
    grip: 'check',
  },
  {
    id: 'bat',
    title: 'The bat',
    say: 'This is the back of the bat, the side with the ridge. You hold the handle at the top. You hit the ball with the flat face on the other side. The outside edge is the edge further from your body when you stand in your stance.',
    grip: 'bat',
  },
  {
    id: 'pickup',
    title: 'Pick it up',
    say: 'Lay the bat face down on the ground, with the handle pointing at you. Bend down and pick it up with both hands, as if you were picking up an axe.',
    why: 'Picking it up this way puts your hands in the right place every time, without thinking.',
    grip: 'pickup',
  },
  {
    id: 'top',
    title: 'Top hand',
    say: 'You bat {hand}-handed, so your {topHand} hand is the top hand. Put it near the top of the handle, about one finger-width from the end. Wrap your fingers round the handle and close your thumb over them.',
    why: 'The top hand guides the bat, so it is the hand of your front arm, the side nearest the bowler. If you hold the bat with the other hand on top, you are holding it the wrong way round.',
    teaches: ['order'],
    grip: 'top',
  },
  {
    id: 'bottom',
    title: 'Bottom hand',
    say: 'Your {bottomHand} hand goes just below the top hand, touching it or almost touching. Hold it with your thumb and first two fingers, the other fingers resting lightly.',
    why: 'Hands close together work as one. Apart, they fight each other and the bat twists. Too low on the handle, and the bottom hand takes over.',
    teaches: ['together'],
    grip: 'bottom',
  },
  {
    id: 'vs',
    title: 'Line up the Vs',
    say: 'Look down at your hands. On each hand, your thumb and first finger make a V. Both Vs point down the back of the bat, in one line, between the middle and the outside edge.',
    why: 'Lined-up Vs keep the face of the bat straight when you swing. If the Vs point at different places, the face turns as you hit.',
    grip: 'vs',
  },
  {
    id: 'pressure',
    title: 'Firm top, soft bottom',
    say: 'Hold firmly with your top hand, like a firm handshake. Keep your bottom hand relaxed, as if you were holding an egg.',
    why: 'A tight bottom hand pulls the bat across the ball. A relaxed one lets the top hand keep it straight.',
    grip: 'pressure',
  },
  {
    id: 'mistakes',
    title: 'Common mistakes',
    say: 'Check for these mistakes. The wrong hand on top. Hands far apart on the handle. The handle deep in the palm instead of in the fingers. Both Vs pointing at the face of the bat. Gripping so tight your knuckles go white.',
    why: 'Each of these turns the face of the bat. Fix them now and every shot gets easier.',
    grip: 'check',
  },
  {
    id: 'check',
    title: 'Your turn: check it with a photo',
    say: 'Now pick up your bat and take your grip. Check your hands every time you pick up the bat: top hand, bottom hand, close together, Vs in a line. The practice camera cannot see your fingers, so take a close photo of your hands on the bat and the AI coach will check your grip for you.',
    why: 'A good grip makes every shot easier. Getting it right each time you pick up the bat turns it into a habit.',
    teaches: ['low'],
    grip: 'check',
  },
];

const STANCE_STEPS: DemoStep[] = [
  {
    id: 'why',
    title: 'Why the stance matters',
    say: 'The stance is how you stand while you wait for the ball.',
    why: 'Every shot starts from it. A balanced, still stance lets you see the ball early and move forward or back quickly. If the stance is wrong, every shot after it is harder.',
    progress: IN_STANCE,
    view: 'front',
    bat: true,
  },
  {
    id: 'side-on',
    title: 'Stand side-on',
    say: 'Stand side-on to the bowler. Your {front} shoulder points down the pitch, straight at the bowler.',
    why: 'Side-on, your body is in line with the ball, so your bat can come down straight.',
    progress: STANDING,
    view: 'front',
    highlight: [LM.L_SHOULDER, LM.R_SHOULDER],
  },
  {
    id: 'feet',
    title: 'Feet',
    say: 'Put your feet about shoulder-width apart, side by side on one line, parallel to the crease. Neither foot is in front of the other. Your toes point to the side, not at the bowler.',
    why: 'Feet apart give you balance. Too close and you wobble. Too wide and you cannot move quickly.',
    teaches: ['feet', 'feetLine', 'toesSide'],
    progress: at({ feet: 1 }),
    view: 'side',
    highlight: [LM.L_ANKLE, LM.R_ANKLE],
  },
  {
    id: 'knees',
    title: 'Knees',
    say: 'Bend your knees a little, as if you were about to sit on a high stool. Watch the number at each knee: from straight, it bends to about 150 degrees.',
    why: 'Bent knees work like springs. You can push off forward or back straight away.',
    teaches: ['knees'],
    progress: at({ feet: 1, knees: 1 }),
    view: 'profile',
    kneeAngles: true,
    highlight: [LM.L_KNEE, LM.R_KNEE],
  },
  {
    id: 'lean',
    title: 'Lean',
    say: 'Lean forward a little from your hips. Keep your back straight and your shoulders level.',
    why: 'Leaning puts your weight on the front of your feet, ready to move. Standing up straight makes you slow.',
    teaches: ['lean', 'shoulders'],
    progress: at({ feet: 1, knees: 1, lean: 1 }),
    view: 'profile',
    highlight: [LM.L_HIP, LM.R_HIP, LM.L_SHOULDER, LM.R_SHOULDER],
  },
  {
    id: 'head',
    title: 'Head',
    say: 'Turn your head to look at the bowler, over your {front} shoulder. Keep your neck straight: do not look up at the sky, down at the ground, or the other way. Both eyes level, head still, between your feet. When you practise, do not look at the phone: look at the bowler and listen to my voice.',
    why: 'Your eyes judge the ball. A still, level head sees it clearly. A tilted or moving head makes the ball seem to move. In a match you never look away from the bowler. The app gives you tips about your head and eyes, but they do not stop a stance from counting.',
    teaches: ['head', 'look', 'neck'],
    progress: at({ feet: 1, knees: 1, lean: 1, head: 1 }),
    view: 'front',
    highlight: [LM.NOSE],
  },
  {
    id: 'hands',
    title: 'Hands and bat',
    say: 'Hold the bat with both hands together on the handle. Keep your hands low and close to your body, near your {front} thigh. Do not push them out in front of you. Rest the toe of the bat on the ground by your {back} toe, or lift it just a little behind you, as many good batters do. Do not hold the bat high, up in the air: I will tell you if you do.',
    why: 'Two hands together work as one and keep the bat straight. Low, relaxed hands let the bat come down straight and quickly. A bat held high in the air makes you tired and slow, and it comes down crooked.',
    teaches: ['hands', 'handsIn', 'batRest'],
    progress: IN_STANCE,
    view: 'side',
    highlight: [LM.L_WRIST, LM.R_WRIST],
    bat: true,
  },
  {
    id: 'mistakes',
    title: 'Common mistakes',
    say: 'Watch out for these beginner mistakes. Feet too close or too wide. One foot in front of the other, instead of side by side on one line. Toes pointing at the bowler. Straight, locked knees. Standing up too straight, or bending over too far. Holding the bat with one hand. The bat held high, up in the air. Looking up, or looking the other way.',
    why: 'Each mistake makes your first movement slower or your bat come down crooked. The camera looks for every one of them and tells you how to fix it.',
    progress: IN_STANCE,
    view: 'side',
    bat: true,
  },
  {
    id: 'checks',
    title: 'What the camera checks',
    say: 'Every time, the camera checks your feet apart, your feet in line, your knees, your lean, your shoulders, your hands, and whether your bat is up in the air. A stance counts when none of these is marked red. It also gives you tips about your head, your eyes and your neck. A tip is spoken, but it does not stop the stance from counting.',
    why: 'Stand where your whole body is in the picture, from head to feet. The phone can be in front of you or at your side; with the phone at your side, keep your face turned to the bowler, not to the phone.',
    progress: IN_STANCE,
    view: 'front',
    bat: true,
  },
  {
    id: 'ready',
    title: 'Your turn',
    say: 'That is the stance. Stay relaxed and still. Now set up your phone. You will do it many times, and I will check each part every time.',
    progress: IN_STANCE,
    view: 'front',
    bat: true,
  },
];

const DEFENCE_STEPS: DemoStep[] = [
  {
    id: 'why',
    title: 'Why the forward defence matters',
    say: 'The forward defence is the shot you play to a good ball that would hit your stumps.',
    why: 'It stops the ball and keeps you in. It is the shot that lets you bat for a long time.',
    defence: IN_DEFENCE,
    view: 'side',
    bat: true,
  },
  {
    id: 'start',
    title: 'Start in your stance',
    say: 'Every forward defence starts from a good stance. I will check your stance first, every time.',
    why: 'If your stance is wrong, your step and your bat will be wrong too.',
    defence: AT_STANCE,
    view: 'side',
    bat: true,
  },
  {
    id: 'step',
    title: 'Step to the ball',
    say: 'Take a long step forward with your {front} foot, towards where the ball lands.',
    why: 'Getting close to the ball stops it turning or bouncing past your bat.',
    teaches: ['stride'],
    defence: def({ step: 1 }),
    view: 'side',
    highlight: [LM.L_ANKLE, LM.R_ANKLE],
    bat: true,
  },
  {
    id: 'knee',
    title: 'Bend the front knee',
    say: 'Bend your front knee. Keep your back leg nearly straight.',
    why: 'Your weight goes onto your front foot, so you are balanced and strong.',
    teaches: ['frontKnee', 'backLeg'],
    defence: def({ step: 1, knee: 1 }),
    view: 'side',
    highlight: [LM.L_KNEE, LM.R_KNEE],
    bat: true,
  },
  {
    id: 'head',
    title: 'Head down, over the knee',
    say: 'Lean into the shot. Bring your head forward and down, over your front knee, with your eyes over the ball, next to your front pad. Do not keep your head up.',
    why: 'With your head down over the ball you can watch it all the way onto the bat and keep it on the ground. A head that stays up pulls the bat up, and the ball goes in the air.',
    teaches: ['headOver', 'headDown', 'leanIn'],
    defence: def({ step: 1, knee: 1, head: 1 }),
    view: 'front',
    highlight: [LM.NOSE],
    bat: true,
  },
  {
    id: 'bat',
    title: 'Bat by the pad',
    say: 'Keep both hands on the handle. Bring the bat down close to your front pad, angled down, with the handle ahead of the blade and your {front} elbow high.',
    why: 'No gap between bat and pad means the ball cannot get through. The angled bat and high elbow keep the ball down, away from the catchers. Both hands together keep the face of the bat straight.',
    teaches: ['batPad', 'elbow', 'batTilt'],
    defence: IN_DEFENCE,
    view: 'side',
    highlight: [LM.L_ELBOW, LM.R_ELBOW],
    bat: true,
  },
  {
    id: 'mistakes',
    title: 'Common mistakes',
    say: 'Watch out for these mistakes. A short step that does not reach the ball. A straight front knee. The head up, or behind the front knee, leaning back. A gap between the bat and the pad. The bat coming down across the body instead of straight. The face of the bat pointing up. Letting go with one hand.',
    why: 'Each one lets the ball through to the stumps, or sends it up in the air to a catcher. The camera checks your step, your front knee, your back leg, your head over the knee, your head down, your lean, the bat by the pad, your elbow and a straight bat.',
    defence: IN_DEFENCE,
    view: 'side',
    bat: true,
  },
  {
    id: 'ready',
    title: 'Your turn',
    say: 'Hold the shot for two seconds, then go back to your stance. Each time, I check your stance first, then your defence.',
    defence: IN_DEFENCE,
    view: 'front',
    bat: true,
  },
];

const drv = (p: Partial<DriveProgress>): DriveProgress => ({ ...DRIVE_START, ...p });

const DRIVE_STEPS: DemoStep[] = [
  {
    id: 'why',
    title: 'Why the drive matters',
    say: 'The front-foot drive is the shot you play to a full ball, one that lands close to you.',
    why: 'It is the safest way to score runs: the ball goes along the ground, straight back past the bowler or through the off side.',
    drive: IN_DRIVE,
    view: 'side',
    bat: true,
  },
  {
    id: 'start',
    title: 'Start in your stance',
    say: 'Every drive starts from a good stance. I will check your stance first, every time.',
    why: 'A good stance lets you see the ball early and move into it.',
    drive: DRIVE_START,
    view: 'side',
    bat: true,
  },
  {
    id: 'step',
    title: 'Step to the ball',
    say: 'Take a long step forward with your {front} foot, to where the ball lands.',
    why: 'Getting close to the ball lets you hit it along the ground.',
    teaches: ['stride'],
    drive: drv({ step: 1 }),
    view: 'side',
    highlight: [LM.L_ANKLE, LM.R_ANKLE],
    bat: true,
  },
  {
    id: 'head',
    title: 'Head and front knee',
    say: 'Bend your front knee and bring your head over it. Keep your back leg long.',
    why: 'With your head over the ball you hit it down, not up in the air.',
    teaches: ['frontKnee', 'backLeg', 'headOver'],
    drive: drv({ step: 1, knee: 1, head: 1 }),
    view: 'front',
    highlight: [LM.NOSE, LM.L_KNEE, LM.R_KNEE],
    bat: true,
  },
  {
    id: 'hit',
    title: 'Swing straight',
    say: 'With both hands on the handle, swing the bat straight down, and meet the ball next to your front pad.',
    why: 'A straight swing gives the ball the full face of the bat. Both hands together keep the face straight.',
    drive: drv({ step: 1, knee: 1, head: 1, swing: 0.5 }),
    view: 'side',
    highlight: [LM.L_WRIST, LM.R_WRIST],
    bat: true,
  },
  {
    id: 'finish',
    title: 'Finish high',
    say: 'Keep swinging through the ball and finish high, with the bat over your {front} shoulder and your {front} elbow up.',
    why: 'A full, high finish means you swung through the ball, not at it. That gives the shot its power and direction.',
    teaches: ['finish', 'elbowUp', 'batFinish'],
    drive: IN_DRIVE,
    view: 'side',
    highlight: [LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST],
    bat: true,
  },
  {
    id: 'mistakes',
    title: 'Common mistakes',
    say: 'Watch out for these mistakes. Swinging before you step. Leaning back, so the ball goes up in the air. Swinging across the body instead of straight. Stopping the swing at the ball instead of finishing high. Letting go with one hand.',
    why: 'Each one sends the ball in the air or to the wrong place. The camera checks your step, front knee, back leg, head, a high finish, your elbow and the bat.',
    drive: IN_DRIVE,
    view: 'side',
    bat: true,
  },
  {
    id: 'ready',
    title: 'Your turn',
    say: 'Hold your finish for two seconds, then go back to your stance. Each time, I check your stance first, then your drive.',
    drive: IN_DRIVE,
    view: 'front',
    bat: true,
  },
];

export const DEMO_STEPS: Record<Skill, DemoStep[]> = { grip: GRIP_STEPS, stance: STANCE_STEPS, defence: DEFENCE_STEPS, drive: DRIVE_STEPS, ...SHOT_DEMO_STEPS };

/** The step of the demonstration that teaches a check, for "watch that step again". */
export function stepForCheck(skill: Skill, check: CheckId): number {
  const i = DEMO_STEPS[skill].findIndex((s) => s.teaches?.includes(check));
  return i < 0 ? 0 : i;
}

/** What one day's practice of a skill is, explained before it starts. */
export type PracticePlan = {
  /** What the learner will do, in one sentence. */
  what: string;
  /** How long it takes. */
  time: string;
  /** What is needed and how to set up the space. */
  space: string[];
  /** One repetition, step by step. */
  rep: string[];
};

export type SkillInfo = {
  /** Shown in lists: "The grip". */
  name: string;
  /** Used in sentences: "your grip". */
  noun: string;
  summary: string;
  /** Why the skill matters, in one or two sentences, shown on the practice path. */
  why: string;
  /** The lesson to read about this skill. */
  lessonId: string;
  /** Today's practice, explained before it starts. */
  plan: PracticePlan;
  /** How to set up the phone, in order. */
  setup: string[];
  /** How far from the phone to stand. */
  distance: string;
  /** Shown while the camera waits to see the learner. */
  waiting: string;
  waitingDetail: string;
  /** Shown and spoken after each good repetition: how to come out of position. */
  relax: string;
  /** Spoken when the learner has relaxed and can do the next repetition. */
  again: string;
  /** Spoken when the set of repetitions is finished. */
  setDone: string;
  /** Things the camera cannot see, for the learner to check themselves. */
  selfCheck: string[];
};

const PHONE_SIDE = [
  'Lean the phone upright against something steady, about waist high.',
  'Decide where the bowler is. Stand side-on to the bowler, with your {front} shoulder pointing at them.',
  'The phone is not the bowler. Put it where your chest points, about 3 metres away. That is 4 big steps.',
  'Check your whole body is in the picture, from head to feet.',
  'While you practise, look at the bowler, not at the phone. You do not need to see the screen: the voice tells you what to fix and counts each good one.',
];

export const SKILL_INFO: Record<Skill, SkillInfo> = {
  ...SHOT_INFO,
  grip: {
    name: 'The grip',
    noun: 'grip',
    summary: 'How to hold the bat.',
    why: 'The grip decides which way the face of the bat points. Get it right and the ball goes where you aim.',
    lessonId: 'grip',
    plan: {
      what: 'Learn the grip. The camera does not check it: check your own hands every time you pick up the bat.',
      time: 'About 5 minutes',
      space: ['A bat, or a stick about as long as your leg.', 'A space about 2 metres long in front of the phone, with good light.'],
      rep: ['Hold the bat upright in front of you, toe on the ground.', 'Put your hands on: top hand, then bottom hand, close together.', 'Hold still until you hear the count.', 'Let go with your bottom hand, then start again.'],
    },
    setup: [
      'Lean the phone upright against something steady, about waist high.',
      'Stand facing the phone, about 2 metres away. That is 3 big steps.',
      'Hold the bat upright in front of you with both hands, with its toe on the ground.',
      'Check the phone can see you from your head to your knees.',
      'Turn the sound up and switch silent mode off.',
    ],
    distance: '2 m',
    waiting: 'Stand facing the phone and hold the bat in front of you',
    waitingDetail: 'About 2 metres away, so the phone sees you from head to knees.',
    relax: 'Now let go with your bottom hand.',
    again: 'Again. Take your grip.',
    setDone: 'That is all your grips done. Well played.',
    selfCheck: [
      'The two Vs made by your thumbs and first fingers are in one line down the back of the bat.',
      'Your top hand holds firmly. Your bottom hand is loose enough to slide.',
      'Not sure? Take a photo of your grip and the AI coach will check it.',
    ],
  },
  stance: {
    name: 'The stance',
    noun: 'stance',
    summary: 'How to stand while you wait for the ball.',
    why: 'Every shot starts from the stance. Balanced and still, you see the ball early and move quickly.',
    lessonId: 'stance',
    plan: {
      what: 'Good stances: 10 on day 1, 20 on day 2, 30, 40, and 50 on day 5. Take your stance, hold it still, stand up, and again. The camera checks your feet apart, feet in line, knees, lean, shoulders, hands and the bat every time; it also gives tips about your head, eyes and neck.',
      time: 'About 5 minutes',
      space: ['A real bat if you have one: the app checks the bat too. It sees it best against a plain wall of a different colour.', 'A flat space about 3 metres by 2 metres, with good light.', 'Mark where the bowler would be: a shoe or a bottle on the ground works.'],
      rep: ['Take your stance, side-on to the bowler.', 'Hold still until you hear the count.', 'Stand up straight and relax for a moment.', 'Take your stance again.'],
    },
    setup: [...PHONE_SIDE, 'Turn the sound up and switch silent mode off.'],
    distance: '3 m',
    waiting: 'Take your stance with your chest towards the phone',
    waitingDetail: 'About 3 metres away, with your whole body in the picture. Look at the bowler, not at the phone, and listen.',
    relax: 'Now relax. Stand up straight.',
    again: 'Again. Take your stance.',
    setDone: 'That is all your stances done. Well played.',
    selfCheck: [],
  },
  defence: {
    name: 'The forward defence',
    noun: 'forward defence',
    summary: 'The shot that stops a good ball.',
    why: 'It keeps a good ball off your stumps. It is the shot that lets you bat for a long time.',
    lessonId: 'forward-defence',
    plan: {
      what: 'The forward defence in 2 parts: footwork, then the whole shot (eyes, bat and knee are checked inside it). Each part 10 times on day 1, 20 on day 2, up to 50 on day 5. Every step starts with a quick stance check: if your stance is good you go straight on.',
      time: 'About 10 minutes',
      space: ['A real bat if you have one: the app checks the bat too. It sees it best against a plain wall of a different colour.', 'A flat space about 4 metres by 2 metres: you need room to step forward towards the bowler.', 'Mark where the bowler would be. No ball is needed for this practice.'],
      rep: ['Take your stance and hold it until you hear "Go".', 'Step forward with your {front} foot into the forward defence.', 'Hold the shot still for 2 seconds.', 'Step back into your stance for the next one.'],
    },
    setup: [...PHONE_SIDE, 'Leave room in front of you to step towards the bowler.', 'Turn the sound up and switch silent mode off.'],
    distance: '4 m',
    waiting: 'Take your stance with your chest towards the phone',
    waitingDetail: 'About 4 metres away, so your whole body and your step forward stay in the picture.',
    relax: 'Now go back to your stance.',
    again: 'Go. Play the forward defence and hold it.',
    setDone: 'That is all your forward defences done. Well played.',
    selfCheck: ['The face of the bat points at the ground in front of you, so the ball would go down.', 'You can feel your weight on your front foot.'],
  },
  drive: {
    name: 'The front-foot drive',
    noun: 'drive',
    summary: 'The shot that scores runs off a full ball.',
    why: 'It sends a full ball along the ground for runs. The safest way to score.',
    lessonId: 'front-foot-drive',
    plan: {
      what: 'Front-foot drives. Each one starts from your stance, which is checked first. Then step forward, swing through and hold a high finish.',
      time: 'About 10 minutes',
      space: ['A real bat if you have one: the app checks the bat too. It sees it best against a plain wall of a different colour.', 'A flat space about 4 metres by 3 metres: you swing the bat, so keep away from people, walls and windows.', 'No ball is needed for this practice.'],
      rep: ['Take your stance and hold it until you hear "Go".', 'Step forward with your {front} foot and swing the bat straight through.', 'Hold your high finish still for 2 seconds.', 'Step back into your stance for the next one.'],
    },
    setup: [...PHONE_SIDE, 'Leave room in front of you to step forward, and room to swing the bat.', 'Turn the sound up and switch silent mode off.'],
    distance: '3 m',
    waiting: 'Take your stance with your chest towards the phone',
    waitingDetail: 'About 3 metres away, with room to step forward and swing.',
    relax: 'Now go back to your stance.',
    again: 'Go. Play the drive and hold your finish.',
    setDone: 'That is all your drives done. Well played.',
    selfCheck: ['The bat came down straight, not across your body.', 'Your head stayed still and over your front knee.'],
  },
};

/** What to show and say when the phone is in the wrong place. */
export const CAMERA_PROBLEM_MESSAGE = {
  'side-on': {
    title: 'Turn your chest to the phone',
    detail: 'Stay side-on to the bowler. The phone goes where your chest points, not where the bowler is.',
    say: 'I can only see your side. Turn so your chest faces the phone.',
  },
  'chest-on': {
    title: 'Stand side-on to the phone',
    detail: 'The phone is where the bowler would be. Point your {front} shoulder at it and turn your head to look at it.',
    say: 'Do not face the phone. Stand side-on, with your front shoulder pointing at the phone, like a batter facing the bowler.',
  },
  back: {
    title: 'I can see your back',
    detail: 'Turn round, or move the phone to your other side, so it sees your chest.',
    say: 'I can see your back. Turn round so your chest faces the phone.',
  },
} as const;
