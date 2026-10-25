import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';

import { buildYouTubeHtml, type YouTubeMessage } from '@/lib/youtubeHtml';

export type YouTubeFrameHandle = { play(): void; pause(): void; restart(): void };
type Props = { videoId: string; onMessage: (m: YouTubeMessage) => void; style?: ViewStyle };

/** Web version: the same page in an iframe. */
export const YouTubeFrame = forwardRef<YouTubeFrameHandle, Props>(function YouTubeFrame({ videoId, onMessage, style }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => buildYouTubeHtml(videoId), [videoId]);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const send = (c: object) => frame.current?.contentWindow?.postMessage({ ...c, __ytcmd: true }, '*');
  useImperativeHandle(ref, () => ({ play: () => send({ play: true }), pause: () => send({ pause: true }), restart: () => send({ restart: true }) }), []);

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data);
        if (m.__yt) handler.current(m as YouTubeMessage);
      } catch {
        // Not ours.
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  return (
    <View style={style}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        allow: 'autoplay; encrypted-media',
        title: 'Coaching video',
        style: { border: 0, width: '100%', height: '100%', background: '#0A1612' },
      })}
    </View>
  );
});
