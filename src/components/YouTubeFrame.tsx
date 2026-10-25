import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { ViewStyle } from 'react-native';
import { WebView, type WebViewHandle } from '@/components/AppWebView';

import { buildYouTubeHtml, YOUTUBE_ORIGIN, type YouTubeMessage } from '@/lib/youtubeHtml';

export type YouTubeFrameHandle = { play(): void; pause(): void; restart(): void };
type Props = { videoId: string; onMessage: (m: YouTubeMessage) => void; style?: ViewStyle };

/** The YouTube page in a WebView. Links inside the player cannot open, so the video cannot be left. */
export const YouTubeFrame = forwardRef<YouTubeFrameHandle, Props>(function YouTubeFrame({ videoId, onMessage, style }, ref) {
  const web = useRef<WebViewHandle>(null);
  const html = useMemo(() => buildYouTubeHtml(videoId), [videoId]);
  const run = (cmd: string) => web.current?.injectJavaScript(`window.__cmd && window.__cmd(${cmd}); true;`);
  useImperativeHandle(ref, () => ({ play: () => run('{play:true}'), pause: () => run('{pause:true}'), restart: () => run('{restart:true}') }), []);

  return (
    <WebView
      ref={web}
      style={[{ backgroundColor: '#0A1612' }, style]}
      source={{ html, baseUrl: YOUTUBE_ORIGIN }}
      originWhitelist={['*']}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo={false}
      setSupportMultipleWindows={false}
      // Only the page itself and the player may load; tapping the YouTube logo or title does nothing.
      onShouldStartLoadWithRequest={(req) => req.url.startsWith(YOUTUBE_ORIGIN) || req.url.startsWith('about:') || req.isTopFrame === false}
      onMessage={(e) => {
        try {
          onMessage(JSON.parse(e.nativeEvent.data) as YouTubeMessage);
        } catch {
          // Not a message from the player page.
        }
      }}
    />
  );
});
