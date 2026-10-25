import type { Hand } from '@/lib/pose/landmarks';
import { fieldPositions, isOutsideCircle } from './fieldPositions';
import { maxOutside, type Format } from './fieldTasks';

/**
 * "Read the field" questions for the field trainer. The field is drawn from behind the bowler, as
 * on television: for a right-handed batter the off side is on the left of the picture, for a
 * left-hander on the right. Some questions hide the batter's hand, so the learner has to work it
 * out from where the fielders stand (the slips and gully are always on the off side).
 */
export type FieldQuestion = {
  q: string;
  /** Hand of the batter the field is drawn for. */
  hand: Hand;
  /** Fielders drawn (ids from fieldPositions.ts). */
  show: string[];
  /** Fielders marked and named. */
  highlight: string[];
  /** Show the "Off side" and "Leg side" labels (hidden when they would give the answer away). */
  sides: boolean;
  batterLabel: string;
  options: string[];
  answer: number;
  why: string;
};

const ALL = ['keeper', 'slip', 'gully', 'point', 'cover', 'mid-off', 'mid-on', 'mid-wicket', 'square-leg', 'fine-leg', 'third-man', 'long-off', 'long-on'];
const RING = ['keeper', 'slip', 'gully', 'point', 'cover', 'mid-off', 'mid-on', 'mid-wicket', 'square-leg', 'fine-leg'];
const HANDS: Hand[] = ['right', 'left'];
const handWord = (h: Hand) => (h === 'right' ? 'right-handed' : 'left-handed');
const offIsOn = (h: Hand) => (h === 'right' ? 'left' : 'right');
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Puts the right option in a random place. */
function withAnswer(right: string, wrong: string[]): { options: string[]; answer: number } {
  const options = shuffle([right, ...wrong]);
  return { options, answer: options.indexOf(right) };
}

const HAND_OPTIONS = ['Right-handed batter', 'Left-handed batter'];
const handAnswer = (h: Hand) => (h === 'right' ? 0 : 1);

/** Which batter is this? The slip (and gully) are marked; the sides are not labelled. */
function whoFromSlips(hand: Hand): FieldQuestion {
  const side = offIsOn(hand);
  return {
    q: 'The slip and the gully are marked. What kind of batter is this field set for?',
    hand,
    show: RING,
    highlight: ['slip', 'gully'],
    sides: false,
    batterLabel: 'Batter: right- or left-handed?',
    options: HAND_OPTIONS,
    answer: handAnswer(hand),
    why: `The slip and gully always stand on the batter's off side, next to the wicketkeeper, waiting for an edge. Seen from behind the bowler, a right-hander's off side is on the left and a left-hander's on the right. Here they are on the ${side}, so this is a ${handWord(hand)} batter.`,
  };
}

/** Which batter is this? Only the keeper and one slip are drawn. */
function whoFromOneSlip(hand: Hand): FieldQuestion {
  const side = offIsOn(hand);
  return {
    q: `The slip stands on the ${side} of the wicketkeeper in this picture (seen from behind the bowler). Who is batting?`,
    hand,
    show: ['keeper', 'slip'],
    highlight: ['keeper', 'slip'],
    sides: false,
    batterLabel: 'Batter: right- or left-handed?',
    options: HAND_OPTIONS,
    answer: handAnswer(hand),
    why: `A slip is always on the off side. On the ${side} of the picture means the off side is on the ${side}, which is a ${handWord(hand)} batter.`,
  };
}

/** Which batter is this? The leg-side fielders are marked. */
function whoFromLegSide(hand: Hand): FieldQuestion {
  const legOn = hand === 'right' ? 'right' : 'left';
  return {
    q: 'Square leg and fine leg are marked. What kind of batter is this field set for?',
    hand,
    show: RING,
    highlight: ['square-leg', 'fine-leg'],
    sides: false,
    batterLabel: 'Batter: right- or left-handed?',
    options: HAND_OPTIONS,
    answer: handAnswer(hand),
    why: `Square leg and fine leg are on the leg side, the side behind the batter's legs. Here they are on the ${legOn} of the picture, so the leg side is on the ${legOn} and the off side on the other side: a ${handWord(hand)} batter.`,
  };
}

/** Which side is the off side for this batter? */
function whichOffSide(hand: Hand): FieldQuestion {
  return {
    q: `This is a ${handWord(hand)} batter. Which side of the picture is the off side?`,
    hand,
    show: ALL,
    highlight: [],
    sides: false,
    batterLabel: hand === 'right' ? 'Right-handed batter' : 'Left-handed batter',
    options: ['The left side of the picture', 'The right side of the picture'],
    answer: hand === 'right' ? 0 : 1,
    why: `The off side is the side the batter faces in the stance. Seen from behind the bowler it is on the left for a right-hander and on the right for a left-hander, so here it is on the ${offIsOn(hand)}.`,
  };
}

/** Shot to fielder. */
const SHOTS: { q: string; right: string; wrong: string[]; why: string }[] = [
  {
    q: 'The batter plays a cover drive along the ground. Which fielder is placed to stop it?',
    right: 'Cover',
    wrong: ['Square leg', 'Fine leg'],
    why: 'A cover drive goes through the off side in front of square, where cover stands.',
  },
  {
    q: 'The batter pushes at a ball outside off stump and edges it behind. Who is waiting to catch it?',
    right: 'Slip',
    wrong: ['Mid-on', 'Square leg'],
    why: 'An edge flies behind on the off side, next to the wicketkeeper, where the slips stand.',
  },
  {
    q: 'The batter pulls a short ball along the ground. Which fielder is placed to stop it?',
    right: 'Mid-wicket or square leg',
    wrong: ['Point or cover', 'Mid-off or long-off'],
    why: 'A pull goes to the leg side, in front of or level with the batter: mid-wicket and square leg.',
  },
  {
    q: 'The batter plays a square cut along the ground. Which fielder is placed to stop it?',
    right: 'Point',
    wrong: ['Mid-wicket', 'Long-on'],
    why: 'A square cut goes square on the off side, level with the batter, where point stands.',
  },
  {
    q: 'The batter drives straight, past the bowler on the off side. Which fielder stops it?',
    right: 'Mid-off',
    wrong: ['Gully', 'Fine leg'],
    why: 'Straight drives on the off side of the bowler go to mid-off (or long-off on the boundary).',
  },
  {
    q: 'The batter glances the ball off the pads, fine behind on the leg side. Who stops it on the boundary?',
    right: 'Fine leg',
    wrong: ['Third man', 'Cover'],
    why: 'Fine leg stands behind the batter on the leg side, near the boundary. Third man is the same place on the off side.',
  },
];

function shotQuestion(i: number, hand: Hand): FieldQuestion {
  const s = SHOTS[i];
  return { q: s.q, hand, show: ALL, highlight: [], sides: true, batterLabel: hand === 'right' ? 'Right-handed batter' : 'Left-handed batter', ...withAnswer(s.right, s.wrong), why: s.why };
}

const INSIDE = ['slip', 'gully', 'point', 'cover', 'mid-off', 'mid-on', 'mid-wicket', 'square-leg'];
const OUTSIDE = ['fine-leg', 'third-man', 'long-off', 'long-on', 'deep-point', 'deep-square-leg', 'deep-cover', 'deep-mid-wicket'];

/** Is this field allowed in this over? The learner counts the fielders outside the circle. */
export function powerplayQuestion(hand: Hand, format: Format, over: number, outside: number): FieldQuestion {
  const out = shuffle(OUTSIDE).slice(0, outside);
  const inside = shuffle(INSIDE).slice(0, 9 - outside);
  const show = ['keeper', ...inside, ...out];
  const counted = fieldPositions(hand).filter((p) => show.includes(p.id) && isOutsideCircle(p)).length;
  const limit = maxOutside(format, over);
  const ok = counted <= limit;
  const name = format === 'odi' ? 'one-day (50-over)' : 'T20';
  const phase =
    format === 't20'
      ? over <= 6 ? 'overs 1 to 6 (the powerplay)' : 'overs 7 to 20'
      : over <= 10 ? 'overs 1 to 10 (the first powerplay)' : over <= 40 ? 'overs 11 to 40' : 'overs 41 to 50';
  return {
    q: `A ${name} match, over ${over}. Count the fielders outside the dashed circle. Is this field allowed?`,
    hand,
    show,
    highlight: [],
    sides: true,
    batterLabel: hand === 'right' ? 'Right-handed batter' : 'Left-handed batter',
    options: ['Yes, it is allowed', 'No, too many outside the circle'],
    answer: ok ? 0 : 1,
    why: `There ${counted === 1 ? 'is 1 fielder' : `are ${counted} fielders`} outside the circle. In ${phase} of a ${name} match at most ${limit} may be outside, so ${ok ? 'this field is allowed' : 'it is a no-ball, and the next ball is a free hit'}.`,
  };
}

function randomPowerplay(): FieldQuestion {
  const format: Format = pick(['odi', 't20']);
  const over = format === 't20' ? pick([2, 4, 5, 9, 15]) : pick([3, 7, 18, 33, 45]);
  const limit = maxOutside(format, over);
  const outside = Math.max(1, Math.min(5, limit + pick([-1, 0, 1])));
  return powerplayQuestion(pick(HANDS), format, over, outside);
}

/** Ten questions: four about reading the batter's hand and the off side, four shots, then two powerplay fields. */
export function makeFieldQuestions(): FieldQuestion[] {
  const [h1, h2] = shuffle(HANDS);
  const shots = shuffle(SHOTS.map((_, i) => i)).slice(0, 4);
  return [
    whoFromSlips(h1),
    whoFromSlips(h2),
    pick([whoFromOneSlip, whoFromLegSide])(pick(HANDS)),
    whichOffSide(pick(HANDS)),
    ...shots.map((i) => shotQuestion(i, pick(HANDS))),
    randomPowerplay(),
    randomPowerplay(),
  ];
}
