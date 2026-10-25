import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { C } from '@/theme';

export type ChartPoint = { value: number; label: string };

/**
 * A single-series line chart on a fixed 0 to 100 scale.
 * Tap a point to read its value. The newest point is always labelled.
 */
export function LineChart({ points, height = 170, describe }: { points: ChartPoint[]; height?: number; describe: string }) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const left = 30;
  const right = 20;
  const top = 26;
  const bottom = 12;
  const plotW = Math.max(1, width - left - right);
  const plotH = height - top - bottom;
  const x = (i: number) => left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => top + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const shown = picked ?? points.length - 1;

  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={describe}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {[0, 50, 100].map((g) => (
              <Line key={g} x1={left} x2={width - right} y1={y(g)} y2={y(g)} stroke={C.line} strokeWidth={1} />
            ))}
            {points.length > 1 ? <Path d={path} stroke={C.outfield} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {points.map((p, i) => (
              <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === shown ? 6.5 : 4.5} fill={C.outfield} stroke={C.surface} strokeWidth={2} />
            ))}
            {/* Larger invisible targets so points are easy to tap. */}
            {points.map((p, i) => (
              <Circle key={`t${i}`} cx={x(i)} cy={y(p.value)} r={18} fill="transparent" onPress={() => setPicked(i === picked ? null : i)} />
            ))}
          </Svg>
          {[0, 50, 100].map((g) => (
            <Text key={g} style={[styles.axis, { top: y(g) - 8 }]}>
              {g}
            </Text>
          ))}
          {points[shown] ? (
            <View style={[styles.tip, { left: Math.max(left, Math.min(width - 96, x(shown) - 48)), top: Math.max(0, y(points[shown].value) - 34) }]} pointerEvents="none">
              <Text style={styles.tipText}>
                {points[shown].value} on {points[shown].label}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { position: 'absolute', left: 0, width: 24, textAlign: 'right', fontSize: 11, color: C.inkMute },
  tip: { position: 'absolute', width: 96, alignItems: 'center' },
  tipText: { fontSize: 12, fontWeight: '600', color: C.ink, backgroundColor: C.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
});
