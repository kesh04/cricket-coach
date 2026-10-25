import type { Skill } from '@/lib/pose/benchmarks';
import type { Hand } from '@/lib/pose/landmarks';
import { SHOT_LESSONS } from '@/data/shotContent';

/**
 * Learning content.
 *
 * Text can use these placeholders, which are filled in for the learner's batting hand:
 *   {hand}        right / left
 *   {topHand}     the hand nearest the top of the bat handle
 *   {bottomHand}  the lower hand
 *   {front}       the side of the body that points at the bowler (foot, shoulder, leg)
 *   {back}        the other side
 *   {offSide}     where the off side is when you look at the bowler
 *   {legSide}     where the leg side is when you look at the bowler
 */
export type Question = {
  q: string;
  options: string[];
  /** Index of the right option. Use an object when the answer depends on the batting hand. */
  answer: number | { right: number; left: number };
  why: string;
};

export type Lesson = {
  id: string;
  level: number;
  title: string;
  summary: string;
  minutes: number;
  sections: { heading: string; text: string }[];
  keyPoints: string[];
  /** Shown when the quiz is failed, before the learner tries again. */
  remedial: { heading: string; points: string[] };
  quiz: Question[];
  /** The skill on the practice path that this lesson teaches. */
  practice?: Skill;
  /** A tool in the app to try what the lesson teaches, for example the field trainer. */
  tool?: { title: string; text: string; route: string };
};

export type Level = { number: number; title: string; blurb: string };

/** Share of quiz questions that must be right to pass a lesson. */
export const PASS_MARK = 0.7;

export const LEVELS: Level[] = [
  { number: 1, title: 'Know the game', blurb: 'How a match works, how you get out, and the pitch.' },
  { number: 2, title: 'Set up to bat', blurb: 'Grip, stance and backlift. Everything starts here.' },
  { number: 3, title: 'First shots', blurb: 'Defend on the front foot and back foot, then drive.' },
  { number: 4, title: 'Play smart', blurb: 'Running between the wickets and reading the ball.' },
  { number: 5, title: 'The field and the umpire', blurb: 'Where fielders stand and why, powerplays, and how the umpire gives you out.' },
];

const BASE_LESSONS: Lesson[] = [
  {
    id: 'match',
    level: 1,
    title: 'How a match works',
    summary: 'Two teams, runs, overs and innings.',
    minutes: 4,
    sections: [
      {
        heading: 'Two teams of eleven',
        text: 'One team bats and tries to score runs. The other team bowls and fields and tries to get the batters out. Then they swap. Each team’s turn to bat is called an innings.',
      },
      {
        heading: 'Balls and overs',
        text: 'The bowler bowls the ball from one end of the pitch to the batter at the other end. Six fair balls make one over. After each over a different bowler bowls from the opposite end.',
      },
      {
        heading: 'Scoring runs',
        text: 'Two batters are in at a time, one at each end. When they both run to the opposite end, that is one run. If the ball reaches the boundary after touching the ground it is four runs. If it clears the boundary without touching the ground it is six.',
      },
      {
        heading: 'Winning',
        text: 'The team with more runs at the end wins. The batting side’s innings ends when ten batters are out or the overs run out.',
      },
    ],
    keyPoints: ['11 players in a team', '6 fair balls in an over', 'Along the ground to the boundary is 4, over it on the full is 6', 'An innings is one team’s turn to bat'],
    remedial: {
      heading: 'The four numbers to remember',
      points: [
        '11: players in each team.',
        '6: fair balls in one over.',
        '4: the ball reaches the boundary after bouncing.',
        '6: the ball goes over the boundary without bouncing.',
        'An innings is one team’s turn to bat. It is not one ball or one over.',
      ],
    },
    quiz: [
      { q: 'How many players are in a cricket team?', options: ['9', '11', '12'], answer: 1, why: 'Each team has eleven players.' },
      { q: 'How many fair balls are in one over?', options: ['4', '6', '8'], answer: 1, why: 'Six fair balls make an over.' },
      {
        q: 'You hit the ball over the boundary and it does not touch the ground first. How many runs?',
        options: ['4', '6', '2'],
        answer: 1,
        why: 'Over the boundary on the full is six.',
      },
      {
        q: 'What is an innings?',
        options: ['One ball', 'Six balls', 'One team’s turn to bat'],
        answer: 2,
        why: 'An innings is a team’s turn to bat.',
      },
    ],
  },
  {
    id: 'dismissals',
    level: 1,
    title: 'How batters get out',
    summary: 'All 11 ways a batter can be out, from the common ones to the rare ones.',
    minutes: 10,
    sections: [
      {
        heading: 'How "out" works',
        text: 'A batter is out only when the umpire says so. Usually the fielders must first ask the umpire, by shouting "How’s that?" (an appeal); then the umpire raises one finger for out. If you are clearly out, for example bowled, you walk off. When you are out, the next batter comes in. After ten batters are out, the team’s innings is over. There are 11 ways to be out; the first six happen in almost every match.',
      },
      {
        heading: '1. Bowled',
        text: 'The bowler’s ball hits your stumps and knocks off at least one bail. It does not matter if the ball touched your bat or your body on the way. To avoid it: watch the ball, and keep your bat straight and close to your pad when you defend.',
      },
      {
        heading: '2. Caught',
        text: 'You hit the ball with your bat, or it touches the glove on the hand holding the bat, and a fielder or the wicketkeeper catches it before it touches the ground. To avoid it: keep the ball down, play with soft hands, and leave balls far outside off stump that you do not need to play.',
      },
      {
        heading: '3. Leg before wicket (LBW)',
        text: 'The ball hits your leg or pad (not the bat first) and the umpire decides it would have gone on to hit the stumps. A ball that pitches outside your leg stump cannot get you LBW, and if the ball hits you outside the line of off stump you are not out if you were really trying to play it with your bat. To avoid it: get your front foot to the ball and play with the bat in front of your pad.',
      },
      {
        heading: '4. Run out',
        text: 'You are out of your ground, running between the wickets, and a fielder breaks the stumps at your end with the ball. You are "in" only when your bat or a part of your body is grounded behind the crease. The non-striker can also be run out by the bowler if they leave the crease before the bowler lets go of the ball. To avoid it: call clearly ("Yes", "No", "Wait"), run your bat in along the ground, and stay in your crease until the ball is bowled.',
      },
      {
        heading: '5. Stumped',
        text: 'You step out of your crease to play the ball, miss it, and the wicketkeeper breaks the stumps with the ball while you are out of your ground and not trying to run. It is usually off a spinner. To avoid it: keep your back foot behind the crease, or get back quickly when you miss.',
      },
      {
        heading: '6. Hit wicket',
        text: 'You break your own stumps with your bat or your body while playing the ball or setting off for your first run. Batters often do it stepping back too far for a pull or a cut. To avoid it: step back and across, not straight back into the stumps.',
      },
      {
        heading: '7. Hit the ball twice',
        text: 'You hit the ball a second time on purpose, after it has already touched your bat or body, except to stop it hitting your stumps. You may block a ball that is rolling towards your stumps, but not hit it away for runs.',
      },
      {
        heading: '8. Obstructing the field',
        text: 'You stop a fielder on purpose, by word or action: for example you change your running line to block a throw, or you knock the ball away with the hand that is not holding the bat. Since 2017 this also covers touching the ball with your hand on purpose.',
      },
      {
        heading: '9. Handled the ball',
        text: 'This was its own way of being out until 2017: touching the ball on purpose with a hand that is not holding the bat. Today it is given as obstructing the field, but you will still hear the old name, so it is counted here.',
      },
      {
        heading: '10. Timed out',
        text: 'When a batter is out, the next batter must be ready to face the ball (or the other batter must be ready) within 3 minutes, or within 2 minutes in some international matches. If not, the new batter can be given out timed out. Be padded up and ready before it is your turn.',
      },
      {
        heading: '11. Retired out',
        text: 'A batter who leaves the field without the umpire’s permission and without being injured or ill is retired out and cannot come back. A batter who leaves because of injury is "retired hurt" and may bat again later.',
      },
      {
        heading: 'No-balls and free hits',
        text: 'Off a no-ball you cannot be bowled, caught, LBW, stumped or out hit wicket. You can still be run out, out for hitting the ball twice, or out for obstructing the field. The same applies on a free hit.',
      },
    ],
    keyPoints: [
      'The common six: bowled, caught, LBW, run out, stumped, hit wicket',
      'The rare five: hit the ball twice, obstructing the field, handled the ball (now part of obstructing), timed out, retired out',
      'The umpire decides, usually after the fielders appeal',
      'Off a no-ball only run out, hit the ball twice and obstructing the field can get you out',
    ],
    remedial: {
      heading: 'Ask these questions, in order',
      points: [
        'Did the bowled ball hit the stumps? Bowled.',
        'Did a fielder catch it off your bat or glove before it bounced? Caught.',
        'Did your pad stop a ball that would have hit the stumps? LBW.',
        'Were you running and out of your ground when the stumps were broken? Run out.',
        'Did you miss, step out, and the keeper broke the stumps? Stumped.',
        'Did you knock your own stumps playing the ball? Hit wicket.',
        'Anything else is rare: hitting it twice, blocking a fielder, not coming in within 3 minutes, or leaving without permission.',
      ],
    },
    quiz: [
      {
        q: 'The ball misses your bat, hits the stumps and a bail falls off.',
        options: ['Caught', 'Bowled', 'Run out'],
        answer: 1,
        why: 'When the bowled ball breaks the stumps you are bowled.',
      },
      {
        q: 'You hit the ball in the air and a fielder catches it before it bounces.',
        options: ['Caught', 'Stumped', 'LBW'],
        answer: 0,
        why: 'A catch taken before the ball touches the ground is out caught.',
      },
      {
        q: 'You step out of your crease, miss the ball, and the wicketkeeper breaks the stumps.',
        options: ['Bowled', 'Hit wicket', 'Stumped'],
        answer: 2,
        why: 'The keeper breaking the stumps while you are out of your ground, and not running, is stumped.',
      },
      {
        q: 'You are running. A fielder throws the ball and it breaks the stumps before your bat is behind the crease.',
        options: ['Run out', 'Caught', 'LBW'],
        answer: 0,
        why: 'Being short of your ground while running is run out.',
      },
      {
        q: 'The ball hits your pad without touching the bat, and it was going on to hit the stumps.',
        options: ['Bowled', 'LBW', 'Obstructing the field'],
        answer: 1,
        why: 'Pad first, and the ball would have hit the stumps: that is leg before wicket.',
      },
      {
        q: 'You step back for a pull shot and your back foot knocks the bails off.',
        options: ['Hit wicket', 'Bowled', 'Stumped'],
        answer: 0,
        why: 'Breaking your own stumps while playing the ball is hit wicket.',
      },
      {
        q: 'How many ways are there to be out?',
        options: ['4', '6', '11 (10 in today’s Laws, since handled the ball became obstructing the field)'],
        answer: 2,
        why: 'There are 11 named ways; since 2017 "handled the ball" is given as obstructing the field, so today’s Laws list 10.',
      },
      {
        q: 'The bowler has bowled a no-ball. Which of these can still get you out?',
        options: ['Bowled', 'Run out', 'Caught'],
        answer: 1,
        why: 'Off a no-ball you can only be run out, out for hitting the ball twice, or out for obstructing the field.',
      },
      {
        q: 'You run and change your line on purpose so the throw hits you and not the stumps.',
        options: ['Run out', 'Obstructing the field', 'Hit the ball twice'],
        answer: 1,
        why: 'Stopping a fielder on purpose, by word or action, is obstructing the field.',
      },
      {
        q: 'A batter is out. The next batter is still putting on pads after 3 minutes.',
        options: ['Retired out', 'Timed out', 'Not out: they can take their time'],
        answer: 1,
        why: 'The new batter must be ready within 3 minutes (2 in some international matches), or can be given out timed out.',
      },
      {
        q: 'You defend, the ball rolls towards your stumps, and you knock it away with your bat. Are you out?',
        options: ['Yes, hit the ball twice', 'No, you may stop it hitting your stumps', 'Yes, obstructing the field'],
        answer: 1,
        why: 'You may hit the ball again only to stop it hitting your stumps. Hitting it again for runs is out.',
      },
      {
        q: 'A batter walks off without the umpire’s permission, not injured. What happens?',
        options: ['Retired hurt: they can bat again', 'Retired out: they cannot come back', 'Nothing'],
        answer: 1,
        why: 'Leaving without permission and without injury is retired out. Only an injured batter is retired hurt.',
      },
    ],
  },
  {
    id: 'pitch',
    level: 1,
    title: 'The pitch and the field',
    summary: 'Creases, stumps, and your off side and leg side.',
    minutes: 4,
    sections: [
      {
        heading: 'The pitch',
        text: 'The pitch is the strip in the middle of the field. It is 22 yards long, which is about 20 metres. There are three stumps with two bails on top at each end.',
      },
      {
        heading: 'The popping crease',
        text: 'The line about 1.2 metres in front of the stumps is the popping crease. You are safe when your bat or foot is grounded behind it. This is the line you run to.',
      },
      {
        heading: 'Off side and leg side',
        text: 'The field is split in two down the line of the pitch. The off side is the side your chest faces when you stand to bat. The leg side, also called the on side, is behind your back. You bat {hand}-handed, so when you look at the bowler the off side is on your {offSide} and the leg side is on your {legSide}.',
      },
    ],
    keyPoints: ['The pitch is 22 yards long', 'Ground your bat behind the popping crease to be safe', 'Off side: where your chest faces. For you that is to the {offSide} as you look at the bowler'],
    remedial: {
      heading: 'Find your off side',
      points: [
        'Stand in your batting stance.',
        'The side your chest and the face of your bat point to is the off side.',
        'The side behind your back is the leg side.',
        'You bat {hand}-handed, so as you look at the bowler the off side is on your {offSide}.',
        'The popping crease is the line in front of the stumps. Behind it you are safe.',
      ],
    },
    quiz: [
      { q: 'How long is a cricket pitch?', options: ['18 yards', '22 yards', '30 yards'], answer: 1, why: 'The pitch is 22 yards from stumps to stumps.' },
      {
        q: 'Which line must your bat be grounded behind for you to be safe?',
        options: ['The boundary', 'The popping crease', 'The return crease'],
        answer: 1,
        why: 'You are in your ground when your bat or foot is behind the popping crease.',
      },
      {
        q: 'You bat {hand}-handed. As you look at the bowler, where is your off side?',
        options: ['On my right', 'On my left'],
        answer: { right: 0, left: 1 },
        why: 'The off side is the side your chest faces in your stance.',
      },
      {
        q: 'What is the leg side also called?',
        options: ['The on side', 'The off side', 'The far side'],
        answer: 0,
        why: 'Leg side and on side mean the same thing.',
      },
    ],
  },
  {
    id: 'grip',
    level: 2,
    title: 'The grip',
    summary: 'How to hold the bat so it swings straight, and how to check your own grip.',
    minutes: 7,
    sections: [
      {
        heading: 'Why the grip matters',
        text: 'The grip decides which way the face of the bat points when it meets the ball. A good grip keeps the face straight, so the ball goes where you aim it. A bad grip is the most common reason beginners hit the ball in the air or edge it to a fielder.',
      },
      {
        heading: 'Which hand goes where',
        text: 'Both hands hold the handle close together. You bat {hand}-handed, so your {topHand} hand is the top hand, nearest the end of the handle. Your {bottomHand} hand goes just below it.',
      },
      {
        heading: 'Line up the Vs',
        text: 'On each hand, the thumb and first finger make a V shape. Both Vs should point down the back of the bat, between the middle of the bat and its outside edge.',
      },
      {
        heading: 'Firm top, soft bottom',
        text: 'The top hand holds firmly and guides the bat. The bottom hand stays relaxed, as if you were holding an egg. A tight bottom hand drags the bat across the line of the ball.',
      },
      {
        heading: 'A quick way to find it',
        text: 'Lay the bat face down on the ground with the handle pointing at you. Pick it up with both hands as if you were picking up an axe. That is your grip.',
      },
      {
        heading: 'How high on the handle',
        text: 'Put your {topHand} hand near the top of the handle, about one finger-width from the end. Your {bottomHand} hand goes right below it. Held low, near the blade, the bat feels short and the bottom hand takes over. Later, a coach may move your hands a little lower for more control in defence; for now, keep them near the top.',
      },
      {
        heading: 'In the fingers, not the palm',
        text: 'The handle lies across the fingers, not deep in the palm. Wrap the fingers round it and close the thumb over them. In the fingers the wrists can move freely, so the bat swings smoothly. Deep in the palm, it feels like a club and the wrists lock.',
      },
      {
        heading: 'Five mistakes to look for',
        text: 'The wrong hand on top. A gap between the hands. Both hands low on the handle. The Vs pointing at the inside edge, so the face turns. The bottom hand squeezing hard, knuckles white. Try "Spot the mistake" to learn to see them.',
      },
      {
        heading: 'Check it every time',
        text: 'Every time you pick up the bat, check four things before you take your stance: top hand, bottom hand, close together, Vs in a line. It takes three seconds and soon becomes a habit. The practice camera cannot see your fingers, so send a close photo of your hands on the bat and the AI coach checks it for you.',
      },
    ],
    keyPoints: ['Top hand for you: {topHand}', 'Hands close together, near the top of the handle', 'Both Vs point between the middle and the outside edge', 'Handle in the fingers, not the palm', 'Top hand firm, bottom hand relaxed'],
    remedial: {
      heading: 'Check your grip in three steps',
      points: [
        'Your {topHand} hand is at the top of the handle. Your {bottomHand} hand is right below it, touching.',
        'Look down at your hands. The two Vs made by thumb and first finger are in one line.',
        'Squeeze with the top hand. Loosen the bottom hand until you could slide it.',
      ],
    },
    tool: { title: 'Spot the mistake', text: 'Six grips are drawn, each with one mistake or none. Name it, and learn what it does to the bat.', route: '/grip-quiz' },
    quiz: [
      {
        q: 'You bat {hand}-handed. Which is your top hand?',
        options: ['My right hand', 'My left hand'],
        answer: { right: 1, left: 0 },
        why: 'The top hand is the hand of your front arm, the one nearer the bowler.',
      },
      { q: 'How far apart should your hands be?', options: ['Close together', 'One hand-width apart', 'At opposite ends of the handle'], answer: 0, why: 'Hands close together work as one unit.' },
      { q: 'Which hand guides the bat?', options: ['The bottom hand', 'The top hand', 'Neither'], answer: 1, why: 'The top hand controls the bat; the bottom hand supports.' },
      {
        q: 'Where should the Vs between thumb and first finger point?',
        options: ['At the inside edge', 'Between the middle of the bat and the outside edge', 'Straight up'],
        answer: 1,
        why: 'Lined-up Vs keep the face of the bat straight.',
      },
      { q: 'Where on the handle does your top hand go?', options: ['Near the top, about one finger-width from the end', 'In the middle', 'Just above the blade'], answer: 0, why: 'Near the top of the handle; held low, the bottom hand takes over.' },
      { q: 'Where does the handle sit in your hands?', options: ['Deep in the palm', 'Across the fingers', 'Between two fingers'], answer: 1, why: 'In the fingers the wrists move freely and the bat swings smoothly.' },
      { q: 'Your bottom hand is squeezing so hard your knuckles go white. What happens?', options: ['The bat pulls across the ball', 'The ball goes further', 'Nothing'], answer: 0, why: 'A tight bottom hand drags the bat across the line. Keep it relaxed.' },
      { q: 'Why can the practice camera not check your grip?', options: ['It cannot see your fingers', 'The grip does not matter', 'It only checks the bat'], answer: 0, why: 'The pose camera sees wrists, not fingers. Send a photo and the AI coach checks the grip.' },
    ],
  },
  {
    id: 'stance',
    level: 2,
    title: 'The stance',
    summary: 'A balanced set-up so you can move forward or back.',
    minutes: 5,
    practice: 'stance',
    sections: [
      {
        heading: 'Feet',
        text: 'Stand side-on to the bowler with your feet about shoulder-width apart and parallel to the crease. Your {front} foot is nearer the bowler.',
      },
      {
        heading: 'Feet on one line',
        text: 'Put both feet side by side on one line, like standing on a straight chalk line that runs towards the bowler. Neither foot is in front of the other, and both toes point to the side, not at the bowler. Feet on one line keep your body side-on and let you step forward or back equally quickly.',
      },
      {
        heading: 'Knees and weight',
        text: 'Bend your knees a little. Keep your weight on the balls of both feet, shared evenly. You should be able to step forward or back without rocking first.',
      },
      {
        heading: 'Shoulders and head',
        text: 'Point your {front} shoulder at the bowler. Turn your head to face the bowler, over your {front} shoulder, with your eyes level. Keep your neck straight: do not look up, do not look down at the ground, and do not turn the other way. A level, still head is the most important part of batting.',
      },
      {
        heading: 'Hands and bat',
        text: 'Lean forward slightly from the hips. Hold the bat with both hands together on the handle and let your hands rest near your {front} thigh. Rest the toe of the bat on the ground by your {back} toe, or lift it just a little behind you. Keep it low: not up in the air.',
      },
      {
        heading: 'The bat: what beginners get wrong',
        text: 'Holding the bat with one hand. Holding it high, up in the air: it makes you tired and slow, and the bat comes down crooked. Resting it down by your {back} toe, or lifting it a little behind you, are both fine. Use both hands every time.',
      },
      {
        heading: 'How the camera checks you',
        text: 'A stance counts when your feet, feet in line, knees, lean, shoulders and hands are right and your bat is not up in the air. Your head, eyes and neck get tips: the voice tells you, but a tip does not stop the stance from counting. The phone can be in front of you or at your side.',
      },
    ],
    keyPoints: ['Feet shoulder-width apart, side by side on one line', 'Knees slightly bent, weight on both feet', '{front} shoulder points at the bowler', 'Head still, neck straight, eyes level', 'Both hands on the bat, toe resting behind your {back} toe'],
    remedial: {
      heading: 'Build the stance from the ground up',
      points: [
        'Feet: shoulder-width apart, side by side on one line, both pointing the same way, across the pitch.',
        'Knees: a small bend. Not straight, not squatting.',
        'Hips: lean forward a little, as if about to sit on a high stool.',
        'Shoulders: your {front} shoulder points down the pitch at the bowler.',
        'Head: turn it to the bowler, neck straight, both eyes level.',
        'Bat: both hands together on the handle, resting by your {back} toe or lifted a little behind you, never high in the air.',
        'Try the stance check on the Practise tab. It tells you which part to fix.',
      ],
    },
    quiz: [
      { q: 'How far apart should your feet be?', options: ['Touching', 'About shoulder-width', 'As wide as you can'], answer: 1, why: 'Shoulder-width gives balance and lets you move either way.' },
      {
        q: 'You bat {hand}-handed. Which shoulder points at the bowler?',
        options: ['My right shoulder', 'My left shoulder'],
        answer: { right: 1, left: 0 },
        why: 'Your front shoulder leads. It is the opposite side to your batting hand.',
      },
      { q: 'What should your knees be doing?', options: ['Locked straight', 'Slightly bent', 'Bent as far as possible'], answer: 1, why: 'A slight bend keeps you ready to move.' },
      { q: 'How should you hold your head?', options: ['Tilted to one side', 'Looking at your feet', 'Still, with eyes level, facing the bowler'], answer: 2, why: 'Level eyes judge the ball best.' },
      { q: 'Where do your feet go?', options: ['Side by side on one line', 'One foot in front of the other', 'Toes pointing at the bowler'], answer: 0, why: 'Feet on one line keep you side-on and ready to move either way.' },
      { q: 'How many hands hold the bat in the stance?', options: ['One hand is enough', 'Both hands, together on the handle', 'Both hands, far apart'], answer: 1, why: 'Two hands together control the bat and keep it straight.' },
      { q: 'Where is the bat in the stance?', options: ['High up in the air', 'Resting by your back toe, or lifted a little behind you', 'Held out towards the bowler'], answer: 1, why: 'A low bat is ready to come down straight. Held high, it makes you tired and slow.' },
    ],
  },
  {
    id: 'backlift',
    level: 2,
    title: 'The backlift',
    summary: 'Lifting the bat so it comes down straight.',
    minutes: 4,
    sections: [
      {
        heading: 'When',
        text: 'Lift the bat as the bowler is about to let go of the ball. Too early and you get tense. Too late and you rush the shot.',
      },
      {
        heading: 'How',
        text: 'Use your top hand, the {topHand} one, to lift the bat straight back towards the stumps. Your hands stay close to your body near your {back} hip. The bottom hand just goes along with it.',
      },
      {
        heading: 'Stay still',
        text: 'Only your arms move. Your head stays still and your eyes stay level, watching the ball leave the bowler’s hand.',
      },
      {
        heading: 'Why straight matters',
        text: 'A bat lifted straight back will swing straight down the line of the ball. A bat lifted out to the side swings across the line and misses more often.',
      },
    ],
    keyPoints: ['Lift as the bowler is about to release', 'Top hand does the lifting', 'Straight back towards the stumps', 'Head stays still'],
    remedial: {
      heading: 'Practise it slowly',
      points: [
        'Stand in your stance next to a wall on your leg side. If the bat hits the wall on the way up, you are lifting it crooked.',
        'Lift with the {topHand} hand only a few times. Then add the bottom hand without squeezing.',
        'Keep watching one spot in front of you while you lift. Your head should not move.',
      ],
    },
    quiz: [
      { q: 'Which hand does most of the lifting?', options: ['The top hand', 'The bottom hand', 'Both equally, as hard as you can'], answer: 0, why: 'The top hand lifts and guides; the bottom hand follows.' },
      { q: 'When do you lift the bat?', options: ['When the bowler starts walking back', 'As the bowler is about to release the ball', 'After the ball bounces'], answer: 1, why: 'Lifting just before release keeps you relaxed and on time.' },
      { q: 'What does your head do during the backlift?', options: ['Stays still', 'Drops down', 'Turns away'], answer: 0, why: 'A still head keeps your eyes on the ball.' },
      { q: 'Why lift the bat straight back?', options: ['It looks better', 'So it swings down straight along the line of the ball', 'To hit the ball harder'], answer: 1, why: 'A straight lift gives a straight swing.' },
    ],
  },
  {
    id: 'forward-defence',
    level: 3,
    title: 'Forward defence',
    summary: 'Stopping a good ball safely on the front foot.',
    minutes: 5,
    practice: 'defence',
    sections: [
      {
        heading: 'When to play it',
        text: 'Use it for a ball on a good length that is going to hit the stumps. You are not trying to score. You are making sure you are still batting for the next ball.',
      },
      {
        heading: 'Start from a good stance',
        text: 'Every forward defence starts from your stance: feet on one line, knees bent, both hands on the bat, bat resting down. The app checks your stance first, every time.',
      },
      {
        heading: 'Lead with head and shoulder',
        text: 'Lean your head and {front} shoulder towards the line of the ball. Your {front} foot follows with a comfortable step towards where the ball will bounce. Get your head down, over your front knee, so your eyes are right over the ball. Do not keep your head up.',
      },
      {
        heading: 'Bat and pad together',
        text: 'Bend your {front} knee and bring the bat down straight, right beside your front pad. Leave no gap between bat and pad for the ball to get through.',
      },
      {
        heading: 'Soft hands',
        text: 'Keep both hands on the handle and the handle ahead of the blade, so the face points down. Hold the bat loosely at contact. The ball should drop near your feet, not fly to a fielder.',
      },
      {
        heading: 'Common mistakes',
        text: 'A short step that does not reach the ball. A straight front knee. The head behind the knee, leaning back. A gap between bat and pad. The bat coming across the body. The face pointing up. Letting go with one hand. The camera checks each of these and tells you how to fix it.',
      },
    ],
    keyPoints: ['Head and {front} shoulder lead', 'Step to where the ball bounces', 'No gap between bat and pad', 'Face angled down, soft hands'],
    remedial: {
      heading: 'Three checks after each attempt',
      points: [
        'Is your head over your {front} knee? If it is behind, step further.',
        'Can you fit a ball between your bat and your pad? If yes, close the gap.',
        'Where did the ball go? It should drop near your feet. If it flew away, loosen your bottom hand.',
      ],
    },
    quiz: [
      { q: 'How big should the gap between bat and pad be?', options: ['A bat’s width', 'A ball’s width', 'No gap'], answer: 2, why: 'A gap lets the ball through to the stumps.' },
      { q: 'How should the bat face be angled?', options: ['Pointing up', 'Pointing down, handle ahead of the blade', 'Flat like a tennis racket'], answer: 1, why: 'A downward face keeps the ball on the ground.' },
      {
        q: 'You bat {hand}-handed. Which foot steps towards the ball?',
        options: ['My right foot', 'My left foot'],
        answer: { right: 1, left: 0 },
        why: 'The front foot, the one nearer the bowler, steps forward.',
      },
      { q: 'Why hold the bat loosely at contact?', options: ['So the ball drops near your feet', 'So the ball goes for four', 'So the bat does not break'], answer: 0, why: 'Soft hands take the pace off the ball.' },
    ],
  },
  {
    id: 'front-foot-drive',
    level: 3,
    title: 'Front-foot drive',
    summary: 'Scoring along the ground from a full ball.',
    minutes: 5,
    practice: 'drive',
    sections: [
      {
        heading: 'Pick the right ball',
        text: 'Drive a full ball, one that bounces close to your front foot. It starts exactly like the forward defence.',
      },
      {
        heading: 'Get to the ball',
        text: 'Lead with your head and {front} shoulder and step to where the ball bounces. Bend your {front} knee and put your weight on that foot.',
      },
      {
        heading: 'Swing through the line',
        text: 'Bring the bat down straight with your {front} elbow high. Hit the ball beside your front pad, under your eyes. Let the bat carry on after the ball.',
      },
      {
        heading: 'Keep it down',
        text: 'If your head is over the ball and your weight is forward, the ball goes along the ground. If you lean back, it goes up in the air.',
      },
    ],
    keyPoints: ['Only drive a full ball', 'Head over the ball at contact', '{front} elbow high', 'Weight on the front foot keeps the ball down'],
    remedial: {
      heading: 'Fix the common faults',
      points: [
        'Ball going in the air: your weight is back. Get your head over your {front} knee.',
        'Missing the ball: you are swinging across it. Lift and swing the bat in a straight line.',
        'No power: you are reaching for the ball. Step closer to where it bounces.',
      ],
    },
    quiz: [
      { q: 'Which ball should you drive?', options: ['A short ball that bounces high', 'A full ball that bounces near your front foot', 'Any ball'], answer: 1, why: 'A full ball can be hit along the ground on the front foot.' },
      { q: 'Where should your front elbow be?', options: ['High', 'Tucked into your ribs', 'Behind your back'], answer: 0, why: 'A high front elbow keeps the bat straight.' },
      { q: 'Where do you hit the ball?', options: ['Far out in front of you', 'Beside your front pad, under your eyes', 'Behind your back leg'], answer: 1, why: 'Contact under the eyes gives control.' },
      { q: 'What keeps the ball along the ground?', options: ['Leaning back', 'Head over the ball and weight forward', 'Swinging harder'], answer: 1, why: 'Leaning back lifts the ball.' },
    ],
  },
  {
    id: 'back-foot-defence',
    level: 3,
    practice: 'backdefence',
    title: 'Back-foot defence',
    summary: 'Stopping a shorter ball that bounces higher.',
    minutes: 5,
    sections: [
      {
        heading: 'When to play it',
        text: 'Use it for a ball that bounces further away from you and rises towards your waist or chest, on the line of the stumps.',
      },
      {
        heading: 'Back and across',
        text: 'Step back and across towards the stumps with your {back} foot, keeping it parallel to the crease. Bring your {front} foot back beside it.',
      },
      {
        heading: 'Stand tall',
        text: 'Put your weight on the back foot and stand up tall. This gets your eyes level with the bounce of the ball.',
      },
      {
        heading: 'Bat straight and close',
        text: 'Keep your {front} elbow high and the bat upright, close to your body. Angle the face down and let the ball hit a loose bat so it drops.',
      },
    ],
    keyPoints: ['For a shorter ball that rises', 'Step back and across with the {back} foot', 'Stand tall, weight on the back foot', 'Bat upright, face down, soft hands'],
    remedial: {
      heading: 'One thing at a time',
      points: [
        'First the feet only: back and across with the {back} foot, without a bat.',
        'Then add height: finish standing tall, not crouched.',
        'Then the bat: upright, close to your chest, {front} elbow up.',
      ],
    },
    quiz: [
      { q: 'Which ball needs a back-foot defence?', options: ['A full ball near your feet', 'A shorter ball that bounces higher', 'A ball that rolls along the ground'], answer: 1, why: 'Going back gives you time and height for a rising ball.' },
      { q: 'Which way does your back foot move?', options: ['Forward', 'Back and across towards the stumps', 'Out to the leg side'], answer: 1, why: 'Back and across gets you in line with the ball.' },
      { q: 'How should you finish?', options: ['Standing tall with your weight on the back foot', 'Crouching low', 'Leaning away from the ball'], answer: 0, why: 'Standing tall gets you over the bounce.' },
      { q: 'How should the bat be?', options: ['Flat', 'Upright with the face angled down', 'Swinging hard'], answer: 1, why: 'An upright, angled bat drops the ball safely.' },
    ],
  },
  {
    id: 'running',
    level: 4,
    title: 'Running between the wickets',
    summary: 'Calling clearly and making your ground.',
    minutes: 4,
    sections: [
      {
        heading: 'Three calls',
        text: 'There are only three calls: Yes, No and Wait. Call loudly and early. Once you have called, do not change your mind halfway.',
      },
      {
        heading: 'Who calls',
        text: 'The batter who can see the ball calls. If the ball goes in front of the wicket, the striker calls. If it goes behind the wicket, the non-striker calls.',
      },
      {
        heading: 'Make your ground',
        text: 'As you reach the far end, slide your bat along the ground over the popping crease. A bat in the air does not count.',
      },
      {
        heading: 'Run the first one fast',
        text: 'Run the first run quickly and turn while watching the ball. Many second runs come from a fast first one.',
      },
    ],
    keyPoints: ['Yes, No, Wait', 'The batter who can see the ball calls', 'Slide the bat over the crease', 'Run the first run fast'],
    remedial: {
      heading: 'Practise with a partner',
      points: [
        'One of you rolls a ball in front, the other behind. Decide out loud who calls each time.',
        'Use only the three words: Yes, No, Wait.',
        'Finish every run with the bat sliding on the ground across the line.',
      ],
    },
    quiz: [
      { q: 'What are the three calls?', options: ['Go, Stop, Back', 'Yes, No, Wait', 'Run, Stay, Maybe'], answer: 1, why: 'Yes, No and Wait are the only calls you need.' },
      { q: 'The ball goes behind the wicket. Who calls?', options: ['The striker', 'The non-striker', 'The bowler'], answer: 1, why: 'The non-striker can see a ball that goes behind the striker.' },
      { q: 'How do you make your ground at the end of a run?', options: ['Jump over the line', 'Slide the bat along the ground over the crease', 'Hold the bat in the air'], answer: 1, why: 'The bat must be grounded behind the crease.' },
      { q: 'Why run the first run fast?', options: ['It makes a second run possible', 'To tire out your partner', 'It is a rule'], answer: 0, why: 'A fast first run puts pressure on the fielders.' },
    ],
  },
  {
    id: 'line-length',
    level: 4,
    title: 'Reading line and length',
    summary: 'Choosing the right shot for each ball.',
    minutes: 5,
    sections: [
      {
        heading: 'Length',
        text: 'Length is where the ball bounces. A full ball bounces near your feet: play forward. A short ball bounces far from you and rises: play back. A good-length ball is in between and is the hardest to judge: defend it.',
      },
      {
        heading: 'Line',
        text: 'Line is the direction of the ball compared with the stumps. On the stumps: you must play it. Well outside off stump: you can leave it. Down the leg side: it will miss the stumps.',
      },
      {
        heading: 'Leaving is a shot',
        text: 'Letting a wide ball go is a good decision, not a missed chance. Lift your bat out of the way and watch the ball all the way past.',
      },
    ],
    keyPoints: ['Full ball: forward. Short ball: back', 'Good length: defend', 'On the stumps: play it', 'Wide outside off stump: you can leave it'],
    remedial: {
      heading: 'Say it out loud',
      points: [
        'Watch someone bowl, or watch a match. Before each ball is hit, say "full", "good" or "short".',
        'Then say "stumps", "off" or "leg" for the line.',
        'Full means forward. Short means back. On the stumps means you must play.',
      ],
    },
    quiz: [
      { q: 'A short ball that rises: forward or back?', options: ['Play forward', 'Play back', 'Run down the pitch'], answer: 1, why: 'Going back gives time to deal with the bounce.' },
      { q: 'A full ball that bounces near your feet: forward or back?', options: ['Play forward', 'Play back', 'Duck'], answer: 0, why: 'Meet a full ball on the front foot.' },
      { q: 'Early in your innings a ball is well outside off stump. What is the safe choice?', options: ['Swing hard at it', 'Leave it', 'Kick it'], answer: 1, why: 'A wide ball cannot hit the stumps, so you can let it go.' },
      { q: 'What does "line" mean?', options: ['How fast the ball is', 'Where the ball bounces', 'The direction of the ball compared with the stumps'], answer: 2, why: 'Line is direction; length is where it bounces.' },
    ],
  },
  {
    id: 'fielding-positions',
    level: 5,
    title: 'Fielding positions',
    summary: 'Where the fielders stand, what each one is for, and the words in their names.',
    minutes: 8,
    sections: [
      {
        heading: 'Eleven players in the field',
        text: 'The fielding side has eleven players: the bowler, the wicketkeeper and nine fielders. The captain decides where the nine stand. Every position has a name, and the name tells you where it is: on the off side or the leg side, close to the batter or far away, in front of the batter or behind.',
      },
      {
        heading: 'The words in the names',
        text: 'Off side: the side the batter faces. Leg side (also called on side): behind the batter’s legs. Square: level with the batter. Fine: behind the batter, close to the line of the pitch. Deep or long: near the boundary. Short or silly: very close to the batter. Mid: halfway, in front of the batter.',
      },
      {
        heading: 'Behind the batter: the catchers',
        text: 'Wicketkeeper: behind the stumps, wearing gloves and pads. Slips: next to the keeper on the off side, one beside the other (first slip, second slip, third slip), waiting for a ball that takes the edge of the bat. Gully: wider than the slips, for thicker edges and cuts that fly in the air. Third man: behind the batter on the off side, near the boundary, for edges and late cuts that run away. Fine leg: the same place on the leg side, for glances and leg byes.',
      },
      {
        heading: 'Level with the batter',
        text: 'Point: square on the off side, level with the batter, for the cut and the square drive. Square leg: square on the leg side, level with the batter, for the pull and the sweep. The second umpire stands near square leg too.',
      },
      {
        heading: 'In front of the batter',
        text: 'Cover: on the off side, between point and mid-off, for the cover drive. Mid-off and mid-on: either side of the bowler, about halfway to the boundary, for straight drives. Mid-wicket: on the leg side, between square leg and mid-on, for the flick and the pull. Long-off and long-on: on the boundary behind the bowler, for big straight hits.',
      },
      {
        heading: 'Very close: for spin bowling',
        text: 'Short leg stands a few metres from the batter on the leg side, and silly point the same distance on the off side. They wear a helmet and wait for a ball that pops up off the bat or the pad. You will see them mostly when a spinner bowls.',
      },
      {
        heading: 'For a left-handed batter',
        text: 'Everything swaps sides. For a left-hander the off side is the other way, so the slips, gully, point and cover all move to the other side of the field. Fielders change sides when a left-hander and a right-hander bat together and take a single.',
      },
    ],
    keyPoints: [
      'Slips and gully: next to the keeper on the off side, for edges',
      'Point and square leg: level with the batter',
      'Cover, mid-off, mid-on and mid-wicket: in front of the batter',
      'Third man, fine leg, long-off and long-on: on the boundary',
      'For a left-hander every position swaps sides',
    ],
    remedial: {
      heading: 'Read the name',
      points: [
        'Off side or leg side? The off side is where the batter faces.',
        'Square means level with the batter; fine means behind, near the line of the pitch.',
        'Long or deep means near the boundary; short or silly means very close.',
        'Slips and gully are always on the off side, next to the keeper.',
        'Open the field trainer and tap each fielder to see its name.',
      ],
    },
    tool: { title: 'Learn them on the field', text: 'Tap each fielder to see the name, then test yourself and read a field.', route: '/tools/field' },
    quiz: [
      { q: 'Where do the slips stand?', options: ['Next to the wicketkeeper on the off side', 'On the boundary behind the bowler', 'Level with the batter on the leg side'], answer: 0, why: 'Slips stand beside the keeper on the off side, waiting for an edge.' },
      { q: 'What does "square" mean in a fielding position?', options: ['Near the boundary', 'Level with the batter', 'Behind the bowler'], answer: 1, why: 'Square means level with the batter, like square leg and point.' },
      { q: 'A batter cuts the ball hard along the ground, level with them on the off side. Who stops it?', options: ['Mid-on', 'Point', 'Fine leg'], answer: 1, why: 'Point stands square on the off side, where the cut goes.' },
      { q: 'Which fielder is on the leg side?', options: ['Cover', 'Gully', 'Mid-wicket'], answer: 2, why: 'Mid-wicket is on the leg side; cover and gully are on the off side.' },
      { q: 'What do "long" and "deep" tell you?', options: ['The fielder is near the boundary', 'The fielder is very close to the batter', 'The fielder is the tallest'], answer: 0, why: 'Long-off, long-on and deep positions are out near the boundary.' },
      { q: 'Short leg and silly point are used mostly when…', options: ['a fast bowler has a new ball', 'a spinner is bowling', 'the batting side needs one run to win'], answer: 1, why: 'Close catchers wait for a ball that pops up off the bat or pad, which happens most against spin.' },
      { q: 'A left-handed batter comes in. Where do the slips go?', options: ['They stay where they were', 'To the other side of the keeper', 'To the boundary'], answer: 1, why: 'For a left-hander the off side is the other way, so the slips move to the other side of the keeper.' },
      { q: 'Which fielder stands behind the batter on the off side, near the boundary?', options: ['Third man', 'Fine leg', 'Long-on'], answer: 0, why: 'Third man is fine on the off side, near the boundary. Fine leg is the same place on the leg side.' },
    ],
  },
  {
    id: 'setting-a-field',
    level: 5,
    title: 'Setting a field and powerplays',
    summary: 'Why captains place fielders where they do, the field rules, and how powerplays work.',
    minutes: 8,
    sections: [
      {
        heading: 'Attack or defend',
        text: 'An attacking field puts fielders where catches go, close to the bat: slips, gully, short leg. It takes wickets but leaves gaps, so runs can come. A defensive field spreads fielders out, some on the boundary, to stop runs. Captains attack when a new batter comes in or the ball is new and swinging, and defend when the batters are scoring freely.',
      },
      {
        heading: 'For a fast bowler with a new ball',
        text: 'The new ball swings and bounces, so it often takes the outside edge. The captain puts two or three slips and a gully next to the keeper, with a cover, a mid-off and a mid-on to stop the drives, and a fine leg for the ball that goes down the leg side.',
      },
      {
        heading: 'For a spinner',
        text: 'A spinner bowls slower, so the batter can hit the ball further but may also give a catch close to the bat. The captain uses a slip, a short leg or silly point, and fielders at mid-wicket and cover, with one or two on the boundary behind square or straight for the big hit.',
      },
      {
        heading: 'Rules for every field',
        text: 'There are never more than eleven fielders, including the bowler and the keeper. Only two fielders may stand behind square on the leg side, and fielders should not move once the bowler starts the run-up. If a rule is broken, the umpire calls a no-ball.',
      },
      {
        heading: 'The circle and the powerplay',
        text: 'In one-day (50-over) and T20 matches a circle is marked about 27 metres (30 yards) from the pitch. A powerplay is a block of overs in which only a few fielders may stand outside the circle, so the batting side can score more easily. One-day matches: overs 1 to 10 at most 2 fielders outside the circle, overs 11 to 40 at most 4, overs 41 to 50 at most 5. T20 matches: overs 1 to 6 are the powerplay, with at most 2 outside the circle; after that at most 5. Too many fielders outside the circle is a no-ball, and the next ball is a free hit.',
      },
      {
        heading: 'What it means for you as a batter',
        text: 'In the powerplay the gaps on the boundary are open, so a ball hit over the circle often runs for four. Later, with more fielders out on the boundary, look for singles into the gaps inside the circle. Before each ball, look round the field: the empty places are where your runs are.',
      },
    ],
    keyPoints: [
      'Attacking field: catchers close to the bat. Defensive field: fielders spread out to save runs',
      'New ball and a fast bowler: slips and a gully',
      'Never more than two fielders behind square on the leg side',
      'ODI powerplay: overs 1–10, at most 2 fielders outside the circle (then 4, then 5)',
      'T20 powerplay: overs 1–6, at most 2 outside the circle (then 5)',
    ],
    remedial: {
      heading: 'Remember the numbers',
      points: [
        'Circle: about 27 metres (30 yards) from the pitch.',
        'One-day: overs 1–10 → 2 outside, 11–40 → 4, 41–50 → 5.',
        'T20: overs 1–6 → 2 outside, then 5.',
        'Behind square on the leg side: never more than 2.',
        'Breaking a fielding rule: no-ball (and a free hit in one-day and T20 matches).',
      ],
    },
    tool: { title: 'Set a field yourself', text: 'The field trainer gives you tasks: place a slip, a gully, a cover and more, and checks where you put them.', route: '/tools/field?mode=set' },
    quiz: [
      { q: 'The ball is new and the fast bowler is swinging it. Where does the captain put extra fielders?', options: ['In the slips and gully', 'All on the boundary', 'Behind the bowler'], answer: 0, why: 'A new swinging ball takes the outside edge, so catchers go in the slips and gully.' },
      { q: 'In overs 1 to 10 of a one-day match, how many fielders may stand outside the circle?', options: ['2', '4', '5'], answer: 0, why: 'In the first powerplay of a one-day match at most two fielders may be outside the circle.' },
      { q: 'In a T20 match, how long is the powerplay?', options: ['The first 6 overs', 'The first 10 overs', 'The last 5 overs'], answer: 0, why: 'The T20 powerplay is overs 1 to 6.' },
      { q: 'In overs 41 to 50 of a one-day match, how many fielders may be outside the circle?', options: ['2', '4', '5'], answer: 2, why: 'In the last ten overs up to five fielders may be outside the circle.' },
      { q: 'How many fielders may stand behind square on the leg side?', options: ['As many as the captain wants', 'No more than 2', 'Exactly 4'], answer: 1, why: 'The Laws allow no more than two fielders behind square on the leg side.' },
      { q: 'There are three fielders outside the circle in the first over of a T20 match. What does the umpire do?', options: ['Nothing', 'Calls a no-ball', 'Gives the batter out'], answer: 1, why: 'Too many fielders outside the circle is a no-ball, and the next ball is a free hit.' },
      { q: 'Which field is more attacking?', options: ['Three slips, a gully and a short leg', 'Five fielders on the boundary', 'Everyone at mid-on'], answer: 0, why: 'Catchers close to the bat try to take wickets; boundary fielders try to save runs.' },
      { q: 'Late in an innings most fielders are on the boundary. What should a batter look for?', options: ['Only sixes', 'Singles into the gaps inside the circle', 'Nothing: wait for the next over'], answer: 1, why: 'With fielders far away, quick singles into the gaps inside the circle are easy runs.' },
    ],
  },
  {
    id: 'umpires-appeals',
    level: 5,
    title: 'Umpires and appeals',
    summary: 'Why the fielders must appeal, how the umpire gives you out, and the umpire’s signals.',
    minutes: 7,
    sections: [
      {
        heading: 'The umpires',
        text: 'Two umpires run the match on the field: one at the bowler’s end and one at square leg. In big matches a third umpire watches the TV pictures for run outs, stumpings and close catches. The umpires’ decision is final, so players accept it and do not argue.',
      },
      {
        heading: 'No appeal, no out',
        text: 'A batter is not given out unless the fielding side asks the umpire. This is the appeal: a fielder or the bowler shouts "How’s that?" (often heard as "Howzat!"). One appeal covers every way of being out. It must be made before the bowler starts the run-up for the next ball. If nobody appeals, even a batter who is out stays in.',
      },
      {
        heading: 'Out or not out',
        text: 'When a wicket falls, the fielders appeal and the umpire decides. Out: the umpire raises one finger above the head. Not out: the umpire says "not out" or shakes the head. A batter who knows they are out, for example clearly bowled or caught, may walk off without waiting. In international matches a team can ask for a review (the umpire makes a "T" with the arms) and the third umpire looks at the TV replay.',
      },
      {
        heading: 'Signals for runs and extras',
        text: 'Four: the arm waved from side to side across the chest. Six: both arms raised straight above the head. No-ball: one arm held out to the side. Wide: both arms held out to the sides. Bye: one open hand raised above the head. Leg bye: the umpire touches a raised knee. Free hit: one hand raised and circled above the head. Dead ball: the wrists crossed and uncrossed below the waist.',
      },
      {
        heading: 'Good manners',
        text: 'Appeal only when you think the batter is out, accept the umpire’s decision, and thank the umpires at the end of the match. As a batter, if you are given out, walk off without arguing; if given not out, carry on and do not celebrate the umpire’s mistake.',
      },
    ],
    keyPoints: [
      'No appeal ("How’s that?"), no out',
      'Appeal before the bowler starts the run-up for the next ball',
      'Out: one finger raised; four: arm waved across the chest; six: both arms up',
      'Wide: both arms out; no-ball: one arm out; bye: open hand up; leg bye: touch the knee',
      'The umpire’s decision is final',
    ],
    remedial: {
      heading: 'Two things to remember',
      points: [
        'The umpire gives a batter out only after the fielding side appeals: "How’s that?"',
        'The appeal must come before the next ball’s run-up starts.',
        'One finger up means out.',
        'Both arms up means six; an arm waved across the chest means four.',
        'Both arms out is a wide; one arm out is a no-ball.',
      ],
    },
    quiz: [
      { q: 'The ball hits the batter’s pad in front of the stumps, but no fielder appeals. Is the batter out?', options: ['Yes, the umpire gives it anyway', 'No, there must be an appeal', 'Only if the batter agrees'], answer: 1, why: 'A batter is not given out unless the fielding side appeals.' },
      { q: 'What do the fielders shout to appeal?', options: ['"Well bowled!"', '"How’s that?"', '"No ball!"'], answer: 1, why: 'The appeal is "How’s that?", and it covers every way of being out.' },
      { q: 'Until when can the fielding side appeal?', options: ['Until the end of the over', 'Until the bowler starts the run-up for the next ball', 'Until lunch'], answer: 1, why: 'An appeal must be made before the bowler begins the run-up for the next ball.' },
      { q: 'The umpire raises one finger above the head. What does it mean?', options: ['Out', 'One run', 'One ball left'], answer: 0, why: 'One finger raised is the signal for out.' },
      { q: 'The umpire raises both arms straight above the head.', options: ['Four', 'Six', 'Wide'], answer: 1, why: 'Both arms above the head is the signal for six.' },
      { q: 'The umpire holds both arms out to the sides.', options: ['Wide', 'No-ball', 'Dead ball'], answer: 0, why: 'Both arms out is a wide; one arm out is a no-ball.' },
      { q: 'The umpire touches a raised knee.', options: ['Leg bye', 'Bye', 'Out LBW'], answer: 0, why: 'Touching a raised knee is the signal for a leg bye.' },
      { q: 'You are given out but think the umpire is wrong. What do you do?', options: ['Stay at the crease and argue', 'Walk off: the umpire’s decision is final', 'Ask the bowler to change it'], answer: 1, why: 'The umpire’s decision is final. In international matches a team can use a review, but you never argue.' },
    ],
  },
];

/** The lessons in order: the other basic shots follow the back-foot defence. */
export const LESSONS: Lesson[] = BASE_LESSONS.flatMap((l) => (l.id === 'back-foot-defence' ? [l, ...SHOT_LESSONS] : [l]));

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l])) as Record<string, Lesson>;

/** Fills the placeholders in lesson text for the learner's batting hand. */
export function personalise(text: string, hand: Hand): string {
  const other = hand === 'right' ? 'left' : 'right';
  const words: Record<string, string> = {
    hand,
    topHand: other,
    bottomHand: hand,
    front: other,
    back: hand,
    offSide: hand,
    legSide: other,
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const word = words[key];
    if (!word) return match;
    return word;
  });
}

/** Capitalises the first letter, for placeholders that start a sentence or a list item. */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function correctIndex(q: Question, hand: Hand): number {
  return typeof q.answer === 'number' ? q.answer : q.answer[hand];
}

/** Lessons unlock in order: a lesson opens when the one before it has been passed. */
export function isUnlocked(lessonId: string, passed: Set<string>): boolean {
  const i = LESSONS.findIndex((l) => l.id === lessonId);
  if (i <= 0) return true;
  return passed.has(LESSONS[i - 1].id);
}

export function nextLesson(passed: Set<string>): Lesson | null {
  return LESSONS.find((l) => !passed.has(l.id)) ?? null;
}

export function passesQuiz(score: number, total: number): boolean {
  return total > 0 && score / total >= PASS_MARK;
}
