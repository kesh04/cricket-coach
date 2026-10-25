import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';

/**
 * Plays a filmed demonstration, then reports that it has ended.
 * Loaded only when a video is set in data/demoVideos.ts.
 */
export default function DemoVideo({ source, height, onEnd }: { source: number; height: number; onEnd: () => void }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.play();
  });
  useEventListener(player, 'playToEnd', onEnd);

  // Start again once the view is on screen, for players that ignore the first request.
  // If the phone still refuses to start it, the play button on the video does.
  useEffect(() => {
    try {
      player.play();
    } catch {
      // The learner can press play.
    }
  }, [player]);

  return <VideoView player={player} style={{ height, borderRadius: 22, backgroundColor: '#0A1612' }} contentFit="contain" nativeControls playsInline />;
}
