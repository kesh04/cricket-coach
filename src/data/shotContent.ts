import type { Lesson } from '@/data/curriculum';
import type { DemoStep, SkillInfo } from '@/data/skills';
import { LM } from '@/lib/pose/landmarks';
import { SHOT_END, SHOT_START, type ShotId, type ShotProgress } from '@/lib/pose/shotPoses';

/**
 * Everything the app teaches for the other basic shots: back-foot defence, pull, cut and sweep.
 * For each shot there is the watch-and-listen demonstration (the 3D batter, step by step), the
 * practice plan, the lesson with its quiz, and the common mistakes. The drive and the forward
 * defence are in skills.ts.
 */
const sp = (p: Partial<ShotProgress>): ShotProgress => ({ ...SHOT_START, ...p });

const PHONE = [
  'Lean the phone upright against something steady, about waist high.',
  'Stand side-on to the bowler, with your {front} shoulder pointing at them.',
  'Put the phone where your chest points, about 4 metres away. That is 5 big steps. Move it a little towards the bowler (about 30 degrees) if the shot is cut off.',
  'Check your whole body is in the picture, from head to feet, with room on both sides for your step.',
  'Look at the bowler, not at the phone. You do not need to see the screen: the voice tells you what to fix and counts each good one.',
];

type Shot = {
  skill: ShotId;
  info: Omit<SkillInfo, 'setup' | 'distance' | 'waiting' | 'waitingDetail' | 'relax' | 'again' | 'setDone'> & { waitingDetail?: string; relax: string; again: string; setDone: string };
  steps: DemoStep[];
  lesson: Lesson;
};

const END = SHOT_END;
const bat = true;

const SHOTS: Shot[] = [
  {
    skill: 'backdefence',
    info: {
      name: 'The back-foot defence',
      noun: 'back-foot defence',
      summary: 'Stopping a shorter ball that rises towards your chest.',
      why: 'When the ball bounces short, going forward is dangerous. Going back gives you time to see it and get your bat in front of it.',
      lessonId: 'back-foot-defence',
      plan: {
        what: 'Back-foot defences. Each one starts from your stance, which is checked first. Then step back and across, put your weight on the back foot, and hold the shot.',
        time: 'About 5 minutes',
        space: ['A real bat if you have one, or a stick.', 'A flat space about 4 metres by 2 metres, with good light.', 'No ball is needed for this practice.'],
        rep: ['Take your stance and hold it until you hear "Go".', 'Step back and across with your {back} foot.', 'Weight on the back foot, head over it, bat straight in front, {front} elbow high. Hold it for 2 seconds.', 'Step back into your stance.'],
      },
      selfCheck: ['Your bat is straight, with its face angled down, and close to your body.', 'Your eyes stay on the ball, level and still.', 'The ball would drop at your feet, not pop up.'],
      relax: 'Now go back to your stance.',
      again: 'Go. Step back and across, and hold the defence.',
      setDone: 'That is all your back-foot defences done. Well played.',
    },
    steps: [
      { id: 'why', title: 'Why go back?', say: 'Back-foot defence is for the shorter ball, the one that bounces further from you and rises towards your chest.', why: 'Going back gives you more time to see the ball. Going forward to a short ball is how people get hit.', shot: END, view: 'side', bat },
      { id: 'start', title: 'Start in your stance', say: 'Every shot starts from a good stance. I check your stance first, every time.', why: 'A good stance lets you move back or forward quickly.', shot: SHOT_START, view: 'side', bat },
      { id: 'back', title: 'Back and across', say: 'Step back and across with your {back} foot, towards the stumps. Keep the foot pointing to the side.', why: 'Moving back gives you time. Moving across puts your eyes in line with the ball.', teaches: ['shortStep'], shot: sp({ step: 1 }), view: 'side', highlight: [LM.L_ANKLE, LM.R_ANKLE], bat },
      { id: 'weight', title: 'Weight on the back foot', say: 'Put your weight on your back foot, with your head over it. Keep your {front} leg light and your back knee only a little bent.', why: 'A head over the back foot means your eyes are level with the ball as it bounces and rises.', teaches: ['weightBack', 'frontLight', 'backKnee'], shot: sp({ step: 1, knee: 1, head: 1 }), view: 'side', highlight: [LM.NOSE, LM.L_KNEE, LM.R_KNEE], bat },
      { id: 'bat', title: 'Bat straight, elbow high', say: 'Hold the bat straight in front of your body, with your {front} elbow high and soft hands.', why: 'A high elbow keeps the bat straight. Soft hands let the ball drop at your feet instead of popping up.', teaches: ['elbow'], shot: END, view: 'side', highlight: [LM.L_ELBOW, LM.L_WRIST, LM.R_WRIST], bat },
      { id: 'mistakes', title: 'Common mistakes', say: 'Watch out for these mistakes. Staying on the front foot. Falling away to the off side. Crouching too low. Hard hands that push the ball up. Letting the bat drift away from your body.', why: 'The camera checks your back step, your weight, your front leg, your back knee and your elbow.', shot: END, view: 'side', bat },
      { id: 'ready', title: 'Your turn', say: 'Hold your defence for two seconds, then go back to your stance. Each time I check your stance first, then your shot.', shot: END, view: 'front', bat },
    ],
    lesson: null as unknown as Lesson, // the lesson already exists in curriculum.ts; it only gains a practice link
  },
  {
    skill: 'pull',
    info: {
      name: 'The pull shot',
      noun: 'pull',
      summary: 'Hitting a short ball round to the leg side.',
      why: 'The pull turns a short ball into runs. It must be played to a ball that bounces short and rises to your waist or chest, never to a full ball.',
      lessonId: 'pull-shot',
      plan: {
        what: 'Pull shots without a ball. Each one starts from your stance, which is checked first. Then step back and across, turn your body and finish with your hands high.',
        time: 'About 5 minutes',
        space: ['A real bat if you have one: the app checks the bat too.', 'A flat space about 4 metres by 3 metres: you turn and swing, so keep away from people, walls and windows.', 'No ball is needed. Against a real fast ball, wear a helmet.'],
        rep: ['Take your stance and hold it until you hear "Go".', 'Step back and across with your {back} foot.', 'Turn your body to the leg side and swing, hands finishing high and across.', 'Hold the finish for 2 seconds, then step back into your stance.'],
      },
      selfCheck: ['You turned your body round: your chest faces the leg side at the end.', 'Your eyes stayed on the ball until you hit it.', 'You are balanced and could walk away from the finish.'],
      relax: 'Now go back to your stance.',
      again: 'Go. Step back, turn and pull, and hold your finish.',
      setDone: 'That is all your pull shots done. Well played.',
    },
    steps: [
      { id: 'why', title: 'Why the pull?', say: 'The pull shot is for a short ball, one that bounces high and rises to your waist or chest. You turn and hit it round to the leg side.', why: 'It scores runs off short balls. Played to a full ball it is risky, so choose your ball first.', shot: END, view: 'side', bat },
      { id: 'start', title: 'Start in your stance', say: 'Every shot starts from a good stance. I check your stance first, every time.', why: 'A balanced start lets you see the short ball early.', shot: SHOT_START, view: 'side', bat },
      { id: 'back', title: 'Back and across', say: 'Step back and across with your {back} foot, and shift your weight onto it.', why: 'Moving back gives you time, and puts you in line with the ball.', teaches: ['shortStep', 'weightBack'], shot: sp({ step: 1 }), view: 'side', highlight: [LM.L_ANKLE, LM.R_ANKLE], bat },
      { id: 'turn', title: 'Turn your body', say: 'Turn on your back foot so your chest and shoulders swing round towards the leg side. Keep your head still and your eyes on the ball.', why: 'The turn gives the shot its power. A still head keeps you balanced and your eyes level.', teaches: ['frontLight', 'backKnee'], shot: sp({ step: 1, knee: 1, head: 1 }), view: 'front', highlight: [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP], bat },
      { id: 'swing', title: 'Swing and finish high', say: 'Swing the bat in a flat arc and finish with your hands high, across your body, with your {front} elbow up.', why: 'Rolling the wrists over at the end keeps the ball down. A high, full finish means you swung through the ball.', teaches: ['highHands', 'elbowUp'], shot: END, view: 'front', highlight: [LM.L_ELBOW, LM.L_WRIST, LM.R_WRIST], bat },
      { id: 'mistakes', title: 'Common mistakes', say: 'Watch out for these mistakes. Pulling a full ball. Falling over to the off side. Lifting your head. Leaning back. Not turning, so you only wave the bat at it.', why: 'The camera checks your back step, your weight, your front leg, your back knee, your hands and your elbow.', shot: END, view: 'side', bat },
      { id: 'ready', title: 'Your turn', say: 'Hold your finish for two seconds, then go back to your stance. Each time I check your stance first, then your shot.', shot: END, view: 'front', bat },
    ],
    lesson: {
      id: 'pull-shot',
      level: 3,
      title: 'The pull shot',
      summary: 'Turning a short ball round to the leg side.',
      minutes: 5,
      practice: 'pull',
      sections: [
        { heading: 'Pick the right ball', text: 'Pull only a short ball: one that bounces well in front of you and rises to your waist or chest. Never pull a full ball. If you are not sure, play a back-foot defence.' },
        { heading: 'Back and across', text: 'Step back and across with your {back} foot, and put your weight on it. This gives you time and gets your eyes in line with the ball.' },
        { heading: 'Turn and swing', text: 'Turn on your back foot so your chest faces the leg side. Swing the bat in a flat arc, with your {front} elbow high, and roll your wrists over so the ball goes down.' },
        { heading: 'Stay balanced', text: 'Keep your head still, eyes on the ball, and finish with your hands high. If you are falling over, you reached for the ball: step back more.' },
      ],
      keyPoints: ['Only pull a short ball', 'Step back and across, weight on the {back} foot', 'Turn the body, keep the head still', 'Roll the wrists over, finish high'],
      remedial: { heading: 'One thing at a time', points: ['First the feet: back and across with the {back} foot, no bat.', 'Then add the turn: shoulders round, head still.', 'Then the swing: flat arc, hands finishing high.'] },
      quiz: [
        { q: 'Which ball do you pull?', options: ['A full ball', 'A short ball that rises to waist or chest', 'Any ball'], answer: 1, why: 'A pull needs the ball to come up to a height you can swing across.' },
        { q: 'Where does your weight go?', options: ['On the front foot', 'On the back foot', 'Leaning to the off side'], answer: 1, why: 'Weight back gives you time and balance.' },
        { q: 'What keeps the ball down?', options: ['Rolling the wrists over', 'Looking up early', 'Hitting it very late'], answer: 0, why: 'Rolling the wrists keeps the face closed and the ball along the ground.' },
        { q: 'What should your head do?', options: ['Fall to the off side', 'Stay still, eyes on the ball', 'Look at the fielders'], answer: 1, why: 'A still head keeps you balanced.' },
      ],
    },
  },
  {
    skill: 'cut',
    info: {
      name: 'The square cut',
      noun: 'cut',
      summary: 'Cutting a short, wide ball past point.',
      why: 'The cut scores runs off a short ball that is wide of your off stump. Cut only balls that are wide, so the bat has room to swing.',
      lessonId: 'square-cut',
      plan: {
        what: 'Cut shots without a ball. Each one starts from your stance, which is checked first. Then step back and across, reach out with your arms and hold the finish.',
        time: 'About 5 minutes',
        space: ['A real bat if you have one: the app checks the bat too.', 'A flat space about 4 metres by 3 metres: you reach out to the off side, so keep away from people, walls and windows.', 'No ball is needed for this practice.'],
        rep: ['Take your stance and hold it until you hear "Go".', 'Step back and across with your {back} foot.', 'Reach out to the off side with both arms and cut down on the ball. Hold the finish for 2 seconds.', 'Step back into your stance.'],
      },
      selfCheck: ['The ball is wide of you: you have room to extend your arms.', 'Your head is still and your eyes are on the ball.', 'You hit the ball down, with the bat going from high to low.'],
      relax: 'Now go back to your stance.',
      again: 'Go. Step back, reach out and cut, and hold your finish.',
      setDone: 'That is all your cuts done. Well played.',
    },
    steps: [
      { id: 'why', title: 'Why the cut?', say: 'The square cut is for a short ball that is wide of your off stump. You hit it out to the off side, square of the wicket.', why: 'Wide balls give you room to swing your arms. A ball close to your body is not a cut: play a defence instead.', shot: END, view: 'side', bat },
      { id: 'start', title: 'Start in your stance', say: 'Every shot starts from a good stance. I check your stance first, every time.', why: 'A balanced start lets you see the ball early.', shot: SHOT_START, view: 'side', bat },
      { id: 'back', title: 'Back and across', say: 'Step back and across with your {back} foot, towards the ball, and keep side-on.', why: 'Going back gives you time. Staying side-on keeps your shoulders and the bat in line.', teaches: ['shortStep', 'weightBack'], shot: sp({ step: 1 }), view: 'side', highlight: [LM.L_ANKLE, LM.R_ANKLE], bat },
      { id: 'weight', title: 'Weight on the back foot', say: 'Weight on your back foot, your {front} leg light, and your back knee a little bent.', why: 'A steady base lets you swing your arms freely without falling.', teaches: ['frontLight', 'backKnee'], shot: sp({ step: 1, knee: 1, head: 1 }), view: 'side', highlight: [LM.NOSE, LM.L_KNEE, LM.R_KNEE], bat },
      { id: 'reach', title: 'Reach out and cut down', say: 'Reach out to the ball with both arms, hands high, and cut down on it. Your head stays still.', why: 'Hitting down on the ball keeps it along the ground. Arms out gives the shot its power.', teaches: ['highHands', 'reach'], shot: END, view: 'front', highlight: [LM.L_WRIST, LM.R_WRIST, LM.L_ELBOW, LM.R_ELBOW], bat },
      { id: 'mistakes', title: 'Common mistakes', say: 'Watch out for these mistakes. Cutting a ball that is too close to you. Cutting a full ball. Cutting too early. Lifting your head. Standing on your toes and falling over.', why: 'The camera checks your back step, your weight, your legs, your hands and how far your arms reach out.', shot: END, view: 'side', bat },
      { id: 'ready', title: 'Your turn', say: 'Hold your finish for two seconds, then go back to your stance. Each time I check your stance first, then your shot.', shot: END, view: 'front', bat },
    ],
    lesson: {
      id: 'square-cut',
      level: 3,
      title: 'The square cut',
      summary: 'Hitting a wide, short ball out to the off side.',
      minutes: 5,
      practice: 'cut',
      sections: [
        { heading: 'Pick the right ball', text: 'Cut a short ball that is wide of your off stump. If the ball is close to your body, there is no room to swing: play a back-foot defence.' },
        { heading: 'Back and across', text: 'Step back and across with your {back} foot, and stay side-on. Your weight goes on the back foot.' },
        { heading: 'Reach and cut down', text: 'Reach out to the ball with both arms and cut down on it, from high to low. The ball goes square of the wicket on the off side.' },
        { heading: 'Stay still', text: 'Keep your head still and your eyes on the ball. Wait for it: cutting too early is the most common mistake.' },
      ],
      keyPoints: ['Only cut a wide, short ball', 'Step back and across, stay side-on', 'Reach out and cut down on the ball', 'Head still, wait for the ball'],
      remedial: { heading: 'One thing at a time', points: ['First the feet: back and across with the {back} foot.', 'Then the reach: both arms out to the off side.', 'Then the cut: from high to low, head still.'] },
      quiz: [
        { q: 'Which ball do you cut?', options: ['A full ball on the stumps', 'A short ball wide of off stump', 'A ball at your body'], answer: 1, why: 'A wide ball gives you room to swing your arms.' },
        { q: 'Which way does the bat travel?', options: ['Low to high', 'High to low, cutting down', 'Along the ground only'], answer: 1, why: 'Cutting down keeps the ball along the ground.' },
        { q: 'What is the most common mistake?', options: ['Cutting too early', 'Waiting too long', 'Having a still head'], answer: 0, why: 'Waiting for the ball lets you cut it late and under control.' },
      ],
    },
  },
  {
    skill: 'sweep',
    info: {
      name: 'The sweep',
      noun: 'sweep',
      summary: 'Getting down to a spinner and sweeping to the leg side.',
      why: 'The sweep is the answer to a slow, full ball on or just outside leg stump, when you cannot drive. It is a spin shot: do not play it against fast bowlers.',
      lessonId: 'sweep-shot',
      plan: {
        what: 'Sweeps without a ball. Each one starts from your stance, which is checked first. Then step to the ball, get low, put your head over your front knee and sweep with your hands low.',
        time: 'About 5 minutes',
        space: ['A real bat if you have one: the app checks the bat too.', 'A flat, soft space about 4 metres by 3 metres: you get down low, so use a mat or a carpet.', 'No ball is needed. Against a real ball, wear a helmet.'],
        rep: ['Take your stance and hold it until you hear "Go".', 'Step forward with your {front} foot, bending the front knee deeply.', 'Get low, head over the front knee, and sweep with your hands low. Hold the finish for 2 seconds.', 'Step back into your stance.'],
      },
      selfCheck: ['You got your head right over the ball, not leaning back.', 'The bat is close to the ground when you hit.', 'You can stand up and balance after the shot.'],
      relax: 'Now go back to your stance.',
      again: 'Go. Step forward, get low and sweep, and hold your finish.',
      setDone: 'That is all your sweeps done. Well played.',
    },
    steps: [
      { id: 'why', title: 'Why the sweep?', say: 'The sweep is a shot for a slow bowler. You get right down to a full ball on the stumps or leg stump and sweep it round to the leg side.', why: 'It stops you being tied down by a spinner. Never sweep a fast bowler.', shot: END, view: 'side', bat },
      { id: 'start', title: 'Start in your stance', say: 'Every shot starts from a good stance. I check your stance first, every time.', why: 'A balanced start lets you read the spin.', shot: SHOT_START, view: 'side', bat },
      { id: 'step', title: 'Step to the ball', say: 'Step forward with your {front} foot, to where the ball will bounce.', why: 'Getting to the pitch of the ball means you hit it before it can turn.', teaches: ['stride'], shot: sp({ step: 1 }), view: 'side', highlight: [LM.L_ANKLE, LM.R_ANKLE], bat },
      { id: 'low', title: 'Get low', say: 'Bend your front knee deeply and sit down low, with your back knee close to the ground.', why: 'Being low puts your head level with the ball and lets you sweep along the ground.', teaches: ['sweepKnee', 'crouch'], shot: sp({ step: 1, knee: 1 }), view: 'side', highlight: [LM.L_KNEE, LM.R_KNEE, LM.L_HIP, LM.R_HIP], bat },
      { id: 'head', title: 'Head over the knee', say: 'Put your head down over your front knee, eyes on the ball.', why: 'Your head over the ball keeps you balanced and the shot under control.', teaches: ['headOver'], shot: sp({ step: 1, knee: 1, head: 1 }), view: 'side', highlight: [LM.NOSE, LM.L_KNEE], bat },
      { id: 'sweep', title: 'Sweep with low hands', say: 'Sweep the bat along the ground, with your hands low, and roll your wrists over so the ball goes down.', why: 'A low bat and rolled wrists keep the ball on the ground, and safe from catches.', teaches: ['lowHands'], shot: END, view: 'side', highlight: [LM.L_WRIST, LM.R_WRIST], bat },
      { id: 'mistakes', title: 'Common mistakes', say: 'Watch out for these mistakes. Sweeping a fast bowler. Sweeping a ball that is wide or short. Standing up, so the ball goes in the air. Falling backwards. Sweeping too early.', why: 'The camera checks your step, your front knee, how low you are, your head and your hands.', shot: END, view: 'side', bat },
      { id: 'ready', title: 'Your turn', say: 'Hold your finish for two seconds, then go back to your stance. Each time I check your stance first, then your shot.', shot: END, view: 'front', bat },
    ],
    lesson: {
      id: 'sweep-shot',
      level: 3,
      title: 'The sweep',
      summary: 'Sweeping a slow full ball round to the leg side.',
      minutes: 5,
      practice: 'sweep',
      sections: [
        { heading: 'Pick the right ball', text: 'Sweep a slow ball, bowled by a spinner, that is full on the stumps or leg stump. Do not sweep a fast bowler, or a ball that is wide or short.' },
        { heading: 'Step and get low', text: 'Step forward with your {front} foot and bend your {front} knee deeply. Your back knee goes close to the ground. Get right down.' },
        { heading: 'Head over the ball', text: 'Put your head over your {front} knee and watch the ball closely. Your eyes stay level.' },
        { heading: 'Sweep along the ground', text: 'Sweep the bat from low to low, along the ground, with your hands low. Roll your wrists over so the ball goes down.' },
      ],
      keyPoints: ['Only sweep a slow, full ball', 'Bend the {front} knee deeply, get low', 'Head over the front knee', 'Hands low, roll the wrists'],
      remedial: { heading: 'One thing at a time', points: ['First the step and the knee bend: get low without a bat.', 'Then the head: down over the front knee.', 'Then the sweep: low hands along the ground.'] },
      quiz: [
        { q: 'Which bowler do you sweep?', options: ['A fast bowler', 'A spinner', 'Any bowler'], answer: 1, why: 'A slow ball gives you time to get down and sweep.' },
        { q: 'Why get low?', options: ['To hit it in the air', 'To put your eyes level with the ball and sweep along the ground', 'To hide from the fielders'], answer: 1, why: 'Low and level keeps the ball on the ground.' },
        { q: 'Where should your head be?', options: ['Over the front knee', 'Leaning back', 'Looking at the sky'], answer: 0, why: 'Head over the ball keeps you balanced.' },
        { q: 'What do your hands do?', options: ['Go very high', 'Stay low, wrists rolling over', 'Let go of the bat'], answer: 1, why: 'Low hands and rolled wrists keep the ball down.' },
      ],
    },
  },
];

const WAITING = (n: string) => `Take your stance with your chest towards the phone, then play your ${n}`;

export const SHOT_DEMO_STEPS = Object.fromEntries(SHOTS.map((s) => [s.skill, s.steps])) as Record<ShotId, DemoStep[]>;

export const SHOT_INFO = Object.fromEntries(
  SHOTS.map((s) => [
    s.skill,
    {
      ...s.info,
      setup: [...PHONE, 'Leave room in front of you and behind you for your step.', 'Turn the sound up and switch silent mode off.'],
      distance: '4 m',
      waiting: WAITING(s.info.noun),
      waitingDetail: s.info.waitingDetail ?? 'About 4 metres away, so your whole body and your step stay in the picture.',
    } as SkillInfo,
  ]),
) as Record<ShotId, SkillInfo>;

/** New lessons (the back-foot defence lesson already exists in curriculum.ts). */
export const SHOT_LESSONS: Lesson[] = SHOTS.map((s) => s.lesson).filter((l): l is Lesson => !!l);

