import type { Hand } from '@/lib/pose/landmarks';

/**
 * Fielding positions for a right-handed batter.
 * Coordinates are in field radii from the middle of the pitch: x is across the field
 * (negative is the off side for a right-hander), y is along the pitch (negative is behind
 * the batter, positive is towards the bowler's end). For a left-hander x is mirrored.
 */
export type FieldPosition = { id: string; name: string; x: number; y: number; about: string };

export const STRIKER_Y = -0.13;
export const BOWLER_Y = 0.13;

const POSITIONS: FieldPosition[] = [
  { id: 'keeper', name: 'Wicketkeeper', x: 0, y: -0.25, about: 'Stands behind the stumps to take balls the batter misses or edges.' },
  { id: 'slip', name: 'Slip', x: -0.09, y: -0.28, about: 'Next to the wicketkeeper on the off side, waiting for edges off the bat.' },
  { id: 'gully', name: 'Gully', x: -0.23, y: -0.21, about: 'Wider than slip, for thicker edges that fly square.' },
  { id: 'point', name: 'Point', x: -0.43, y: -0.13, about: 'Level with the batter on the off side. Stops cuts and square drives.' },
  { id: 'cover', name: 'Cover', x: -0.43, y: 0.09, about: 'On the off side in front of the batter. Stops the cover drive.' },
  { id: 'mid-off', name: 'Mid-off', x: -0.18, y: 0.4, about: 'Straight, near the bowler, on the off side. Stops straight drives.' },
  { id: 'mid-on', name: 'Mid-on', x: 0.18, y: 0.4, about: 'Straight, near the bowler, on the leg side.' },
  { id: 'mid-wicket', name: 'Mid-wicket', x: 0.43, y: 0.09, about: 'On the leg side in front of the batter.' },
  { id: 'square-leg', name: 'Square leg', x: 0.43, y: -0.13, about: 'Level with the batter on the leg side.' },
  { id: 'fine-leg', name: 'Fine leg', x: 0.33, y: -0.78, about: 'Behind the batter on the leg side, near the boundary.' },
  { id: 'third-man', name: 'Third man', x: -0.4, y: -0.76, about: 'Behind the batter on the off side, near the boundary.' },
  { id: 'long-off', name: 'Long-off', x: -0.3, y: 0.86, about: 'On the boundary behind the bowler, on the off side.' },
  { id: 'long-on', name: 'Long-on', x: 0.3, y: 0.86, about: 'On the boundary behind the bowler, on the leg side.' },
  { id: 'deep-point', name: 'Deep point', x: -0.78, y: -0.12, about: 'On the boundary, square on the off side. Saves four from a cut.' },
  { id: 'deep-cover', name: 'Deep cover', x: -0.68, y: 0.46, about: 'On the boundary in front of square on the off side. Saves four from a drive.' },
  { id: 'deep-mid-wicket', name: 'Deep mid-wicket', x: 0.68, y: 0.46, about: 'On the boundary in front of square on the leg side. Catches the big pull or slog.' },
  { id: 'deep-square-leg', name: 'Deep square leg', x: 0.78, y: -0.12, about: 'On the boundary, square on the leg side. Saves four from a pull or sweep.' },
];

/** The fielding circle is drawn at half the field radius. */
export const CIRCLE = 0.5;
export const isOutsideCircle = (p: { x: number; y: number }) => Math.hypot(p.x, p.y) > CIRCLE;

export function fieldPositions(hand: Hand): FieldPosition[] {
  return hand === 'right' ? POSITIONS : POSITIONS.map((p) => ({ ...p, x: -p.x }));
}
