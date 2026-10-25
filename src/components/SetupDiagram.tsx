import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import type { Skill } from '@/lib/pose/benchmarks';
import type { Hand } from '@/lib/pose/landmarks';
import { C } from '@/theme';

type Props = { skill: Skill; hand: Hand; view?: 'front' | 'side'; height?: number; style?: ViewStyle };

const W = 320;
const H = 250;
const WHITE = '#FFFFFF';
const SOFT = '#DDEBE3';
// On the web an SVG has no default font, so name one. Phones use their own.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' : undefined;

/**
 * Where to put the phone, seen from above.
 *
 * For the stance the phone goes on the batter's off side, where the chest points. It does not
 * go at the bowler's end: from there the body is side-on and half of it is hidden.
 * For the grip the learner simply faces the phone.
 */
export function SetupDiagram({ skill, hand, view = 'side', height = 250, style }: Props) {
  const text = (x: number, y: number, t: string, o: { size?: number; bold?: boolean; fill?: string; anchor?: 'start' | 'middle' | 'end' } = {}) => (
    <SvgText x={x} y={y} fill={o.fill ?? WHITE} fontSize={o.size ?? 13} fontWeight={o.bold ? '700' : '500'} fontFamily={FONT} textAnchor={o.anchor ?? 'middle'}>
      {t}
    </SvgText>
  );

  // A phone seen from above, with the area it can see. `dir` is the way it looks: 1 right, -1 left, 0 up.
  const phone = (x: number, y: number, dir: 1 | -1 | 0, ok = true) => {
    const cone =
      dir === 0
        ? `${x},${y} ${x - 46},${y - 96} ${x + 46},${y - 96}`
        : `${x},${y} ${x + dir * 104},${y - 44} ${x + dir * 104},${y + 44}`;
    return (
      <G opacity={ok ? 1 : 0.9}>
        {ok ? <Polygon points={cone} fill="rgba(255,255,255,0.16)" /> : null}
        {dir === 0 ? <Rect x={x - 13} y={y - 4} width={26} height={8} rx={3} fill={ok ? WHITE : '#FFB4B6'} /> : <Rect x={x - 4} y={y - 13} width={8} height={26} rx={3} fill={ok ? WHITE : '#FFB4B6'} />}
      </G>
    );
  };

  // A batter seen from above: shoulders, head and the way the chest faces.
  // `chest` is the way the chest points: 1 right, -1 left, 0 down the page.
  const person = (x: number, y: number, chest: 1 | -1 | 0) =>
    chest === 0 ? (
      <G>
        <Ellipse cx={x} cy={y} rx={22} ry={10} fill={WHITE} />
        <Circle cx={x} cy={y + 2} r={9} fill="#1E7A4F" stroke={WHITE} strokeWidth={2} />
        {/* The bat, held upright in front: seen from above it is a short bar. */}
        <Rect x={x - 7} y={y + 16} width={14} height={5} rx={2} fill={C.willow} />
      </G>
    ) : (
      <G>
        {/* Feet, one each side of the crease, toes towards the off side. */}
        <Ellipse cx={x + chest * 4} cy={y - 14} rx={9} ry={4.5} fill={SOFT} />
        <Ellipse cx={x + chest * 4} cy={y + 14} rx={9} ry={4.5} fill={SOFT} />
        <Ellipse cx={x} cy={y} rx={10} ry={22} fill={WHITE} />
        <Circle cx={x + chest * 2} cy={y - 2} r={9} fill="#1E7A4F" stroke={WHITE} strokeWidth={2} />
      </G>
    );

  if (skill === 'grip') {
    return (
      <View style={[styles.stage, { height }, style]} accessibilityRole="image" accessibilityLabel="Seen from above: stand facing the phone, about 2 metres away, holding the bat in front of you.">
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          {phone(W / 2, 222, 0)}
          {person(W / 2, 70, 0)}
          <Line x1={W / 2} y1={100} x2={W / 2} y2={208} stroke={WHITE} strokeWidth={2} strokeDasharray="6 7" />
          {text(W / 2 + 12, 160, '2 metres', { anchor: 'start', bold: true })}
          {text(W / 2 + 12, 177, '3 big steps', { anchor: 'start', fill: SOFT, size: 12 })}
          {text(W / 2, 42, 'You, facing the phone', { bold: true })}
          {text(W / 2 - 24, 238, 'Phone', { anchor: 'end', bold: true })}
        </Svg>
      </View>
    );
  }

  if (view === 'front') {
    // The phone stands where the bowler would be, looking down the pitch at the batter.
    const bx = W / 2;
    const by = 168;
    const off = hand === 'right' ? 1 : -1;
    return (
      <View
        style={[styles.stage, { height }, style]}
        accessibilityRole="image"
        accessibilityLabel="Seen from above: the phone stands where the bowler would be, about 3 to 4 metres in front of you. You stand side-on, with your front shoulder pointing at the phone.">
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Rect x={bx - 30} y={0} width={60} height={H} fill={C.pitch} opacity={0.95} />
          <Line x1={bx - 30} y1={by + 26} x2={bx + 30} y2={by + 26} stroke={WHITE} strokeWidth={2.5} />
          {[-6, 0, 6].map((d) => (
            <Circle key={d} cx={bx + d} cy={by + 52} r={2.6} fill="#5A4A2A" />
          ))}
          {text(bx + 42, by + 56, 'Stumps', { anchor: 'start', fill: SOFT, size: 12 })}
          <G transform={`rotate(180 ${bx} 40)`}>{phone(bx, 40, 0)}</G>
          {text(bx + 24, 30, 'Phone = bowler', { anchor: 'start', bold: true })}
          {text(bx + 24, 46, 'waist high', { anchor: 'start', fill: SOFT, size: 12 })}
          {person(bx - off * 4, by, off)}
          <Line x1={bx + 40} y1={56} x2={bx + 40} y2={by - 18} stroke={WHITE} strokeWidth={2} strokeDasharray="6 7" />
          {text(bx + 48, (56 + by) / 2, '3 to 4 metres', { anchor: 'start', bold: true })}
          {text(bx + 48, (56 + by) / 2 + 16, '5 big steps', { anchor: 'start', fill: SOFT, size: 12 })}
          {text(bx - 40, by + 5, 'You, side-on', { anchor: 'end', bold: true })}
        </Svg>
      </View>
    );
  }

  // Stance. The bowler is at the top of the picture. Facing the bowler, a right-hander's
  // off side is on the right, so that is where the chest points and where the phone goes.
  const off = hand === 'right' ? 1 : -1;
  const bx = W / 2 - off * 50; // the batter
  const by = 150;
  const px = bx + off * 146; // the phone
  return (
    <View
      style={[styles.stage, { height }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Seen from above: you stand side-on to the bowler. The phone is on your ${off === 1 ? 'right' : 'left'} as you look at the bowler, about 3 metres away, where your chest points. Do not put the phone at the bowler's end.`}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {/* The pitch, running up the picture to the bowler. */}
        <Rect x={bx - 26} y={0} width={52} height={H} fill={C.pitch} opacity={0.95} />
        <Line x1={bx - 26} y1={by} x2={bx + 26} y2={by} stroke={WHITE} strokeWidth={2.5} />
        <Line x1={bx - 26} y1={by + 34} x2={bx + 26} y2={by + 34} stroke={WHITE} strokeWidth={2.5} />
        {[-6, 0, 6].map((d) => (
          <Circle key={d} cx={bx + d} cy={by + 34} r={2.6} fill="#5A4A2A" />
        ))}

        {/* The bowler's end, and a phone that should not be there. */}
        <Path d={`M ${bx} 62 L ${bx} 30 M ${bx - 7} 40 L ${bx} 30 L ${bx + 7} 40`} stroke="#5A4A2A" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {text(bx, 20, 'Bowler', { fill: '#3B3118', bold: true })}
        {text(bx, 80, 'Eyes', { fill: '#3B3118', size: 11, bold: true })}
        {text(bx, 93, 'this way', { fill: '#3B3118', size: 11 })}
        {phone(bx - off * 62, 26, 0, false)}
        <Path d={`M ${bx - off * 62 - 9} 12 l 18 18 M ${bx - off * 62 + 9} 12 l -18 18`} stroke="#FF5A5F" strokeWidth={3.5} strokeLinecap="round" />
        {text(bx - off * 62, 52, 'Not here', { fill: '#FFB4B6', size: 12, bold: true })}

        {phone(px, by, off === 1 ? -1 : 1)}
        {person(bx, by, off)}
        <Line x1={bx + off * 18} y1={by} x2={px - off * 10} y2={by} stroke={WHITE} strokeWidth={2} strokeDasharray="6 7" />
        {text((bx + px) / 2 + off * 6, by - 12, '3 metres', { bold: true })}
        {text((bx + px) / 2 + off * 6, by + 22, '4 big steps', { fill: SOFT, size: 12 })}
        {text(px, by + 34, 'Phone', { bold: true })}
        {text(px, by + 50, 'sees your chest', { fill: SOFT, size: 12 })}
        {text(bx - off * 34, by + 5, 'You', { bold: true, anchor: off === 1 ? 'end' : 'start' })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: C.outfield, borderRadius: 22, overflow: 'hidden' },
});
