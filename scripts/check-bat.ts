/**
 * Tests the bat detector on synthetic camera frames.
 *
 * Each frame is a 320 × 240 grey picture with a textured background, clutter (posts, boxes,
 * lines), a simple body (trunk, arms, legs) and, in most frames, a bat held in the hands at a
 * known angle. The detector must find the angle within a few degrees when the bat is there, and
 * must stay quiet when it is not.
 *
 *   npx tsx scripts/check-bat.ts
 */
import { writeFileSync } from 'fs';
import { BAT_DETECT_SOURCE, MIN_BAT_CONFIDENCE, type BatDetection } from '../src/lib/pose/batDetect';

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const detectBat = new Function(`${BAT_DETECT_SOURCE}; return detectBat;`)() as (
  gray: Float32Array,
  w: number,
  h: number,
  o: { hx: number; hy: number; L: number; exclude?: number[]; avoid?: number[][]; hint?: number },
) => BatDetection | null;

const W = 320;
const H = 240;

let seed = 12345;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const between = (a: number, b: number) => a + (b - a) * rnd();
function gauss() {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

type Img = Float32Array;

/** Paints a thick segment (a rectangle with square ends) with 4× supersampling. */
function segment(img: Img, x1: number, y1: number, x2: number, y2: number, hw: number, v: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - hw - 1)), maxX = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + hw + 1));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - hw - 1)), maxY = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + hw + 1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let cover = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const px = x + ox - x1, py = y + oy - y1;
        const along = px * ux + py * uy;
        const across = Math.abs(-px * uy + py * ux);
        if (along >= 0 && along <= len && across <= hw) cover += 0.25;
      }
      if (cover > 0) img[y * W + x] = img[y * W + x] * (1 - cover) + v * cover;
    }
  }
}

function disc(img: Img, cx: number, cy: number, r: number, v: number) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) img[y * W + x] = v;
}

type Scene = { img: Img; hx: number; hy: number; L: number; exclude: number[]; avoid: number[][]; batAngle: number | null; hint?: number };

/**
 * Builds one frame. `batAngle` is the direction from the hands to the toe in radians
 * (0 = right, π/2 = down), or null for no bat. `contrast` sets how far the bat's shade is from the
 * background behind it.
 */
function scene(batAngle: number | null, opts: { clutter: number; contrast: number; noise: number; shorten?: number }): Scene {
  const img = new Float32Array(W * H);
  // Background: a gradient, like a wall and ground, plus blotches.
  const trunk = between(50, 64);
  const hipX = between(130, 190), hipY = between(150, 170);
  const hx = hipX + between(-25, 35), hy = hipY - trunk * between(0.0, 0.9);
  const top = between(60, 200), bottom = between(60, 200);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img[y * W + x] = top + ((bottom - top) * y) / H + 10 * Math.sin(x / between(8, 30));
  for (let i = 0; i < opts.clutter; i++) {
    const kind = rnd();
    const v = between(20, 235);
    if (kind < 0.35) {
      // Long thin things: posts, lines on a wall, a fence.
      const x = between(0, W), y = between(0, H), a = between(0, Math.PI), l = between(30, 160);
      // A stick that passes through the hands would be a bat; keep clutter away from them.
      const ux = Math.cos(a), uy = Math.sin(a), t = Math.max(0, Math.min(l, (hx - x) * ux + (hy - y) * uy));
      if (Math.hypot(x + ux * t - hx, y + uy * t - hy) < trunk * 0.6) continue;
      segment(img, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, between(1, 6), v);
    } else if (kind < 0.7) {
      const x = between(0, W), y = between(0, H);
      segment(img, x, y, x + between(10, 70), y, between(5, 30), v);
    } else {
      disc(img, between(0, W), between(0, H), between(4, 25), v);
    }
  }

  // Body. Hips at about (150, 160); trunk 50 to 64 px.
  const shX = hipX + between(-6, 6), shY = hipY - trunk;
  const shirt = between(30, 220), trousers = between(30, 220), skin = between(90, 200);
  segment(img, hipX, hipY, shX, shY, trunk * 0.22, shirt); // trunk
  disc(img, shX, shY - trunk * 0.32, trunk * 0.17, skin); // head
  const knee1 = [hipX - trunk * 0.35, hipY + trunk * 0.8], knee2 = [hipX + trunk * 0.3, hipY + trunk * 0.8];
  segment(img, hipX - 5, hipY, knee1[0], knee1[1], trunk * 0.12, trousers);
  segment(img, hipX + 5, hipY, knee2[0], knee2[1], trunk * 0.12, trousers);
  segment(img, knee1[0], knee1[1], knee1[0] - 6, Math.min(H - 2, knee1[1] + trunk * 0.8), trunk * 0.1, trousers);
  segment(img, knee2[0], knee2[1], knee2[0] + 4, Math.min(H - 2, knee2[1] + trunk * 0.8), trunk * 0.1, trousers);

  // Hands somewhere in front of the body, elbows bent.
  const el1 = [shX - 10 + between(-10, 10), shY + trunk * 0.45], el2 = [shX + 12 + between(-10, 10), shY + trunk * 0.5];
  segment(img, shX - 9, shY + 2, el1[0], el1[1], trunk * 0.07, shirt);
  segment(img, shX + 9, shY + 2, el2[0], el2[1], trunk * 0.07, shirt);
  segment(img, el1[0], el1[1], hx, hy, trunk * 0.06, skin);
  segment(img, el2[0], el2[1], hx, hy, trunk * 0.06, skin);

  const L = trunk * 1.65;
  if (batAngle !== null) {
    const dx = Math.cos(batAngle), dy = Math.sin(batAngle);
    // The shade of the bat: a set distance from what is behind the middle of the blade.
    const mx = Math.round(hx + dx * L * 0.6 * (opts.shorten ?? 1)), my = Math.round(hy + dy * L * 0.6 * (opts.shorten ?? 1));
    const behind = img[Math.min(H - 1, Math.max(0, my)) * W + Math.min(W - 1, Math.max(0, mx))];
    const v = behind + (behind < 128 ? opts.contrast : -opts.contrast);
    // Handle (thin, dark grip) then blade (wider). A real bat is a little shorter or longer.
    const len = L * between(0.9, 1.08) * (opts.shorten ?? 1);
    segment(img, hx, hy, hx + dx * len * 0.3, hy + dy * len * 0.3, Math.max(1.5, L * 0.025), between(20, 80));
    segment(img, hx + dx * len * 0.28, hy + dy * len * 0.28, hx + dx * len, hy + dy * len, L * between(0.05, 0.075), v);
  }
  disc(img, hx, hy, trunk * 0.08, skin); // hands over the handle

  for (let i = 0; i < img.length; i++) img[i] = Math.max(0, Math.min(255, img[i] + gauss() * opts.noise));

  // The app knows the hands and elbows only roughly, from the pose model.
  const jitter = () => between(-3, 3);
  const exclude = [Math.atan2(el1[1] - hy, el1[0] - hx), Math.atan2(el2[1] - hy, el2[0] - hx)];
  // Legs and trunk as the pose model would give them (roughly).
  const j2 = (p: number[]) => [p[0] + jitter(), p[1] + jitter()];
  const ank1 = [knee1[0] - 6, Math.min(H - 2, knee1[1] + trunk * 0.8)], ank2 = [knee2[0] + 4, Math.min(H - 2, knee2[1] + trunk * 0.8)];
  const avoid = [
    [...j2([hipX - 5, hipY]), ...j2(knee1)], [...j2(knee1), ...j2(ank1)],
    [...j2([hipX + 5, hipY]), ...j2(knee2)], [...j2(knee2), ...j2(ank2)],
    [...j2([hipX, hipY]), ...j2([shX, shY])],
    [...j2([hx, hy]), ...j2(el1)], [...j2(el1), ...j2([shX - 9, shY + 2])],
    [...j2([hx, hy]), ...j2(el2)], [...j2(el2), ...j2([shX + 9, shY + 2])],
  ];
  return { img, hx: hx + jitter(), hy: hy + jitter(), L: L * between(0.9, 1.1), exclude, avoid, batAngle };
}

const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * (180 / Math.PI);

// Set BAT_DUMP to a folder to save pictures of wrong reports (red: found, green: true bat).
const DUMP = process.env.BAT_DUMP;
let dumped = 0;
function dump(s: Scene, r: BatDetection, tag: string) {
  if (!DUMP || dumped >= 12 || (process.env.BAT_DUMP_NONE && s.batAngle !== null)) return;
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = Math.round(s.img[i]);
  const put = (x: number, y: number, c: number[]) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = (y * W + x) * 3; rgb[k] = c[0]; rgb[k + 1] = c[1]; rgb[k + 2] = c[2];
  };
  for (let t = 0; t < s.L; t++) put(s.hx + r.dx * t, s.hy + r.dy * t, [255, 0, 0]);
  if (s.batAngle !== null) for (let t = 0; t < s.L; t += 2) put(s.hx + Math.cos(s.batAngle) * t, s.hy + Math.sin(s.batAngle) * t, [0, 255, 0]);
  writeFileSync(`${DUMP}/w${dumped}.ppm`, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), rgb]));
  console.log('saved', dumped, tag, 'score', r.score.toFixed(2), 'other', r.other.toFixed(2), 'conf', r.conf.toFixed(2), 'onBody', r.onBody);
  dumped++;
}

type Row = { name: string; frames: number; found: number; correct: number; wrong: number; errSum: number };
/**
 * The phone close to the batter: the picture is moved so the hands are near the edge the bat
 * points to, and the blade runs out of the picture.
 */
function nearEdge(s: Scene): Scene {
  if (s.batAngle === null) return s;
  const dx = Math.cos(s.batAngle), dy = Math.sin(s.batAngle);
  // Move the hands to about 55% of the bat length from the edge the bat points to.
  const want = s.L * between(0.5, 0.65);
  let sx = 0, sy = 0;
  if (Math.abs(dx) >= Math.abs(dy)) sx = dx < 0 ? want - s.hx : W - want - s.hx;
  else sy = dy < 0 ? want - s.hy : H - want - s.hy;
  sx = Math.round(sx); sy = Math.round(sy);
  const img = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ox = Math.min(W - 1, Math.max(0, x - sx)), oy = Math.min(H - 1, Math.max(0, y - sy));
    img[y * W + x] = s.img[oy * W + ox];
  }
  const avoid = s.avoid.map((a) => [a[0] + sx, a[1] + sy, a[2] + sx, a[3] + sy]);
  return { ...s, img, hx: s.hx + sx, hy: s.hy + sy, avoid };
}

/**
 * The direction the app works out from the hands (3D landmarks) is only rough: within about 20
 * degrees when there is a bat; when the hands are together with no bat, it points anywhere.
 */
function withHint(s: Scene): Scene {
  const hint = s.batAngle === null ? between(0, Math.PI * 2) : s.batAngle + between(-0.35, 0.35);
  return { ...s, hint };
}

function run(name: string, n: number, make: () => Scene): Row {
  const row: Row = { name, frames: n, found: 0, correct: 0, wrong: 0, errSum: 0 };
  for (let i = 0; i < n; i++) {
    const s = make();
    const r = detectBat(s.img, W, H, { hx: s.hx, hy: s.hy, L: s.L, avoid: s.avoid, hint: s.hint });
    // Along a leg the app does not use the bat, so it counts as not reported.
    if (!r || r.conf < MIN_BAT_CONFIDENCE || r.onBody) continue;
    row.found++;
    if (s.batAngle === null) { row.wrong++; dump(s, r, name); continue; }
    const e = angDiff(r.angle, s.batAngle);
    if (e <= 8) { row.correct++; row.errSum += e; } else { row.wrong++; dump(s, r, name); }
  }
  return row;
}

// Bat directions that matter: down (stance, defence), tilted either way, and up (drive finish).
// Directions along the forearms are left out: there the bat and the arm cannot be told apart.
const batAngles = () => {
  const choices = [Math.PI / 2 + between(-0.6, 0.6), -Math.PI / 2 + between(-0.9, 0.9), between(-0.5, 0.5) + (rnd() < 0.5 ? 0 : Math.PI)];
  return choices[Math.floor(rnd() * choices.length)];
};

const rows = [
  run('Bat, plain background, good contrast', 150, () => scene(batAngles(), { clutter: 2, contrast: 60, noise: 4 })),
  run('Bat, busy background, good contrast', 150, () => scene(batAngles(), { clutter: 14, contrast: 60, noise: 6 })),
  run('Bat, busy background, low contrast', 150, () => scene(batAngles(), { clutter: 14, contrast: 30, noise: 6 })),
  run('Bat, busy background, noisy', 150, () => scene(batAngles(), { clutter: 14, contrast: 45, noise: 12 })),
  // A bat pointing towards or away from the phone (held out at the bowler, seen from the side)
  // looks much shorter in the picture than a bat across it.
  run('Bat pointing at the phone (looks short)', 150, () => withHint(scene(batAngles(), { clutter: 6, contrast: 60, noise: 5, shorten: between(0.45, 0.7) }))),
  run('Bat running out of the picture', 150, () => nearEdge(scene(batAngles(), { clutter: 6, contrast: 60, noise: 5 }))),
  run('No bat, plain background', 150, () => scene(null, { clutter: 2, contrast: 0, noise: 4 })),
  run('No bat, busy background', 150, () => scene(null, { clutter: 14, contrast: 0, noise: 6 })),
  run('No bat, hands together, plain', 150, () => withHint(scene(null, { clutter: 2, contrast: 0, noise: 4 }))),
  run('No bat, hands together, busy', 150, () => withHint(scene(null, { clutter: 14, contrast: 0, noise: 6 }))),
];

let failures = 0;
console.log('Case'.padEnd(42), 'Found', 'Right', 'Wrong', 'Mean error');
for (const r of rows) {
  const err = r.correct ? (r.errSum / r.correct).toFixed(1) + '°' : '-';
  console.log(r.name.padEnd(42), String(r.found).padStart(5), String(r.correct).padStart(5), String(r.wrong).padStart(5), err.padStart(10));
}
// Requirements: when a bat is reported it must almost always be right (a wrong correction is
// worse than none), and a clear bat must be found most of the time.
const bat = rows.slice(0, 6);
const none = rows.slice(6);
const reported = bat.reduce((t, r) => t + r.found, 0);
const wrong = bat.reduce((t, r) => t + r.wrong, 0) + none.reduce((t, r) => t + r.wrong, 0);
const check = (ok: boolean, text: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failures++;
};
check(rows[0].found / rows[0].frames >= 0.75, `clear bat found in ${Math.round((100 * rows[0].found) / rows[0].frames)}% of frames (need 75%; a bat lying over a leg is not judged)`);
check(rows[1].found / rows[1].frames >= 0.6, `bat on a busy background found in ${Math.round((100 * rows[1].found) / rows[1].frames)}% of frames (need 60%)`);
check(rows[4].found / rows[4].frames >= 0.55, `short-looking bat found in ${Math.round((100 * rows[4].found) / rows[4].frames)}% of frames (need 55%)`);
check(rows[5].found / rows[5].frames >= 0.5, `bat running out of the picture found in ${Math.round((100 * rows[5].found) / rows[5].frames)}% of frames (need 50%)`);
check(wrong / (reported + none.reduce((t, r) => t + r.found, 0) || 1) <= 0.05, `wrong reports: ${wrong} of ${reported + none.reduce((t, r) => t + r.found, 0)} (need 5% or fewer)`);
check(none.every((r) => r.found / r.frames <= 0.05), `bat reported when there is none: ${none.map((r) => r.found).join(' and ')} of ${none[0].frames} (need 5% or fewer)`);
if (failures) process.exit(1);
