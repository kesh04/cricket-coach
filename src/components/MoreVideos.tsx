import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, H3, Small } from '@/components/ui';
import { MORE_VIDEOS } from '@/data/videos';
import type { Skill } from '@/lib/pose/benchmarks';
import { C, sp } from '@/theme';

/** Links to coaching videos for extra learning. They open outside the app. */
export function MoreVideos({ skill }: { skill: Skill }) {
  const videos = MORE_VIDEOS[skill];
  if (!videos.length) return null;
  return (
    <Card>
      <H3>Learn more from videos</H3>
      <Small>These open in YouTube or your browser. Ask a parent first if you are under 13.</Small>
      <View style={{ gap: sp(1) }}>
        {videos.map((v) => (
          <Pressable
            key={v.url}
            accessibilityRole="link"
            accessibilityLabel={`${v.title}, ${v.source}`}
            onPress={() => void Linking.openURL(v.url)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <Ionicons name={v.source.startsWith('YouTube') ? 'logo-youtube' : 'play-circle'} size={26} color={v.source.startsWith('YouTube') ? '#E62117' : C.outfield} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{v.title}</Text>
              <Small>{v.source}</Small>
            </View>
            <Ionicons name="open-outline" size={18} color={C.inkMute} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(3), minHeight: 52 },
  title: { fontSize: 15, fontWeight: '600', color: C.ink },
});
