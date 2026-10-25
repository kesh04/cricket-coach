import { useCameraPermissions } from 'expo-camera';
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewHandle, type WebViewMessageEvent } from '@/components/AppWebView';

import type { PoseCameraProps, PoseMessage } from './PoseCamera.types';
import { Button } from '@/components/ui';
import { buildPoseHtml } from '@/lib/pose/poseHtml';
import { C } from '@/theme';

export type { PoseCameraHandle, PoseCommand, PoseLight, PoseStatus } from './PoseCamera.types';

/**
 * Live camera with on-device pose estimation.
 * The camera and the pose model run inside a WebView (see lib/pose/poseHtml.ts).
 */
export function PoseCamera({ facing, onFrame, onNoPose, onStatus, onFps, onClip, onLight, assets, style, ref }: PoseCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const web = useRef<WebViewHandle>(null);

  // Build the page once. Camera switches are sent as commands so the model is not reloaded.
  const initialFacing = useRef(facing);
  const html = useMemo(() => buildPoseHtml(initialFacing.current, assets), [assets]);

  const send = (command: object) => {
    web.current?.injectJavaScript(`window.__cmd && window.__cmd(${JSON.stringify(command)}); true;`);
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
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
    if (permission && !permission.granted) onStatus?.('permission', null);
  }, [permission?.granted, permission?.canAskAgain]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: PoseMessage;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'pose') onFrame({ t: m.t, lm: m.lm, world: m.world, bat: m.bat ?? null, aspect: m.aspect ?? null });
    else if (m.type === 'nopose') onNoPose?.();
    else if (m.type === 'status') onStatus?.(m.status, m.message);
    else if (m.type === 'fps') onFps?.(m.fps);
    else if (m.type === 'snapshot') waiting.current?.(m.image);
    else if (m.type === 'clip-ready') onClip?.(m.slots);
    else if (m.type === 'clip') clipWaiting.current?.(m.data);
    else if (m.type === 'light') onLight?.({ level: m.level, dark: m.dark, torch: m.torch, boosted: m.boosted });
  };

  if (!permission) return <View style={[styles.fill, style]} />;

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.centre, style]}>
        <Text style={styles.title}>Allow the camera</Text>
        <Text style={styles.text}>
          The camera is needed to see how you stand. The video is analysed on your phone and is never uploaded.
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" icon="camera" onPress={() => void requestPermission()} />
        ) : (
          <Button title="Open settings" icon="settings" onPress={() => void Linking.openSettings()} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.fill, style]}>
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsFullscreenVideo={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        style={styles.web}
        containerStyle={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.night },
  web: { flex: 1, backgroundColor: C.night },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  text: { color: '#D5DDD7', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 6 },
});
