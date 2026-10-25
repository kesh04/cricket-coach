import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Small } from '@/components/ui';
import { clipUri } from '@/services/clips';
import { C, R, sp } from '@/theme';

const SPEEDS = [1, 0.5, 0.25];

/**
 * Plays the video of a practice set again, with the skeleton and the stumps drawn on it.
 * The learner can slow it down to see each part of the movement.
 */
export function ClipPlayer({ file, title }: { file: string; title: string }) {
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void clipUri(file).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [file]);

  if (uri === undefined) return null;
  if (uri === null) return <Small>The video of this set is no longer on this phone. Only the newest few are kept.</Small>;
  return <Player uri={uri} title={title} />;
}

function Player({ uri, title }: { uri: string; title: string }) {
  const [speed, setSpeed] = useState(1);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    player.playbackRate = speed;
  }, [player, speed]);

  return (
    <View style={{ gap: sp(2) }}>
      <View style={styles.head}>
        <Ionicons name="videocam" size={20} color={C.outfield} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls playsInline />
      <View style={styles.speeds}>
        <Small>Speed:</Small>
        {SPEEDS.map((s) => (
          <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: speed === s }} onPress={() => setSpeed(s)} style={[styles.speed, speed === s && styles.speedOn]}>
            <Text style={[styles.speedText, speed === s && { color: '#FFFFFF' }]}>{s === 1 ? 'Normal' : `${s}×`}</Text>
          </Pressable>
        ))}
      </View>
      <Small>The video is kept on this phone only.</Small>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  title: { fontSize: 17, fontWeight: '700', color: C.ink },
  video: { width: '100%', aspectRatio: 3 / 4, maxHeight: 480, borderRadius: R.lg, backgroundColor: C.night },
  speeds: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  speed: { paddingHorizontal: sp(3), paddingVertical: sp(1.5), borderRadius: R.pill, backgroundColor: C.outfieldTint },
  speedOn: { backgroundColor: C.outfield },
  speedText: { fontSize: 14, fontWeight: '600', color: C.outfield },
});
