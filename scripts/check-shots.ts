/**
 * Checks of the other basic shots (back-foot defence, pull, cut, sweep): the model position of
 * each scores 100 for its own shot, wrong positions are caught, and the training plan lists them.
 */
import { SHOT_DEMO_STEPS, SHOT_INFO, SHOT_LESSONS } from '../src/data/shotContent';
import { DEMO_STEPS, SKILL_INFO } from '../src/data/skills';
import { LESSONS } from '../src/data/curriculum';
import { dayPlan, introducedIn } from '../src/data/training';
import { BENCHMARKS_BY_SKILL, REQUIRED_PARTS, type Skill } from '../src/lib/pose/benchmarks';
import { figureToWorld, idealStance } from '../src/lib/pose/idealStance';
import { LM, type Hand, type PoseFrame, type Vec3 } from '../src/lib/pose/landmarks';
import { buildShot, idealShot, SHOT_END, SHOT_IDS } from '../src/lib/pose/shotPoses';
import { analyzePose, isGoodPosition } from '../src/lib/pose/stanceAnalyzer';
import { MODELS } from '../src/lib/pose/models';

// These checks test the coaching-range rules on drawn figures, so the trained models are switched
// off here. scripts/check-model.ts tests the trained models.
for (const k of Object.keys(MODELS)) delete (MODELS as Record<string, unknown>)[k];

let failed = 0;
function expect(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

function frameOf(pose: Vec3[], hand: Hand): PoseFrame {
  const lm: number[] = [];
  for (let i = 0; i < 33; i++) lm.push(0.5, 0.5, 0, 0.99);
  return { t: 0, lm, world: figureToWorld(pose, hand), bat: null };
}
const judge = (skill: Skill, pose: Vec3[], hand: Hand) => analyzePose(skill, frameOf(pose, hand), hand, undefined, { view: 'side' });

console.log('\nModel positions:');
for (const hand of ['right', 'left'] as Hand[]) {
  for (const shot of SHOT_IDS) {
    const a = judge(shot, idealShot(shot, hand), hand);
    expect(`${hand}: the model ${shot} scores 100 and counts`, a.state === 'ok' && a.score >= 95 && isGoodPosition(a), a.state === 'ok' ? `score ${a.score}, ${a.cues.map((c) => c.id).join()}` : a.state);
  }
}

console.log('\nWrong positions are caught:');
for (const shot of SHOT_IDS) {
  const stance = judge(shot, idealStance('right'), 'right');
  expect(`standing in the stance is not a ${shot}`, stance.state === 'ok' && !isGoodPosition(stance), stance.state === 'ok' ? `score ${stance.score}` : stance.state);
}
{
  // Weight forward in a back-foot shot: the head over the front foot.
  const pose = idealShot('backdefence', 'right').map((p) => [...p] as Vec3);
  for (const j of [LM.NOSE, LM.L_EAR, LM.R_EAR, LM.L_SHOULDER, LM.R_SHOULDER]) pose[j][0] += 0.6;
  const a = judge('backdefence', pose, 'right');
  expect('back-foot defence with the head forward is not good', a.state === 'ok' && !isGoodPosition(a) && a.cues.some((c) => c.id === 'weightBack'), a.state === 'ok' ? a.cues.map((c) => c.id).join() : a.state);
}

console.log('\nTeaching content:');
for (const shot of SHOT_IDS) {
  expect(`${shot}: has a demonstration, info and a lesson`, DEMO_STEPS[shot].length >= 6 && !!SKILL_INFO[shot] && LESSONS.some((l) => l.practice === shot));
  expect(`${shot}: every step has a figure position`, SHOT_DEMO_STEPS[shot].every((s) => !!s.shot));
  expect(`${shot}: the steps teach checks that exist`, SHOT_DEMO_STEPS[shot].every((s) => (s.teaches ?? []).every((id) => BENCHMARKS_BY_SKILL[shot].some((b) => b.id === id))));
  expect(`${shot}: all of its checks are taught in a step`, BENCHMARKS_BY_SKILL[shot].every((b) => SHOT_DEMO_STEPS[shot].some((s) => (s.teaches ?? []).includes(b.id))), BENCHMARKS_BY_SKILL[shot].map((b) => b.id).join());
  expect(`${shot}: needs the body parts`, REQUIRED_PARTS[shot].length >= 5);
  expect(`${shot}: the figure moves from the stance to the model`, buildShot(shot, 'right', SHOT_END)[LM.L_ANKLE][0] === idealShot(shot, 'right')[LM.L_ANKLE][0]);
}
expect('new lessons are in the list', SHOT_LESSONS.length === 3 && SHOT_LESSONS.every((l) => LESSONS.includes(l)));
expect('every lesson has a quiz with a valid answer', LESSONS.every((l) => l.quiz.every((q) => typeof q.answer !== 'number' || (q.answer >= 0 && q.answer < q.options.length))));
void SHOT_INFO;

console.log('\nTraining plan:');
for (const shot of SHOT_IDS) {
  const stage = introducedIn(shot);
  const plan = dayPlan(stage, 1);
  expect(`${shot}: has a stage with 10 on day 1`, plan.tasks.length === 1 && plan.tasks[0].skill === shot && plan.tasks[0].reps === 10, `stage ${stage}`);
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll shot checks passed');
