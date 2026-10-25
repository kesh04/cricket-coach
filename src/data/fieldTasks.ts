import type { Hand } from '@/lib/pose/landmarks';
import { fieldPositions, isOutsideCircle } from './fieldPositions';

/**
 * "Set the field": the learner is given an empty field and told to place one fielder at a time
 * (a slip, a gully, a cover...). A tap counts when it is close enough to the real position.
 * Coordinates are in field radii, as in fieldPositions.ts.
 */
export type SetTask = { id: string; hand: Hand; say: string; why: string };

/** How close a tap must be to count, in field radii. Wider for boundary positions. */
export const tolerance = (id: string) => {
  const p = fieldPositions('right').find((f) => f.id === id);
  return p && isOutsideCircle(p) ? 0.2 : 0.13;
};

const WHY: Record<string, string> = {
  slip: 'A slip stands next to the wicketkeeper on the off side, a little wider, to catch an edge.',
  gully: 'Gully is wider than the slips on the off side, behind square, for thicker edges and cuts in the air.',
  point: 'Point is level with the batter on the off side, inside the circle, for the cut.',
  cover: 'Cover is on the off side in front of square, inside the circle, for the cover drive.',
  'mid-off': 'Mid-off is near the bowler on the off side, for the straight drive.',
  'mid-on': 'Mid-on is near the bowler on the leg side, for the straight drive and the push.',
  'mid-wicket': 'Mid-wicket is on the leg side in front of square, for the flick and the pull.',
  'square-leg': 'Square leg is level with the batter on the leg side, for the pull and the sweep.',
  'fine-leg': 'Fine leg is behind the batter on the leg side near the boundary, for the glance.',
  'third-man': 'Third man is behind the batter on the off side near the boundary, for edges that run away.',
  'long-off': 'Long-off is on the boundary behind the bowler on the off side, for big straight hits.',
  'long-on': 'Long-on is on the boundary behind the bowler on the leg side.',
  'deep-point': 'Deep point is on the boundary, square on the off side, to stop the cut going for four.',
  'deep-square-leg': 'Deep square leg is on the boundary, square on the leg side, for the pull.',
};

const nameOf = (id: string) => fieldPositions('right').find((p) => p.id === id)!.name;
const other = (h: Hand): Hand => (h === 'right' ? 'left' : 'right');

/**
 * Ten tasks. The first seven build a new-ball field for the learner's own hand; then a batter of
 * the other hand comes in and the learner places the slip, the gully and square leg again, on the
 * other side.
 */
export function makeSetTasks(hand: Hand): SetTask[] {
  const first = ['slip', 'gully', 'point', 'cover', 'mid-off', 'mid-on', 'fine-leg'];
  const second = ['slip', 'gully', 'square-leg'];
  const h2 = other(hand);
  return [
    ...first.map((id) => ({ id, hand, say: `Place a ${nameOf(id).toLowerCase()}`, why: WHY[id] })),
    ...second.map((id, i) => ({
      id,
      hand: h2,
      say: `${i === 0 ? `A ${h2}-handed batter comes in. ` : ''}Place a ${nameOf(id).toLowerCase()} for the ${h2}-hander`,
      why: `${WHY[id]} For a ${h2}-handed batter the off side is on the ${h2 === 'right' ? 'left' : 'right'} of the picture, so it moves across.`,
    })),
  ];
}

export type Placement = { ok: boolean; distance: number; nearest: string; sideOk: boolean };

/** Judges a tap at (x, y) for fielder `id` and a batter of `hand`. */
export function judgePlacement(hand: Hand, id: string, x: number, y: number): Placement {
  const all = fieldPositions(hand);
  const target = all.find((p) => p.id === id);
  if (!target) throw new Error(`unknown position ${id}`);
  const distance = Math.hypot(x - target.x, y - target.y);
  let nearest = all[0];
  for (const p of all) if (Math.hypot(x - p.x, y - p.y) < Math.hypot(x - nearest.x, y - nearest.y)) nearest = p;
  const sideOk = Math.abs(target.x) < 0.05 || Math.sign(x) === Math.sign(target.x);
  return { ok: distance <= tolerance(id), distance, nearest: nearest.name, sideOk };
}

/** Powerplay limits: the most fielders allowed outside the circle. */
export type Format = 'odi' | 't20';
export function maxOutside(format: Format, over: number): number {
  if (format === 't20') return over <= 6 ? 2 : 5;
  if (over <= 10) return 2;
  if (over <= 40) return 4;
  return 5;
}
