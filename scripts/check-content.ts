/**
 * Checks the learning content added in the sixteenth round:
 *  - the dismissals lesson covers all 11 ways of being out, and every quiz answer is valid;
 *  - "Read the field" questions: valid answers, and the batter's hand really follows from where
 *    the slip is drawn (seen from behind the bowler, a right-hander's slip is on the left);
 *  - the stance comes first: other practices open only after STANCE_FIRST_REPS good stances.
 */
import { LESSONS } from '../src/data/curriculum';
import { fieldPositions } from '../src/data/fieldPositions';
import { makeFieldQuestions, powerplayQuestion } from '../src/data/fieldQuestions';
import { isOutsideCircle } from '../src/data/fieldPositions';
import { judgePlacement, makeSetTasks, maxOutside } from '../src/data/fieldTasks';
import { LEVELS } from '../src/data/curriculum';
import { STANCE_FIRST_REPS, stanceRepsDone } from '../src/data/training';
import { standingSide } from '../src/lib/pose/stanceAnalyzer';
import { SteadinessMeter } from '../src/lib/steadiness';
import { parseCoachReply } from '../src/services/coachReply';
import { makeGripQuestions } from '../src/data/gripQuiz';
import { career, checkMatch, highestText, parseOvers, oversText } from '../src/data/matchStats';
import { idealStance } from '../src/lib/pose/idealStance';

let failed = 0;
function expect(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

const d = LESSONS.find((l) => l.id === 'dismissals')!;
const ways = ['Bowled', 'Caught', 'Leg before wicket', 'Run out', 'Stumped', 'Hit wicket', 'Hit the ball twice', 'Obstructing the field', 'Handled the ball', 'Timed out', 'Retired out'];
const headings = d.sections.map((s) => s.heading);
expect('dismissals lesson names all 11 ways', ways.every((w) => headings.some((h) => h.includes(w))), headings.filter((h) => /^\d+\./.test(h)).length + ' numbered sections');
let quizOk = true;
for (const l of LESSONS) for (const q of l.quiz) {
  const idx = typeof q.answer === 'number' ? [q.answer] : [q.answer.right, q.answer.left];
  if (idx.some((i) => i < 0 || i >= q.options.length)) quizOk = false;
}
expect('every lesson quiz answer points at an option', quizOk);
expect('dismissals quiz has 10 or more questions', d.quiz.length >= 10, `${d.quiz.length} questions`);

let valid = true, handOk = true, both = new Set<string>(), seen = 0;
for (let k = 0; k < 300; k++) {
  for (const q of makeFieldQuestions()) {
    seen++;
    if (q.answer < 0 || q.answer >= q.options.length || new Set(q.options).size !== q.options.length) valid = false;
    if (q.options[0] === 'Right-handed batter') {
      both.add(q.hand);
      const slip = fieldPositions(q.hand).find((p) => p.id === 'slip')!;
      const slipLeft = slip.x < 0; // drawn left of the keeper
      const said = q.answer === 0 ? 'right' : 'left';
      if ((slipLeft ? 'right' : 'left') !== said) handOk = false;
      if (q.sides) handOk = false; // the side labels would give the answer away
    }
  }
}
expect('field questions: answers valid, no repeated options', valid, `${seen} questions`);
expect('field questions: the batter’s hand follows from the slip’s side', handOk);
expect('field questions: both right- and left-handed fields are asked', both.size === 2);

const rep = (at: number) => ({ at, score: 90 });
const stance = (n: number) => ({ id: 's', kind: 'stance', score: 90, at: 0, reps: Array.from({ length: n }, (_, i) => rep(i)) }) as any;
expect(`stance first: ${STANCE_FIRST_REPS - 1} good stances are not enough`, stanceRepsDone([stance(STANCE_FIRST_REPS - 1)]) < STANCE_FIRST_REPS);
expect(`stance first: ${STANCE_FIRST_REPS} good stances open the shots`, stanceRepsDone([stance(4), stance(STANCE_FIRST_REPS - 4)]) >= STANCE_FIRST_REPS);
expect('stance first: shot practice does not count as stance', stanceRepsDone([{ ...stance(20), kind: 'defence' }]) === 0);

// Seventeenth round: field and umpire lessons, Set the field, powerplay questions.
for (const id of ['fielding-positions', 'setting-a-field', 'umpires-appeals']) {
  const l = LESSONS.find((x) => x.id === id);
  expect(`lesson ${id} exists with 8+ questions`, !!l && l.quiz.length >= 8 && l.level === 5, l ? `${l.quiz.length} questions` : 'missing');
}
expect('level 5 is listed', LEVELS.some((v) => v.number === 5));
const fieldText = JSON.stringify(LESSONS.find((x) => x.id === 'setting-a-field'));
expect('powerplay lesson gives the ODI and T20 limits', /1 to 10/.test(fieldText) && /11 to 40/.test(fieldText) && /41 to 50/.test(fieldText) && /1 to 6/.test(fieldText));
expect('appeal lesson says "How’s that?" and before the next ball', /How’s that\?/.test(JSON.stringify(LESSONS.find((x) => x.id === 'umpires-appeals'))) && /next ball/.test(JSON.stringify(LESSONS.find((x) => x.id === 'umpires-appeals'))));

expect('powerplay limits', maxOutside('odi', 1) === 2 && maxOutside('odi', 10) === 2 && maxOutside('odi', 11) === 4 && maxOutside('odi', 40) === 4 && maxOutside('odi', 41) === 5 && maxOutside('t20', 6) === 2 && maxOutside('t20', 7) === 5);
expect('ring fielders are inside the circle, boundary fielders outside',
  ['slip', 'gully', 'point', 'cover', 'mid-off', 'mid-on', 'mid-wicket', 'square-leg'].every((id) => !isOutsideCircle(fieldPositions('right').find((p) => p.id === id)!)) &&
  ['fine-leg', 'third-man', 'long-off', 'long-on', 'deep-point', 'deep-cover', 'deep-mid-wicket', 'deep-square-leg'].every((id) => isOutsideCircle(fieldPositions('right').find((p) => p.id === id)!)));
let ppOk = true;
for (const fmt of ['odi', 't20'] as const) for (const over of [1, 6, 7, 10, 11, 40, 41, 50]) for (let n = 1; n <= 5; n++) {
  if (fmt === 't20' && over > 20) continue;
  const q = powerplayQuestion('right', fmt, over, n);
  const out = fieldPositions('right').filter((p) => q.show.includes(p.id) && isOutsideCircle(p)).length;
  if (out !== n || q.show.length !== 10 || q.answer !== (n <= maxOutside(fmt, over) ? 0 : 1)) ppOk = false;
}
expect('powerplay questions: right count outside and right answer', ppOk);

for (const hand of ['right', 'left'] as const) {
  const tasks = makeSetTasks(hand);
  const exact = tasks.every((t) => { const p = fieldPositions(t.hand).find((f) => f.id === t.id)!; return judgePlacement(t.hand, t.id, p.x, p.y).ok; });
  const mirrored = tasks.every((t) => { const p = fieldPositions(t.hand).find((f) => f.id === t.id)!; return !judgePlacement(t.hand, t.id, -p.x, p.y).ok && !judgePlacement(t.hand, t.id, -p.x, p.y).sideOk; });
  expect(`set the field (${hand}): a tap on the spot counts`, exact);
  expect(`set the field (${hand}): the mirror side is wrong`, mirrored);
  expect(`set the field (${hand}): both hands are asked`, new Set(tasks.map((t) => t.hand)).size === 2);
}
// Slip vs gully must not both count from one tap.
const slipP = fieldPositions('right').find((p) => p.id === 'slip')!;
expect('set the field: a tap on slip is not a gully', !judgePlacement('right', 'gully', slipP.x, slipP.y).ok);
const pointP = fieldPositions('right').find((p) => p.id === 'point')!;
expect('set the field: a tap on point is not a cover', !judgePlacement('right', 'cover', pointP.x, pointP.y).ok);

// Eighteenth round: no "other way round" verdict without the whole body.
{
  const pose = idealStance('right');
  const world = pose.flatMap((p) => [p[0], -p[1], p[2]]);
  const lmAll = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 0.95]).flat();
  const faceOnly = Array.from({ length: 33 }, (_, i) => [0.5, 0.5, 0, i <= 10 ? 0.95 : 0.1]).flat();
  expect('wrong side: no verdict when only the face is seen', standingSide(world, faceOnly, 'front') === 0 && standingSide(world, faceOnly, 'side') === 0);
  const full = standingSide(world, lmAll, 'side');
  expect('wrong side: the whole body still gives a verdict (or none), never a contradiction', Math.abs(full) <= 1);
}

// Nineteenth round: phone steadiness, grip quiz, coach reply parsing.
{
  const run = (fn: (m: SteadinessMeter, t: number) => void, ms: number) => { const m = new SteadinessMeter(); for (let t = 0; t <= ms; t += 100) fn(m, t); return m.state; };
  expect('phone: standing still reads steady', run((m, t) => { m.rotation(0.01, 0.02, 0, t); m.acceleration(0, -1, 0.05, t); }, 3000) === 'steady');
  expect('phone: held in a shaking hand reads moving', run((m, t) => { m.rotation(0.5 * Math.sin(t), 0.4, 0.2, t); m.acceleration(0.2 * Math.sin(t / 50), -1.1, 0.1, t); }, 3000) === 'moving');
  expect('phone: lying on its back reads flat', run((m, t) => { m.rotation(0, 0, 0, t); m.acceleration(0, 0.05, -1, t); }, 3000) === 'flat');
  expect('phone: one quick knock does not count', run((m, t) => { const knock = t >= 1000 && t <= 1200; m.rotation(knock ? 1.5 : 0, 0, 0, t); m.acceleration(0, -1, 0, t); }, 1700) === 'steady');
}
{
  let ok = true;
  for (let k = 0; k < 50; k++) for (const q of makeGripQuestions()) if (q.answer < 0 || q.options.length !== 4 || new Set(q.options).size !== 4) ok = false;
  expect('grip quiz: four different options and a valid answer', ok);
  expect('grip quiz: every mistake and one good grip', new Set(makeGripQuestions().map((q) => q.fault ?? 'none')).size === 6);
}
{
  const p = parseCoachReply('Bend your knees a little.\n- Drill: 10 holds.\nNEXT: How low should I bend? | Quiz me on the stance | What next?\nOPEN: lesson:stance');
  expect('coach reply: machine lines are hidden', p.body === 'Bend your knees a little.\n- Drill: 10 holds.');
  expect('coach reply: follow-up questions', p.next.length === 3 && p.next[1] === 'Quiz me on the stance');
  expect('coach reply: open a lesson', p.open?.route === '/lesson/stance');
  expect('coach reply: a half-written NEXT line is hidden while streaming', parseCoachReply('Good.\nNEX').body === 'Good.');
  expect('coach reply: unknown screens are ignored', parseCoachReply('Hi\nOPEN: https://evil.example').open === null && parseCoachReply('Hi\nOPEN: none').open === null);
}

// Twenty-third round: the learner's own match figures.
{
  const base = { opponent: '', format: 'short', result: null, balls: null, fours: 0, sixes: 0, bowled: false, ballsBowled: 0, runsConceded: 0, wickets: 0, catches: 0, notes: '', savedAt: 0 } as const;
  const m = (i: number, runs: number, howOut: any, extra: object = {}) => ({ ...base, id: String(i), at: i * 86_400_000, runs, howOut, ...extra }) as any;
  const list = [
    m(1, 140, 'not-out', { balls: 100, fours: 15, sixes: 5 }),
    m(2, 0, 'bowled', { balls: 3 }),
    m(3, 55, 'caught', { balls: 60, fours: 6 }),
    m(4, 0, 'did-not-bat', { bowled: true, ballsBowled: 24, runsConceded: 20, wickets: 3 }),
    m(5, 140, 'caught', { bowled: true, ballsBowled: 18, runsConceded: 12, wickets: 3 }),
    m(6, 12, 'retired-not-out', { catches: 2 }),
    m(7, 213, 'lbw', { balls: 150 }),
  ];
  const c = career(list);
  expect('matches: 7 matches, 6 innings, 2 not outs', c.matches === 7 && c.innings === 6 && c.notOuts === 2);
  expect('matches: runs add up', c.runs === 140 + 0 + 55 + 140 + 12 + 213);
  expect('matches: highest is 213', highestText(c) === '213');
  expect('matches: a not-out 140 beats an out 140', highestText(career(list.slice(0, 5))) === '140*');
  expect('matches: average = runs / dismissals', Math.abs((c.average ?? 0) - 560 / 4) < 1e-9);
  expect('matches: strike rate over innings with balls only', Math.abs((c.strikeRate ?? 0) - ((140 + 0 + 55 + 213) / (100 + 3 + 60 + 150)) * 100) < 1e-9);
  expect('matches: 50s, 100s and ducks', c.fifties === 1 && c.hundreds === 3 && c.ducks === 1);
  expect('matches: best bowling 3/12', c.bowling.best?.wickets === 3 && c.bowling.best?.runs === 12 && c.bowling.wickets === 6);
  expect('matches: economy per over', Math.abs((c.bowling.economy ?? 0) - (32 / 42) * 6) < 1e-9);
  expect('matches: caught is the most common way out', c.dismissals[0].howOut === 'caught' && c.dismissals[0].count === 2);
  expect('matches: form shows the last 5, newest first', c.form.join(' ') === '213 12* 140 55 0');
  expect('matches: no average before the first dismissal', career([m(1, 30, 'not-out')]).average === null);
  expect('overs: 4.3 is 27 balls, 4.6 is not valid', parseOvers('4.3') === 27 && parseOvers('4.6') === null && parseOvers('4') === 24 && oversText(27) === '4.3');
  expect('check: fours and sixes cannot make more than the runs', !!checkMatch({ ...m(1, 10, 'caught', { fours: 3 }) }).boundaries);
  expect('check: a good match passes', Object.keys(checkMatch(m(1, 40, 'bowled', { balls: 30, fours: 4, sixes: 1 }))).length === 0);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll content checks passed');
if (failed) process.exit(1);
