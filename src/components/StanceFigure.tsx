import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { defaultYaw, idealBat, idealStance } from '@/lib/pose/idealStance';
import { LM, type Hand, type Vec3 } from '@/lib/pose/landmarks';
import { C } from '@/theme';

type Props = {
  hand: Hand;
  /** Pose to draw, as 33 points in figure space. Defaults to the model stance. */
  pose?: Vec3[];
  /** A second pose drawn faintly behind the first, for comparison. */
  ghost?: Vec3[];
  height?: number;
  /**
   * Where the figure is first seen from.
   * 'front' is the bowler's view, 'side' is from the off side (the stance-check camera).
   */
  view?: FigureView;
  /**
   * Turns the figure to this angle and holds it there, for a demonstration that controls the view.
   * Use `viewYaw()` to get the angle of a named view. Leave unset to let the figure sway and be dragged.
   */
  yaw?: number;
  /** A bat to draw with a custom pose. The model stance draws its own bat. */
  bat?: { top: Vec3; toe: Vec3 } | null;
  /** Gently sways the figure until the learner drags it. */
  autoRotate?: boolean;
  /** Lets the learner drag to turn the figure. */
  interactive?: boolean;
  showStumps?: boolean;
  showBat?: boolean;
  /** Landmarks to ring in red. */
  highlight?: number[];
  /** Short labels drawn next to joints, for example the angle at each knee. */
  labels?: { joint: number; text: string }[];
  hint?: string;
  style?: ViewStyle;
};

// Limbs of the faint comparison figure: landmark pair and thickness in metres.
const GHOST_LIMBS: { a: number; b: number; w: number }[] = [
  { a: LM.L_SHOULDER, b: LM.R_SHOULDER, w: 0.12 },
  { a: LM.L_HIP, b: LM.R_HIP, w: 0.15 },
  { a: LM.L_SHOULDER, b: LM.L_ELBOW, w: 0.085 },
  { a: LM.L_ELBOW, b: LM.L_WRIST, w: 0.07 },
  { a: LM.R_SHOULDER, b: LM.R_ELBOW, w: 0.085 },
  { a: LM.R_ELBOW, b: LM.R_WRIST, w: 0.07 },
  { a: LM.L_HIP, b: LM.L_KNEE, w: 0.14 },
  { a: LM.L_KNEE, b: LM.L_ANKLE, w: 0.13 },
  { a: LM.R_HIP, b: LM.R_KNEE, w: 0.14 },
  { a: LM.R_KNEE, b: LM.R_ANKLE, w: 0.13 },
  { a: LM.L_ANKLE, b: LM.L_TOE, w: 0.085 },
  { a: LM.R_ANKLE, b: LM.R_TOE, w: 0.085 },
];

// The player's kit, in a flat illustration style: plain colours and no heavy outlines.
// Each colour has a darker version for the side of the body further from the viewer.
const KIT = {
  skin: ['#C68A5E', '#A9714A'],
  shirt: ['#FFFFFF', '#E3E8E4'],
  trousers: ['#FAFAF7', '#DCE1DC'],
  pad: ['#FFFFFF', '#E6E9E3'],
  glove: ['#FFFFFF', '#E1E5E1'],
  shoe: ['#F4F4F1', '#D9DDD8'],
  helmet: '#1E7A4F',
  helmetShade: '#145C3B',
  beard: '#2B211B',
  edge: 'rgba(16,35,27,0.28)',
  shade: 'rgba(16,35,27,0.09)',
  shine: 'rgba(255,255,255,0.35)',
  grille: '#4E5A61',
  grip: ['#B23A35', '#8E2C28'],
  sticker: '#1E7A4F',
  padLine: 'rgba(16,35,27,0.22)',
} as const;

const TILT = 0.2; // camera looks down slightly
const CAMERA_DISTANCE = 5.5;
const SWAY = 0.38; // how far the figure sways to each side, in radians

type Projected = { x: number; y: number; depth: number; s: number };

function makeProjector(yaw: number, k: number, cx: number, cy: number, focus: Vec3) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  return (p: Vec3): Projected => {
    const x = p[0] - focus[0];
    const y = p[1] - focus[1];
    const z = p[2] - focus[2];
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosT - z1 * sinT;
    const z2 = y * sinT + z1 * cosT;
    const s = CAMERA_DISTANCE / (CAMERA_DISTANCE - z2);
    return { x: cx + x1 * s * k, y: cy - y2 * s * k, depth: z2, s };
  };
}

const midPoint = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export type FigureView = 'front' | 'side' | 'profile';

/**
 * The angle of a named view: 'front' is the bowler's view, 'side' is from the off side,
 * 'profile' looks straight across the batter, so bent knees and the forward lean show clearly.
 */
export function viewYaw(hand: Hand, view: FigureView): number {
  return startYaw(hand, view);
}

/** The yaw the figure starts from. The front view sits a little towards the off side so the bat and pads show. */
function startYaw(hand: Hand, view: FigureView): number {
  const offSide = hand === 'right' ? 1 : -1;
  if (view === 'side') return defaultYaw(hand) - 0.35 * offSide;
  if (view === 'profile') return -Math.PI / 2 + 0.22 * offSide;
  return -Math.PI / 2 + 0.5 * offSide;
}

/**
 * A batter drawn as a flat illustration that the learner can turn with a finger.
 * The body is built from 3D points and drawn with SVG, so it can be seen from any side,
 * it mirrors for left-handers, and it needs no 3D engine (it runs in Expo Go).
 */
export function StanceFigure({
  hand,
  pose,
  ghost,
  height = 300,
  view = 'front',
  yaw: fixedYaw,
  bat: customBat,
  autoRotate = true,
  interactive = true,
  showStumps = true,
  showBat = true,
  highlight,
  labels,
  hint,
  style,
}: Props) {
  const [width, setWidth] = useState(0);
  const [freeYaw, setYaw] = useState(startYaw(hand, view));
  const yaw = fixedYaw ?? freeYaw;
  const yawRef = useRef(freeYaw);
  const touched = useRef(false);
  const dragStart = useRef(0);

  // Go back to the starting view when the batting hand changes.
  useEffect(() => {
    touched.current = false;
    yawRef.current = startYaw(hand, view);
    setYaw(yawRef.current);
  }, [hand, view]);

  // A slow sway from side to side shows that the figure is solid. It stops at the first touch.
  useEffect(() => {
    if (!autoRotate || fixedYaw !== undefined) return;
    let raf = 0;
    let last = 0;
    let t = 0;
    const base = startYaw(hand, view);
    const tick = (now: number) => {
      if (!touched.current && now - last > 40) {
        t += last ? Math.min(now - last, 100) / 1000 : 0;
        last = now;
        yawRef.current = base + Math.sin(t * 0.55) * SWAY;
        setYaw(yawRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, hand, view, fixedYaw]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive,
        onMoveShouldSetPanResponder: (_e, g) => interactive && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          touched.current = true;
          dragStart.current = yawRef.current;
        },
        onPanResponderMove: (_e, g) => {
          yawRef.current = dragStart.current - g.dx * 0.012;
          setYaw(yawRef.current);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [interactive],
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const body = pose ?? idealStance(hand);
  const zSide = hand === 'right' ? 1 : -1;

  const drawing = useMemo(() => {
    if (!width) return null;
    const focus: Vec3 = showStumps ? [-0.2, 0.74, 0.08 * zSide] : [0, 0.8, 0.08 * zSide];
    const reach = showStumps ? 1.12 : 1.0;
    const k = Math.min(width, height * 1.25) / 2 / reach;
    const project = makeProjector(yaw, k, width / 2, height * 0.54, focus);

    const nodes: { depth: number; el: React.ReactNode }[] = [];
    let key = 0;
    const f = (n: number) => n.toFixed(1);

    // A plain rounded bar, used for the bat, the stumps and the comparison figure.
    const bar = (a: Vec3, b: Vec3, w: number, fill: string, opacity = 1, lift = 0) => {
      const pa = project(a);
      const pb = project(b);
      const sw = Math.max(1.5, w * k * ((pa.s + pb.s) / 2));
      nodes.push({
        depth: (pa.depth + pb.depth) / 2 + lift,
        el: <Line key={key++} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={fill} strokeWidth={sw} strokeLinecap="round" opacity={opacity} />,
      });
    };

    // A body part: a rounded shape that can be thicker at one end than the other, like a thigh
    // that narrows to the knee. There is no outline; a faint line down each side gives the folds
    // of the clothes. `lift` nudges the part in front of its neighbours.
    const disc = (x: number, y: number, r: number) => `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
    // Light comes from the upper left, so each rounded part gets a soft shadow strip on the side
    // away from the light and a thin shine on the lit side. It makes the limbs read as round.
    const strip = (pa: Projected, pb: Projected, nx: number, ny: number, ra: number, rb: number, from: number, to: number) =>
      `M${f(pa.x + nx * ra * from)},${f(pa.y + ny * ra * from)}L${f(pb.x + nx * rb * from)},${f(pb.y + ny * rb * from)}` +
      `L${f(pb.x + nx * rb * to)},${f(pb.y + ny * rb * to)}L${f(pa.x + nx * ra * to)},${f(pa.y + ny * ra * to)}Z`;
    const part = (a: Vec3, b: Vec3, wa: number, wb: number, fill: string, lift = 0, edges = true, shading = true) => {
      const pa = project(a);
      const pb = project(b);
      const ra = Math.max(1, (wa * k * pa.s) / 2);
      const rb = Math.max(1, (wb * k * pb.s) / 2);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const shape =
        `M${f(pa.x + nx * ra)},${f(pa.y + ny * ra)}L${f(pb.x + nx * rb)},${f(pb.y + ny * rb)}` +
        `L${f(pb.x - nx * rb)},${f(pb.y - ny * rb)}L${f(pa.x - nx * ra)},${f(pa.y - ny * ra)}Z` +
        disc(pa.x, pa.y, ra) +
        disc(pb.x, pb.y, rb);
      const depth = (pa.depth + pb.depth) / 2 + lift;
      nodes.push({ depth, el: <Path key={key++} d={shape} fill={fill} /> });
      if (shading && length > 6 && ra > 3) {
        const lit = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
        nodes.push({ depth: depth + 0.00004, el: <Path key={key++} d={strip(pa, pb, nx, ny, ra, rb, -lit * 0.35, -lit * 0.98)} fill={KIT.shade} /> });
        nodes.push({ depth: depth + 0.00005, el: <Path key={key++} d={strip(pa, pb, nx, ny, ra, rb, lit * 0.3, lit * 0.6)} fill={KIT.shine} /> });
      }
      if (edges && length > 4) {
        const sides =
          `M${f(pa.x + nx * ra)},${f(pa.y + ny * ra)}L${f(pb.x + nx * rb)},${f(pb.y + ny * rb)}` +
          `M${f(pa.x - nx * ra)},${f(pa.y - ny * ra)}L${f(pb.x - nx * rb)},${f(pb.y - ny * rb)}`;
        nodes.push({ depth: depth + 0.0001, el: <Path key={key++} d={sides} stroke={KIT.edge} strokeWidth={1.1} fill="none" strokeLinecap="round" /> });
      }
    };
    const ball = (c: Vec3, r: number, fill: string, lift = 0) => {
      const p = project(c);
      nodes.push({ depth: p.depth + lift, el: <Circle key={key++} cx={p.x} cy={p.y} r={Math.max(1, r * k * p.s)} fill={fill} /> });
    };

    // Comparison figure first: thin green limbs.
    if (ghost) {
      for (const l of GHOST_LIMBS) bar(ghost[l.a], ghost[l.b], l.w * 0.55, '#8FE3B4', 0.6);
      bar(midPoint(ghost[LM.L_SHOULDER], ghost[LM.R_SHOULDER]), midPoint(ghost[LM.L_HIP], ghost[LM.R_HIP]), 0.16, '#8FE3B4', 0.5);
    }

    const shoulderMid = midPoint(body[LM.L_SHOULDER], body[LM.R_SHOULDER]);
    const hipMid = midPoint(body[LM.L_HIP], body[LM.R_HIP]);
    const centreDepth = project(midPoint(shoulderMid, hipMid)).depth;
    // Near side of the body gets the light colour, far side the darker one.
    const tone = (pair: readonly [string, string], a: Vec3, b: Vec3) => (project(midPoint(a, b)).depth < centreDepth - 0.04 ? pair[1] : pair[0]);

    // Shirt: the trunk, filled out at the shoulders, the sides and the waist so it reads as one shape.
    part(shoulderMid, hipMid, 0.3, 0.27, KIT.shirt[0], 0, false);
    part(body[LM.L_SHOULDER], body[LM.R_SHOULDER], 0.14, 0.14, KIT.shirt[0], -0.02, false);
    part(body[LM.L_SHOULDER], body[LM.L_HIP], 0.15, 0.15, tone(KIT.shirt, body[LM.L_SHOULDER], body[LM.L_HIP]), -0.01);
    part(body[LM.R_SHOULDER], body[LM.R_HIP], 0.15, 0.15, tone(KIT.shirt, body[LM.R_SHOULDER], body[LM.R_HIP]), -0.01);
    part(body[LM.L_HIP], body[LM.R_HIP], 0.16, 0.16, KIT.trousers[0], -0.02, false);

    for (const side of ['L', 'R'] as const) {
      const shoulder = body[LM[`${side}_SHOULDER`]];
      const elbow = body[LM[`${side}_ELBOW`]];
      const wrist = body[LM[`${side}_WRIST`]];
      const hip = body[LM[`${side}_HIP`]];
      const knee = body[LM[`${side}_KNEE`]];
      const ankle = body[LM[`${side}_ANKLE`]];
      const heel = body[LM[`${side}_HEEL`]];
      const toe = body[LM[`${side}_TOE`]];

      // Arm: a short white sleeve, a bare forearm and a batting glove.
      part(shoulder, elbow, 0.1, 0.082, tone(KIT.skin, shoulder, elbow), 0, false);
      part(shoulder, lerp(shoulder, elbow, 0.6), 0.115, 0.105, tone(KIT.shirt, shoulder, elbow), 0.002);
      part(elbow, wrist, 0.082, 0.064, tone(KIT.skin, elbow, wrist), 0, false);
      const fist: Vec3 = lerp(elbow, wrist, 1.32);
      part(lerp(elbow, wrist, 0.8), fist, 0.09, 0.105, tone(KIT.glove, wrist, fist), 0.006);
      // Finger rolls on the glove.
      for (const t of [1.12, 1.22]) {
        const c = project(lerp(elbow, wrist, t));
        const half = 0.04 * k * c.s;
        nodes.push({
          depth: c.depth + 0.0062,
          el: <Line key={key++} x1={c.x - half} y1={c.y} x2={c.x + half} y2={c.y} stroke={KIT.padLine} strokeWidth={1.2} strokeLinecap="round" />,
        });
      }

      // Leg: white trousers, a batting pad from above the knee to the ankle, and a boot.
      part(hip, knee, 0.175, 0.135, tone(KIT.trousers, hip, knee));
      part(knee, ankle, 0.125, 0.095, tone(KIT.trousers, knee, ankle), 0, false);
      const padTop: Vec3 = lerp(knee, hip, 0.22);
      part(padTop, ankle, 0.155, 0.125, tone(KIT.pad, knee, ankle), 0.004);
      // Three upright ribs down the front of the pad.
      {
        const pa = project(lerp(knee, ankle, 0.12));
        const pb = project(lerp(knee, ankle, 0.92));
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const wa = (0.15 * k * pa.s) / 2;
        const wb = (0.12 * k * pb.s) / 2;
        const ribs = [-0.45, 0, 0.45]
          .map((o) => `M${f(pa.x + nx * wa * o)},${f(pa.y + ny * wa * o)}L${f(pb.x + nx * wb * o)},${f(pb.y + ny * wb * o)}`)
          .join('');
        nodes.push({ depth: (pa.depth + pb.depth) / 2 + 0.0055, el: <Path key={key++} d={ribs} stroke={KIT.padLine} strokeWidth={1.2} fill="none" strokeLinecap="round" /> });
      }
      // The knee roll: a rounded bulge across the top of the pad.
      part(lerp(knee, hip, 0.12), lerp(knee, ankle, 0.04), 0.165, 0.16, tone(KIT.pad, knee, ankle), 0.0058);
      // Two straps across the pad.
      for (const t of [0.35, 0.7]) {
        const c = project(lerp(knee, ankle, t));
        const half = 0.07 * k * c.s;
        nodes.push({
          depth: c.depth + 0.006,
          el: <Line key={key++} x1={c.x - half} y1={c.y} x2={c.x + half} y2={c.y} stroke={KIT.padLine} strokeWidth={1.5} strokeLinecap="round" />,
        });
      }
      const sole = heel[1] < 0.2 ? heel : ankle;
      part([sole[0], Math.min(sole[1], 0.05), sole[2]], [toe[0], Math.min(toe[1], 0.045), toe[2]], 0.095, 0.08, tone(KIT.shoe, ankle, toe), 0.005);
    }

    // Head: neck, face with a beard, and a helmet with a peak, all turned the way the batter looks.
    const headCentre = lerp([shoulderMid[0], shoulderMid[1] + 0.22, shoulderMid[2]], body[LM.NOSE], 0.35);
    const look: Vec3 = [body[LM.NOSE][0] - headCentre[0], 0, body[LM.NOSE][2] - headCentre[2]];
    const lookLength = Math.hypot(look[0], look[2]);
    const dir: Vec3 = lookLength > 0.005 ? [look[0] / lookLength, 0, look[2] / lookLength] : [1, 0, 0];
    const at = (forward: number, up: number): Vec3 => [headCentre[0] + dir[0] * forward, headCentre[1] + up, headCentre[2] + dir[2] * forward];

    part([shoulderMid[0], shoulderMid[1] + 0.04, shoulderMid[2]], at(0, -0.06), 0.1, 0.09, KIT.skin[1], 0.001, false, false);
    // The beard sits just below and behind the face, so it shows as a dark edge round the jaw.
    ball(at(0.035, -0.045), 0.086, KIT.beard, 0.002);
    ball(at(0.052, 0.004), 0.076, KIT.skin[0], 0.004);
    ball(at(-0.02, 0.035), 0.118, KIT.helmet, 0.008);
    part(at(0.06, 0.05), at(0.185, 0.03), 0.05, 0.035, KIT.helmetShade, 0.012, false, false);
    // The helmet's face grille: two bars across the face and one down the middle.
    {
      const side: Vec3 = [-dir[2], 0, dir[0]];
      const g = (forward: number, up: number, across: number): Vec3 => {
        const c = at(forward, up);
        return [c[0] + side[0] * across, c[1], c[2] + side[2] * across];
      };
      const front = project(at(0.13, -0.02)).depth;
      const faceDepth = project(at(0.052, 0.004)).depth;
      // Only draw the grille when the face is turned towards the viewer.
      if (front > faceDepth - 0.02) {
        for (const up of [0.0, -0.045]) bar(g(0.12, up, -0.07), g(0.12, up, 0.07), 0.011, KIT.grille, 1, 0.013);
        bar(g(0.125, 0.025, 0), g(0.11, -0.085, 0), 0.011, KIT.grille, 1, 0.0131);
        bar(g(0.06, 0.02, -0.085), g(0.12, 0.0, -0.07), 0.011, KIT.grille, 1, 0.0129);
        bar(g(0.06, 0.02, 0.085), g(0.12, 0.0, 0.07), 0.011, KIT.grille, 1, 0.0129);
      }
      // A shine on the helmet shell.
      ball(at(-0.035, 0.085), 0.035, 'rgba(255,255,255,0.22)', 0.0085);
    }

    // The model stance has a bat. A pose from the camera has none, because the camera does not track the bat.
    const bat = customBat ?? (pose ? null : idealBat(hand));
    if (showBat && bat) {
      const split = lerp(bat.top, bat.toe, 0.3);
      // Handle with a rubber grip, the blade with its edge, and a maker's sticker.
      bar(bat.top, split, 0.042, KIT.grip[1], 1, 0.008);
      bar(bat.top, lerp(bat.top, split, 0.85), 0.034, KIT.grip[0], 1, 0.00801);
      bar(split, bat.toe, 0.115, C.willowDeep, 1, 0.0079);
      bar(split, bat.toe, 0.1, C.willow, 1, 0.008);
      bar(lerp(split, bat.toe, 0.08), lerp(split, bat.toe, 0.28), 0.07, KIT.sticker, 0.85, 0.00802);
      bar(lerp(split, bat.toe, 0.05), lerp(split, bat.toe, 0.95), 0.025, 'rgba(255,255,255,0.28)', 1, 0.00803);
    }

    if (showStumps) {
      for (const dz of [-0.11, 0, 0.11]) {
        const base: Vec3 = [-1.22, 0, (0.1 + dz) * zSide];
        bar(base, [base[0], 0.71, base[2]], 0.045, 'rgba(16,35,27,0.25)');
        bar(base, [base[0], 0.71, base[2]], 0.036, '#F7F3E8', 1, 0.0001);
      }
      // Two bails, each resting across two stumps.
      bar([-1.22, 0.725, -0.01 * zSide], [-1.22, 0.725, 0.097 * zSide], 0.022, '#F7F3E8', 1, 0.0002);
      bar([-1.22, 0.725, 0.103 * zSide], [-1.22, 0.725, 0.21 * zSide], 0.022, '#F7F3E8', 1, 0.0002);
    }

    // Highlight rings always sit on top.
    const rings = (highlight ?? []).map((i) => {
      const p = project(body[i]);
      return <Circle key={`h${i}`} cx={p.x} cy={p.y} r={0.1 * k * p.s} fill="rgba(255,90,95,0.18)" stroke="#FF5A5F" strokeWidth={3} />;
    });

    // Ground: the pitch with the popping crease and the bowling crease, and a soft shadow under the player.
    const zc = 0.1 * zSide;
    const corners: Vec3[] = [
      [-3.2, 0, zc - 1.52],
      [2.6, 0, zc - 1.52],
      [2.6, 0, zc + 1.52],
      [-3.2, 0, zc + 1.52],
    ];
    const pitch = corners.map((c) => project(c)).map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
    const crease = (x: number, half: number) => {
      const a = project([x, 0, zc - half]);
      const b = project([x, 0, zc + half]);
      return <Line key={`c${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#FFFFFF" strokeWidth={2.5} opacity={0.9} />;
    };
    const feet = midPoint(body[LM.L_ANKLE], body[LM.R_ANKLE]);
    const shadow = Array.from({ length: 20 }, (_, i) => {
      const t = (i / 20) * Math.PI * 2;
      const p = project([feet[0] + Math.cos(t) * 0.5, 0, feet[2] + 0.08 * zSide + Math.sin(t) * 0.3]);
      return `${f(p.x)},${f(p.y)}`;
    }).join(' ');

    nodes.sort((a, b) => a.depth - b.depth);
    return (
      <Svg width={width} height={height}>
        <Polygon points={pitch} fill={C.pitch} />
        {crease(0, 1.52)}
        {showStumps ? crease(-1.22, 1.52) : null}
        <Polygon points={shadow} fill="#000000" opacity={0.14} />
        {nodes.map((n) => n.el)}
        {rings}
        {(labels ?? []).map((l) => {
          const p = project(body[l.joint]);
          const w = l.text.length * 8.5 + 16;
          return (
            <G key={`l${l.joint}`}>
              <Rect x={p.x + 12} y={p.y - 13} width={w} height={26} rx={13} fill="#10231B" opacity={0.85} />
              <SvgText x={p.x + 12 + w / 2} y={p.y + 5} fill="#FFFFFF" fontSize={15} fontWeight="700" textAnchor="middle" fontFamily={Platform.OS === 'web' ? 'system-ui, sans-serif' : undefined}>
                {l.text}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  }, [width, height, yaw, body, ghost, highlight, labels, showBat, showStumps, hand, zSide, pose, customBat]);

  return (
    <View style={[styles.stage, { height }, style]} onLayout={onLayout} {...(interactive ? responder.panHandlers : {})}>
      {drawing}
      {hint ? (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: C.outfield,
    borderRadius: 22,
    overflow: 'hidden',
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: 'center',
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 13,
    backgroundColor: 'rgba(10,22,18,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
