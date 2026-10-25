/**
 * Checks that the verdict is steady (field test, 19 October 2026, phone in front: the score jumped
 * 22, 11, 91, 100, 29 on a stance that did not change).
 *  1. Smoothing is over time: at 60 and at 15 frames a second, a shaking probability gives the
 *     same steady value, and a real change is followed within about a second.
 *  2. Hysteresis: a model verdict at the threshold does not flip with every small change.
 *  3. Phone in front: the model stops a position only when it is fairly sure of a fault, and the
 *     score mixes the model and the rules.
 */
import { judgeWithModel, StanceSmoother, scoreChecks, FRONT_VETO, MODEL_HYSTERESIS } from '../src/lib/pose/stanceAnalyzer';
import { BENCHMARKS_BY_SKILL } from '../src/lib/pose/benchmarks';
import type { PositionModel } from '../src/lib/pose/classifier';
import { predictionFrom } from '../src/lib/pose/classifier';

let failed = 0;
function expect(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

// 1. time-based smoothing
function shake(fps: number, seconds: number) {
  const sm = new StanceSmoother();
  let t = 0, lo = 1, hi = 0;
  const step = 1000 / fps;
  let k = 0;
  for (; t < seconds * 1000; t += step, k++) {
    const p = k % 2 ? 0.9 : 0.3; // shakes between 0.3 and 0.9 every frame
    const out = sm.pushProbs([1 - p, p], t)[1];
    if (t > 1500) { lo = Math.min(lo, out); hi = Math.max(hi, out); }
  }
  return hi - lo;
}
const s60 = shake(60, 4), s15 = shake(15, 4);
expect('60 fps: shaking probability is smoothed', s60 < 0.06, `swing ${s60.toFixed(3)}`);
expect('15 fps: shaking probability is smoothed', s15 < 0.25, `swing ${s15.toFixed(3)}`);
{
  const sm = new StanceSmoother();
  let out = 0;
  for (let t = 0; t < 3000; t += 1000 / 60) out = sm.pushProbs([0.9, 0.1], t)[1];
  let reached = -1;
  for (let t = 3000; t < 6000; t += 1000 / 60) { out = sm.pushProbs([0.1, 0.9], t)[1]; if (reached < 0 && out > 0.8) reached = t - 3000; }
  expect('a real change is followed within about a second', reached > 0 && reached < 1400, `${Math.round(reached)} ms`);
}
{
  const sm = new StanceSmoother();
  const m1 = sm.push({ knees: 150 }, 0);
  const m2 = sm.push({ knees: 170 }, 4000); // after a long gap: start again, no old value mixed in
  expect('measures start again after a gap', m1.knees === 150 && m2.knees === 170);
}

// 2 and 3. on a toy two-class model
const model = { format: 'cricket-coach-model', feature_version: 1, skill: 'stance', type: 'logreg', classes: ['correct', 'fault'], correct_class: 'correct', good_prob: 0.6 } as unknown as PositionModel;
const benchmarks = BENCHMARKS_BY_SKILL.stance;
// a stance the rules call good: every measure in the middle of its good range
const measures: Record<string, number> = {};
for (const b of benchmarks) measures[b.id] = (b.min + b.max) / 2;
const rules = scoreChecks(benchmarks, measures as any, 'right');
const at = (p: number, opts: { front?: boolean; wasGood?: boolean }) => judgeWithModel(rules, benchmarks, model, predictionFrom(model, [p, 1 - p]), 'right', opts);
expect('rules-good test stance', rules.score >= 85, `rules score ${rules.score}`);

expect('side: P 0.65 is good', at(0.65, {}).model!.good === true);
expect('side: P 0.55 is not good when it was not good', at(0.55, {}).model!.good === false);
expect('side: P 0.55 stays good when it was good (hysteresis)', at(0.55, { wasGood: true }).model!.good === true);
expect(`side: P ${(0.6 - MODEL_HYSTERESIS - 0.02).toFixed(2)} is no longer good`, at(0.6 - MODEL_HYSTERESIS - 0.02, { wasGood: true }).model!.good === false);
const goodSide = at(0.8, {});
expect('side: good model + good rules scores 85 or more', goodSide.score >= 85, `score ${goodSide.score}`);
const badSide = at(0.2, {});
expect('side: a fault scores below 85 and says what to fix', badSide.score < 85 && badSide.cues.length > 0, `score ${badSide.score}`);

const f45 = at(0.45, { front: true });
expect('front: P 0.45 with good rules counts (model not sure enough to stop it)', f45.model!.good === true && f45.score >= 85, `score ${f45.score}`);
const f20 = at(0.2, { front: true });
expect(`front: P 0.20 (below ${FRONT_VETO}) stops the stance`, f20.model!.good === false && f20.score < 85, `score ${f20.score}`);
const f30 = at(0.3, { front: true, wasGood: true });
expect('front: P 0.30 stays good when it was good (hysteresis)', f30.model!.good === true);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll steadiness checks passed');
if (failed) process.exit(1);
