import { createElement, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PoseCameraProps, PoseMessage } from './PoseCamera.types';
import { buildPoseHtml } from '@/lib/pose/poseHtml';
import { C } from '@/theme';

export type { PoseCameraHandle, PoseCommand, PoseLight, PoseStatus } from './PoseCamera.types';

/** Browser version of the pose camera: the same page, shown in an iframe. Used for testing on a computer. */
export function PoseCamera({ facing, onFrame, onNoPose, onStatus, onFps, onClip, onLight, assets, style, ref }: PoseCameraProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const initialFacing = useRef(facing);
  const html = useMemo(() => buildPoseHtml(initialFacing.current, assets), [assets]);

  const handlers = useRef({ onFrame, onNoPose, onStatus, onFps, onClip, onLight });
  handlers.current = { onFrame, onNoPose, onStatus, onFps, onClip, onLight };

  const send = (command: object) => {
    frame.current?.contentWindow?.postMessage({ ...command, __pose: true }, '*');
  };
  // A snapshot is asked for with a command and comes back as a message.
  const waiting = useRef<((image: string | null) => void) | null>(null);
  const snapshot = () =>
    new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        waiting.current = null;
        resolve(null);
      }, 1500);
      waiting.current = (image) => {
        clearTimeout(timer);
        waiting.current = null;
        resolve(image);
      };
      send({ snapshot: true });
    });
  // A video is asked for the same way. Videos are larger, so the wait is longer.
  const clipWaiting = useRef<((data: string | null) => void) | null>(null);
  const clip = (slot: string) =>
    new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        clipWaiting.current = null;
        resolve(null);
      }, 8000);
      clipWaiting.current = (data) => {
        clearTimeout(timer);
        clipWaiting.current = null;
        resolve(data);
      };
      send({ sendClip: slot });
    });
  useImperativeHandle(ref, () => ({ send, snapshot, clip }), []);

  useEffect(() => {
    send({ facing });
  }, [facing]);

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      let m: PoseMessage;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      const h = handlers.current;
      if (m.type === 'pose') h.onFrame({ t: m.t, lm: m.lm, world: m.world, bat: m.bat ?? null, aspect: m.aspect ?? null });
      else if (m.type === 'nopose') h.onNoPose?.();
      else if (m.type === 'status') h.onStatus?.(m.status, m.message);
      else if (m.type === 'fps') h.onFps?.(m.fps);
      else if (m.type === 'snapshot') waiting.current?.(m.image);
      else if (m.type === 'clip-ready') h.onClip?.(m.slots);
      else if (m.type === 'clip') clipWaiting.current?.(m.data);
      else if (m.type === 'light') h.onLight?.({ level: m.level, dark: m.dark, torch: m.torch, boosted: m.boosted });
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  return (
    <View style={[styles.fill, style]}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        allow: 'camera',
        title: 'Pose camera',
        style: { border: 0, width: '100%', height: '100%', background: C.night },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.night },
});
