import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { BatSeen } from '@/lib/pose/batDetect';
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { PoseAssets, PoseFacing } from '@/lib/pose/poseHtml';

export type PoseStatus =
  | 'permission'
  | 'starting'
  | 'ready'
  | 'camera-denied'
  | 'camera-missing'
  | 'camera-busy'
  | 'model-failed';

export type PoseCommand = {
  /** Landmark indices to mark in red on the skeleton. */
  highlights?: number[];
  /** Skeleton colour: green when the stance is good. */
  tone?: 'idle' | 'good';
  paused?: boolean;
  facing?: PoseFacing;
  /** Ask the page for a still picture. Use `snapshot()` on the camera handle instead of sending this. */
  snapshot?: boolean;
  /** The learner's batting hand, so the stumps go behind the back foot. */
  hand?: 'right' | 'left';
  /** Where the phone is, so the stumps are drawn in the right place. */
  view?: 'front' | 'side';
  /** Stumps behind the learner: hidden, following the learner, or locked where they are. */
  stumps?: 'off' | 'show' | 'lock';
  /** Start recording a repetition, or stop and keep it in the named slots (null throws it away). */
  rec?: 'start' | 'stop';
  keep?: string[] | null;
  /** Play a kept video over the camera picture, or null to go back to the camera. */
  replay?: string | null;
  /** Ask the page for a kept video. Use `clip()` on the camera handle instead of sending this. */
  sendClip?: string;
  /** Switch the phone's torch on or off (back camera, where the phone allows it). */
  torch?: boolean;
};

/** How bright the picture is, reported twice a second. */
export type PoseLight = {
  /** Mean brightness of the picture, 0 (black) to 255 (white). */
  level: number;
  /** True when the picture is too dark for a good reading. */
  dark: boolean;
  /** The torch of the camera in use: on, off, or 'none' when this camera has none the app can use. */
  torch: 'on' | 'off' | 'none';
  /** True when the picture is being brightened before the pose model sees it. */
  boosted: boolean;
};

export type PoseCameraHandle = {
  send(command: PoseCommand): void;
  /**
   * Takes a still picture of the learner with the skeleton drawn on it.
   * Resolves with a JPEG data URL, or null if the picture could not be taken.
   */
  snapshot(): Promise<string | null>;
  /** Gets a kept video of a repetition as a data URL, or null if there is none. */
  clip(slot: string): Promise<string | null>;
};

export type PoseCameraProps = {
  facing: PoseFacing;
  /** Called about 15 times a second with the latest landmarks. */
  onFrame(frame: PoseFrame): void;
  /** Called when a frame has no person in it. */
  onNoPose?(): void;
  onStatus?(status: PoseStatus, message: string | null): void;
  onFps?(fps: number): void;
  /** Called when a video of a repetition has been kept. */
  onClip?(slots: string[]): void;
  /** Called twice a second with how bright the picture is. */
  onLight?(light: PoseLight): void;
  /** Where to load MediaPipe and the model from. Leave unset to use the public CDN. */
  assets?: PoseAssets;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<PoseCameraHandle>;
};

export type PoseMessage =
  | { type: 'status'; status: PoseStatus; message: string | null }
  | { type: 'pose'; t: number; lm: number[]; world: number[]; bat?: BatSeen | null; aspect?: number | null }
  | { type: 'nopose' }
  | { type: 'fps'; fps: number }
  | { type: 'snapshot'; image: string | null }
  | { type: 'clip-ready'; slots: string[] }
  | { type: 'clip'; slot: string; data: string | null }
  | ({ type: 'light' } & PoseLight);
