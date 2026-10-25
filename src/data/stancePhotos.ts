import type { ImageSourcePropType } from 'react-native';

import type { Hand } from '@/lib/pose/landmarks';

/**
 * Photos of a real player in the batting stance, taken from eight places around them.
 * Dragging across the picture steps through them, so the player appears to turn.
 *
 * HOW TO TAKE THE PHOTOS
 *   1. Ask your player to stand in the stance, with bat and pads, and not move.
 *   2. Hold the phone upright at about waist height, 3 to 4 metres away. Keep the whole body in the picture.
 *   3. Take photo 1 from the off side, facing the player's chest (where point fields).
 *   4. Walk a quarter of the way towards the bowler's end and take photo 2. Keep the same distance.
 *   5. Carry on round the player in the same direction:
 *        1 off side          2 between          3 bowler's end      4 between
 *        5 leg side          6 between          7 behind the stumps 8 between
 *   6. Save them as 1.jpg to 8.jpg in assets/stance, replacing the sample pictures.
 *      Keep each file under about 300 KB (around 900 pixels tall is plenty).
 *   7. Set PHOTOS_ARE_REAL to true and PHOTOGRAPHED_HAND to the hand your player bats with.
 *
 * You only need one player. For a learner who bats with the other hand, the photos are mirrored.
 * Get the player's written permission before putting their photos in the app.
 */
export const STANCE_PHOTOS: ImageSourcePropType[] = [
  require('@/assets/stance/1.jpg'),
  require('@/assets/stance/2.jpg'),
  require('@/assets/stance/3.jpg'),
  require('@/assets/stance/4.jpg'),
  require('@/assets/stance/5.jpg'),
  require('@/assets/stance/6.jpg'),
  require('@/assets/stance/7.jpg'),
  require('@/assets/stance/8.jpg'),
];

/** Change to true once the eight sample pictures have been replaced with real photos. */
export const PHOTOS_ARE_REAL = false;

/** The hand the photographed player bats with. */
export const PHOTOGRAPHED_HAND: Hand = 'right';

/** What the learner is looking at for each photo. Empty for the in-between views. */
export const VIEW_NAMES = ['From the off side', '', "From the bowler's end", '', 'From the leg side', '', 'From behind the stumps', ''];
