import type { Vec3 } from './landmarks';

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));

const DEG = 180 / Math.PI;

/** Angle in degrees between two vectors. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const d = len(a) * len(b);
  if (d < 1e-9) return 0;
  const c = Math.min(1, Math.max(-1, dot(a, b) / d));
  return Math.acos(c) * DEG;
}

/**
 * Angle at joint B between the neighbouring landmarks A and C, in degrees.
 * This is Equation 4.1 in the report: theta = arccos((BA . BC) / (|BA| |BC|)).
 */
export function jointAngle(a: Vec3, b: Vec3, c: Vec3): number {
  return angleBetween(sub(a, b), sub(c, b));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
