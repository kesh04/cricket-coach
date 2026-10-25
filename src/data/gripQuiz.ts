import type { GripFault } from '@/components/GripDiagram';

/**
 * "Spot the mistake": the grip is drawn with one mistake (or none) and the learner names it.
 * Each answer explains what the mistake does to the bat and how to fix it.
 */
export type GripQuestion = { fault: GripFault | null; options: string[]; answer: number; why: string };

export const GRIP_ANSWERS: Record<GripFault | 'none', { option: string; why: string }> = {
  swapped: {
    option: 'The wrong hand is on top',
    why: 'The top hand must be the hand of your front arm: the left hand for a right-hander, the right hand for a left-hander. With the other hand on top you are holding the bat the other way round. Put the bat down and pick it up again, top hand first.',
  },
  apart: {
    option: 'The hands are too far apart',
    why: 'With a gap between them the two hands fight each other and the bat twists. Slide the bottom hand up until it touches, or almost touches, the top hand.',
  },
  low: {
    option: 'The hands are too low on the handle',
    why: 'Held low, near the blade, the bat feels short and the bottom hand takes over. Put the top hand near the top of the handle, about one finger-width from the end, and the bottom hand just below it.',
  },
  vees: {
    option: 'The Vs point at the inside edge',
    why: 'The V between thumb and first finger must point down the back of the bat, between the middle and the outside edge. Pointing at the inside edge, it turns the face of the bat, and the ball goes in the air or to the wrong side.',
  },
  fist: {
    option: 'The bottom hand is squeezing too hard',
    why: 'A tight bottom hand pulls the bat across the ball. Hold firmly with the top hand only; keep the bottom hand relaxed, thumb and first two fingers, as if holding an egg.',
  },
  none: {
    option: 'Nothing: this is a good grip',
    why: 'Right hand order, hands close together near the top, both Vs in a line between the middle and the outside edge, and a relaxed bottom hand. That is a good grip.',
  },
};

const FAULTS: GripFault[] = ['swapped', 'apart', 'low', 'vees', 'fist'];

function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Six questions: each mistake once and one good grip, in a random order, four options each. */
export function makeGripQuestions(): GripQuestion[] {
  const items: (GripFault | null)[] = shuffle([...FAULTS, null]);
  return items.map((fault) => {
    const key = fault ?? 'none';
    const others = shuffle((Object.keys(GRIP_ANSWERS) as (GripFault | 'none')[]).filter((k) => k !== key)).slice(0, 3);
    const options = shuffle<GripFault | 'none'>([key, ...others]).map((k) => GRIP_ANSWERS[k].option);
    return { fault, options, answer: options.indexOf(GRIP_ANSWERS[key].option), why: GRIP_ANSWERS[key].why };
  });
}
