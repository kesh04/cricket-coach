import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { PHOTOGRAPHED_HAND, STANCE_PHOTOS, VIEW_NAMES } from '@/data/stancePhotos';
import type { Hand } from '@/lib/pose/landmarks';
import { C } from '@/theme';

const DRAG_PER_PHOTO = 42; // pixels of drag to move to the next photo

/**
 * A real player in the batting stance, shown as photos taken from all round.
 * Drag left or right to turn the player. For a learner who bats with the other hand
 * the photos are mirrored, so one set of photos serves both.
 */
export function StancePhotos({ hand, height = 380, hint, style }: { hand: Hand; height?: number; hint?: string; style?: ViewStyle }) {
  const count = STANCE_PHOTOS.length;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const startIndex = useRef(0);
  const mirrored = hand !== PHOTOGRAPHED_HAND;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          startIndex.current = indexRef.current;
        },
        onPanResponderMove: (_e, g) => {
          const steps = Math.round(-g.dx / DRAG_PER_PHOTO);
          const next = (((startIndex.current + steps) % count) + count) % count;
          if (next !== indexRef.current) {
            indexRef.current = next;
            setIndex(next);
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [count],
  );

  // A mirrored player turns the other way, so the photos are walked through in reverse.
  const shown = mirrored ? (count - index) % count : index;
  const viewName = VIEW_NAMES[index] ?? '';

  return (
    <View
      style={[styles.stage, { height }, style]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Photo of the batting stance. ${viewName || `View ${index + 1} of ${count}`}`}
      {...responder.panHandlers}>
      {/* Every photo stays mounted so that turning is instant; only the current one is visible. */}
      {STANCE_PHOTOS.map((source, i) => (
        <Image
          key={i}
          source={source}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, styles.photo, { opacity: i === shown ? 1 : 0 }, mirrored && { transform: [{ scaleX: -1 }] }]}
        />
      ))}

      {viewName ? (
        <View style={styles.viewName} pointerEvents="none">
          <Text style={styles.label}>{viewName}</Text>
        </View>
      ) : null}

      <View style={styles.footer} pointerEvents="none">
        <View style={styles.dots}>
          {STANCE_PHOTOS.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        {hint ? <Text style={styles.label}>{hint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: C.night, borderRadius: 22, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  viewName: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  footer: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center', gap: 8 },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    backgroundColor: 'rgba(10,22,18,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  dots: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(10,22,18,0.6)', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#FFFFFF' },
});
