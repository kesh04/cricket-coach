// Replays landmarks extracted from a screen recording through the app's analysis, to measure how
// steady the score and the verdict are. Usage: tsx scripts/replay.ts frames.json [skill] [view]
import { readFileSync } from 'fs';
import { analyzePose, blocks, StanceSmoother } from '../src/lib/pose/stanceAnalyzer';
import { SMOOTHING } from '../src/lib/pose/poseHtml';

const [file, skill = 'stance', view = 'front'] = process.argv.slice(2);
const frames = JSON.parse(readFileSync(file, 'utf8')) as any[];

function alphaFor(cutoff: number, dt: number) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
class OneEuro { x: number | null = null; dx = 0; constructor(public mc: number, public b: number, public dc: number) {}
  f(v: number, dt: number) { if (this.x === null) { this.x = v; return v; } const d = (v - this.x) / dt; this.dx += alphaFor(this.dc, dt) * (d - this.dx);
    const c = this.mc + this.b * Math.abs(this.dx); this.x += alphaFor(c, dt) * (v - this.x); return this.x; } }
const S = SMOOTHING;
const fl = Array.from({ length: 33 * 3 }, () => new OneEuro(S.imageMinCutoff, S.imageBeta, S.dCutoff));
const fw = Array.from({ length: 33 * 3 }, () => new OneEuro(S.worldMinCutoff, S.worldBeta, S.dCutoff));
const vis: number[] = new Array(33).fill(-1);
let lastT = 0;
const sm = new StanceSmoother();
const rows: { t: number; score: number | null; p: number | null; good: boolean; state: string }[] = [];
for (const fr of frames) {
  if (fr.none) { rows.push({ t: fr.t, score: null, p: null, good: false, state: 'none' }); lastT = 0; continue; }
  const dt = lastT ? Math.max(0.008, Math.min(0.25, (fr.t - lastT) / 1000)) : 1 / 15;
  if (lastT && fr.t - lastT > 600) { fl.forEach((f) => (f.x = null)); fw.forEach((f) => (f.x = null)); }
  lastT = fr.t;
  const lm = fr.lm.slice(), world = fr.world.slice();
  for (let i = 0; i < 33; i++) {
    for (let k = 0; k < 3; k++) { lm[i * 4 + k] = fl[i * 3 + k].f(fr.lm[i * 4 + k], dt); world[i * 3 + k] = fw[i * 3 + k].f(fr.world[i * 3 + k], dt); }
    vis[i] = vis[i] < 0 ? fr.lm[i * 4 + 3] : vis[i] + 0.35 * (fr.lm[i * 4 + 3] - vis[i]);
    lm[i * 4 + 3] = vis[i];
  }
  const a = analyzePose(skill as any, { t: fr.t, lm, world, aspect: fr.aspect, bat: null }, 'right', sm, { view: view as any, requireBat: false });
  if (a.state !== "ok") { rows.push({ t: fr.t, score: null, p: null, good: false, state: a.state + ":" + ((a as any).missing ?? (a as any).problem) }); continue; }
  const good = a.score >= 85 && !a.cues.some(blocks);
  if (process.env.DEBUG && a.score >= 85) console.log(fr.t, a.score, (a as any).cues.map((c: any) => c.id + ":" + c.status).join(","));
  rows.push({ t: fr.t, score: a.score, p: (a as any).model?.pCorrect ?? null, good, state: "ok" });
}
const ok = rows.filter((r) => r.state === 'ok');
let dsum = 0, dn = 0, flips = 0, big = 0;
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1], b = rows[i];
  if (a.state === 'ok' && b.state === 'ok') { const d = Math.abs(b.score! - a.score!); dsum += d; dn++; if (d >= 30) big++; if (a.good !== b.good) flips++; }
}
const secs = (ok.length / 15);
console.log(`${skill}/${view}: ${ok.length} judged frames (${secs.toFixed(1)} s); mean |Δscore| per frame ${(dsum / dn).toFixed(1)}; jumps ≥30: ${big}; good/not-good flips: ${flips} (${(flips / secs).toFixed(2)}/s); good frames ${ok.filter((r) => r.good).length}`);
if (process.env.SERIES) console.log(ok.map((r) => `${(r.t / 1000).toFixed(1)}:${r.score}${r.good ? '*' : ''}`).join(' '));
const st: Record<string, number> = {};
rows.forEach((r) => (st[r.state] = (st[r.state] ?? 0) + 1));
console.log(st);
