import type { Skill } from '@/lib/pose/benchmarks';

/**
 * Filmed demonstrations (optional).
 *
 * The "Watch" part of each demonstration plays the animated 3D figure by default. If you film
 * a coach or a player doing the skill, the app plays your video there instead, and the voice
 * explanation follows it.
 *
 *   1. Put the file in assets/demo, for example assets/demo/stance.mp4.
 *      Film it upright (portrait) and keep it short: 10 to 20 seconds, under about 5 MB.
 *   2. Replace `null` below with require('@/assets/demo/stance.mp4').
 *   3. Restart with: npx expo start --clear
 *
 * Only use footage you have permission to use, and get the player's written consent.
 */
export const DEMO_VIDEOS: Record<Skill, number | null> = {
  grip: null, // require('@/assets/demo/grip.mp4'),
  stance: null, // require('@/assets/demo/stance.mp4'),
  defence: null, // require('@/assets/demo/defence.mp4'),
  drive: null, // require('@/assets/demo/drive.mp4'),
  backdefence: null,
  pull: null,
  cut: null,
  sweep: null,
};
