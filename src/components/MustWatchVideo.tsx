import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Small } from '@/components/ui';
import { YouTubeFrame, type YouTubeFrameHandle } from '@/components/YouTubeFrame';
import type { YouTubeMessage } from '@/lib/youtubeHtml';
import { C, F, R, sp } from '@/theme';

/** Share of the video that must really be played before it counts as watched. */
export const MUST_WATCH_SHARE = 0.85;

type Props = {
  videoId: string;
  title: string;
  source: string;
  /** Called once the whole video has been watched. */
  onFinished: () => void;
  /** Called when the learner chooses the in-app demonstration because the video cannot play. */
  onFallback: () => void;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * A coaching video that has to be watched to the end. The YouTube controls are hidden and links
 * out of the player are blocked, so it cannot be skipped forward or left for YouTube;
 * the learner can only play and pause. If it cannot play (no internet, or the video does not
 * allow playing in apps), the learner can watch the in-app demonstration instead.
 */
export function MustWatchVideo({ videoId, title, source, onFinished, onFallback }: Props) {
  const player = useRef<YouTubeFrameHandle>(null);
  const [key, setKey] = useState(0);
  const [state, setState] = useState<{ time: number; duration: number; watched: number; playing: boolean }>({ time: 0, duration: 0, watched: 0, playing: false });
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const finished = useRef(false);

  const onMessage = useCallback(
    (m: YouTubeMessage) => {
      if (m.type === 'ready') {
        setLoaded(true);
        setState((s) => ({ ...s, duration: m.duration }));
      } else if (m.type === 'progress') {
        setLoaded(true);
        setState({ time: m.time, duration: m.duration, watched: m.watched, playing: m.playing });
      } else if (m.type === 'ended') {
        if (finished.current) return;
        if (m.duration > 0 && m.watched >= MUST_WATCH_SHARE * m.duration) {
          finished.current = true;
          setNotice(null);
          onFinished();
        } else {
          setNotice('Please watch the whole video. It starts again from the beginning.');
          player.current?.restart();
        }
      } else if (m.type === 'error') {
        setProblem(
          m.code === 'timeout' || m.code === 'offline'
            ? 'The video could not load. It needs the internet.'
            : m.code === 101 || m.code === 150 || m.code === 153
              ? 'This video cannot be played inside the app.'
              : 'The video could not be played.',
        );
      }
    },
    [onFinished],
  );

  const share = state.duration ? Math.min(1, state.watched / state.duration) : 0;

  if (problem) {
    return (
      <View style={styles.problem}>
        <Ionicons name="cloud-offline" size={30} color={C.bad} />
        <Text style={styles.problemTitle}>{problem}</Text>
        <Small>Check the internet and try again. If it still does not play, watch the demonstration in the app instead.</Small>
        <Button
          title="Try again"
          icon="refresh"
          onPress={() => {
            setProblem(null);
            setLoaded(false);
            setKey((k) => k + 1);
          }}
        />
        <Button title="Watch the demonstration in the app instead" kind="secondary" onPress={onFallback} />
      </View>
    );
  }

  return (
    <View style={{ gap: sp(2.5) }}>
      <View style={styles.frame}>
        <YouTubeFrame key={key} ref={player} videoId={videoId} onMessage={onMessage} style={styles.fillAll} />
        {/* The player has no seek bar and links out of it are blocked, so a tap on it can only
            play or pause. A real tap also lets the phone start the sound. */}
      </View>

      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.playing ? 'Pause' : 'Play'}
          onPress={() => (state.playing ? player.current?.pause() : player.current?.play())}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.7 }]}>
          <Ionicons name={state.playing ? 'pause' : 'play'} size={24} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Small>
            {source} · {loaded ? `${clock(state.time)} of ${clock(state.duration)}` : 'Loading…'}
          </Small>
        </View>
        <Text style={styles.share}>{Math.round(share * 100)}%</Text>
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : <Small>Watch the whole video. It cannot be skipped. You can pause it. No sound? Turn the volume up, or tap the video.</Small>}
    </View>
  );
}

const styles = StyleSheet.create({
  fillAll: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.night },
  bigPlay: { position: 'absolute', alignSelf: 'center', top: '35%', width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(10,22,18,0.7)', alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.ball },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  play: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.outfield, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: C.ink },
  share: { fontFamily: F.displayBold, fontSize: 22, color: C.ink },
  notice: { fontSize: 14, fontWeight: '600', color: C.ball },
  problem: { gap: sp(2.5), padding: sp(4), borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'stretch' },
  problemTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
});
