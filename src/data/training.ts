import type { CheckId, Skill } from '@/lib/pose/benchmarks';
import type { PracticeSession, Rep } from '@/services/backend';

export type { Rep };

/**
 * The training plan.
 *
 * The plan is made of stages. Each stage lasts DAYS_PER_STAGE days, and the number of good
 * repetitions grows every day: 10 on day 1, 20 on day 2, and so on up to 50 on day 5.
 * A day of the plan counts only when everything in that day's plan was done, so a learner who
 * misses a day does not fall behind; the plan simply waits.
 *
 *   Stage 1  The stance            day 1: 10 stances ... day 5: 50 stances
 *   Stage 2  The forward defence   2 parts every day, each 10 on day 1 ... 50 on day 5:
 *              1. footwork (front foot forward)  2. the full forward defence
 *            (eyes, bat and knee are checked inside the full defence)
 *            The learner may do the steps in any order. The stance is not a step of its own: it
 *            is checked quickly before every repetition (a gate), and when it is good the
 *            repetition goes straight on.
 *   Stage 3  The front-foot drive  day 1: 10 drives ... day 5: 50 drives
 *   Stage 4-7 Back-foot defence, pull, cut, sweep: same, one shot per stage
 *   Stage 4+ Keep sharp            20 full forward defences and 20 drives a day
 *
 * The grip is learnt first, without the pose camera (a photo of the grip can be checked by the
 * AI coach instead). Every step of the defence, and every drive, starts with a
 * stance check, so a stance that slips is caught and the learner is sent back to practise it.
 */

/** The two parts of the forward defence, practised one at a time, in any order. The stance is only a quick check before each repetition. */
export type DrillId = 'def-footwork' | 'def-full';
/** What a task counts: a whole skill, or one step (drill) of a skill. */
export type TaskKey = Skill | DrillId;

export type Drill = {
  id: DrillId;
  /** The skill this drill belongs to. Sessions are saved under this skill. */
  skill: Skill;
  /** The pose the camera judges: the stance benchmarks or the forward defence benchmarks. */
  judge: Skill;
  /** 1 to 4. */
  step: number;
  name: string;
  /** Used in sentences: "your footwork". */
  noun: string;
  /** The checks that count for this drill. */
  checks: CheckId[];
  /** True when every repetition starts with a stance check. */
  gate: boolean;
  /** What to do, in one sentence. */
  what: string;
  /** One repetition, step by step. */
  rep: string[];
  /** Spoken when the learner may start the next repetition. */
  again: string;
  /** Spoken after a good repetition. */
  relax: string;
};

export const DRILLS: Drill[] = [
  {
    id: 'def-footwork',
    skill: 'defence',
    judge: 'defence',
    step: 1,
    name: 'Step 1: Footwork',
    noun: 'footwork',
    checks: ['stride', 'frontKnee', 'backLeg'],
    gate: true,
    what: 'From your stance, bring your {front} foot forward towards the ball: a comfortable step, not too short and not too long. Bend the front knee and keep the back leg long.',
    rep: ['Take your stance and hold it until you hear "Go".', 'Step forward with your {front} foot, toes pointing down the pitch.', 'Bend the front knee, back leg nearly straight. Hold it.', 'Step back into your stance.'],
    again: 'Go. Step forward with your front foot and hold it.',
    relax: 'Good step. Go back to your stance.',
  },
  {
    id: 'def-full',
    skill: 'defence',
    judge: 'defence',
    step: 2,
    name: 'Step 2: Full forward defence',
    noun: 'forward defence',
    checks: ['stride', 'frontKnee', 'backLeg', 'headOver', 'headDown', 'leanIn', 'batPad', 'elbow', 'batTilt'],
    gate: true,
    what: 'Put it all together: stance, step, eyes, bat. Play the whole forward defence and hold it.',
    rep: ['Take your stance and hold it until you hear "Go".', 'Step forward and lean in: head down over the knee, eyes on the ball.', 'Bat down next to your pad, elbow high. Hold the shot for 2 seconds.', 'Step back into your stance.'],
    again: 'Go. Play the forward defence and hold it.',
    relax: 'Good defence. Go back to your stance.',
  },
];
export const DRILL_BY_ID = Object.fromEntries(DRILLS.map((d) => [d.id, d])) as Record<DrillId, Drill>;
export const DRILLS_OF: Partial<Record<Skill, Drill[]>> = { defence: DRILLS };

export function isDrill(key: string | undefined | null): key is DrillId {
  return !!key && key in DRILL_BY_ID;
}

export type Task = { skill: Skill; drill?: DrillId; reps: number };
export const taskKey = (t: { skill: Skill; drill?: DrillId }): TaskKey => t.drill ?? t.skill;

/** One day of the plan. */
export type DayPlan = {
  /** Stage number, from 1. */
  stage: number;
  /** Day of the stage, from 1. */
  day: number;
  /** How many days the stage lasts. */
  days: number;
  title: string;
  focus: string;
  tasks: Task[];
};

/** Days with the whole plan done that finish one stage. */
/**
 * Skills that are open from the first day, before the plan reaches them, so they can be tried
 * now. The forward defence is open for testing. For the study, set this to [] so each skill
 * opens when the plan reaches it (or use Profile → Practice order → All steps open).
 */
export const OPEN_FROM_START: Skill[] = ['defence', 'drive', 'backdefence', 'pull', 'cut', 'sweep'];

/**
 * The stance comes first. No other camera practice opens until the learner has held this many
 * good stances with the camera, over all days (25 October 2026: raised from 10 to 50, so the
 * stance is a habit before any shot is practised). Every shot starts from the stance, so a shot
 * practised from a poor stance builds the wrong habit.
 */
export const STANCE_FIRST_REPS = 50;

/** Good stances held with the camera so far, over all days. */
export function stanceRepsDone(sessions: PracticeSession[]): number {
  let n = 0;
  for (const s of sessions) if ((s.kind ?? 'stance') === 'stance' && !s.drill) n += (s.reps ?? []).length;
  return n;
}

export const DAYS_PER_STAGE = 5;
/** Repetitions on day 1 of a stage; each later day adds the same again (10, 20, 30, 40, 50). */
export const REPS_PER_DAY_STEP = 10;
/** Once the stages are done, each shot is kept sharp with this many a day. */
export const KEEP_SHARP_REPS = 20;
/** Repetitions in a set when the learner practises something that is not in today's plan. */
export const EXTRA_SET = 10;

type StageDef = { title: string; focus: string; tasks(day: number): Task[] };
const grow = (day: number) => REPS_PER_DAY_STEP * day;

const STAGES: StageDef[] = [
  {
    title: 'The stance',
    focus: 'Make a good stance a habit before any shot. A few more every day.',
    tasks: (d) => [{ skill: 'stance', reps: grow(d) }],
  },
  {
    title: 'The forward defence, step by step',
    focus: 'Two things every day: the footwork, then the whole forward defence. Your stance is checked quickly before each one.',
    tasks: (d) => DRILLS.map((dr) => ({ skill: 'defence' as Skill, drill: dr.id, reps: grow(d) })),
  },
  {
    title: 'The front-foot drive',
    focus: 'The shot that scores runs off a full ball.',
    tasks: (d) => [{ skill: 'drive', reps: grow(d) }],
  },
  {
    title: 'The back-foot defence',
    focus: 'Stopping the shorter ball: step back and across, weight on the back foot.',
    tasks: (d) => [{ skill: 'backdefence', reps: grow(d) }],
  },
  {
    title: 'The pull shot',
    focus: 'Turning a short ball round to the leg side.',
    tasks: (d) => [{ skill: 'pull', reps: grow(d) }],
  },
  {
    title: 'The square cut',
    focus: 'Cutting a wide, short ball out to the off side.',
    tasks: (d) => [{ skill: 'cut', reps: grow(d) }],
  },
  {
    title: 'The sweep',
    focus: 'Getting low to a spinner and sweeping to the leg side.',
    tasks: (d) => [{ skill: 'sweep', reps: grow(d) }],
  },
];

const KEEP_SHARP: StageDef = {
  title: 'Keep sharp',
  focus: 'The whole forward defence and the drive, every day.',
  tasks: () => [
    { skill: 'defence', drill: 'def-full', reps: KEEP_SHARP_REPS },
    { skill: 'drive', reps: KEEP_SHARP_REPS },
  ],
};

/** The plan for one day: stage counting from 0, day of the stage counting from 1. */
export function dayPlan(stageIndex: number, day = 1): DayPlan {
  const def = STAGES[stageIndex] ?? KEEP_SHARP;
  const d = Math.max(1, Math.min(DAYS_PER_STAGE, day));
  return { stage: stageIndex + 1, day: d, days: DAYS_PER_STAGE, title: def.title, focus: def.focus, tasks: def.tasks(d) };
}

/** How many stages are listed before "keep sharp". */
export const STAGE_COUNT = STAGES.length;

/** The stage in which a skill first appears in the plan, counting from 0. */
export function introducedIn(skill: Skill): number {
  const i = STAGES.findIndex((s) => s.tasks(1).some((t) => t.skill === skill));
  return i < 0 ? 0 : i;
}

/** A repetition counts when a good position is held this long. */
export const REP_HOLD_MS = 2500;
/**
 * Between repetitions the learner must come out of position: the position must stop counting
 * as good (see isGoodPosition) for this long, or the body must leave the picture for this long.
 */
export const RELAX_MS = 800;

/** Shots: a good stance must be held this long before the shot is played. */
export const STANCE_GATE_HOLD_MS = 800;
/** If a good stance is not reached in this long, the stance check is failed. */
export const STANCE_GATE_TIMEOUT_MS = 25000;
/** After this many failed stance checks in one set, the learner is sent back to stance practice. */
export const STANCE_FAILS_TO_SEND_BACK = 2;

/** The local calendar day of a time, as "2026-10-08". */
export function dayKey(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Good repetitions on each day, by day key. */
export function repsByDay(attempts: PracticeSession[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const s of attempts) {
    for (const r of s.reps ?? []) days.set(dayKey(r.at), (days.get(dayKey(r.at)) ?? 0) + 1);
  }
  return days;
}

export type SkillReps = Partial<Record<TaskKey, number>>;

/** What a saved session counts towards: its drill, or its skill. */
export function sessionKey(s: PracticeSession): TaskKey {
  return s.drill ?? s.kind ?? 'stance';
}

/** Good repetitions of every skill and drill on each day. */
export function repsPerDay(sessions: PracticeSession[]): Map<string, SkillReps> {
  const days = new Map<string, SkillReps>();
  for (const s of sessions) {
    const kind = sessionKey(s);
    for (const r of s.reps ?? []) {
      const key = dayKey(r.at);
      const d = days.get(key) ?? {};
      d[kind] = (d[kind] ?? 0) + 1;
      days.set(key, d);
    }
  }
  return days;
}

/** True when every task of a plan has been done. */
export function planDone(plan: DayPlan, reps: SkillReps | undefined): boolean {
  return plan.tasks.every((t) => (reps?.[taskKey(t)] ?? 0) >= t.reps);
}

/** How a day went: the whole plan was done, some practice was done, or none. */
export type DayStatus = 'done' | 'some' | 'none';

export type Programme = {
  /** The plan in force today. */
  today: DayPlan;
  /** Index of today's stage, counting from 0. */
  stageIndex: number;
  /** Good repetitions of each skill and drill today. */
  todayReps: SkillReps;
  todayDone: boolean;
  /** Days of today's stage on which the whole plan was done, today included. */
  daysDone: number;
  /** True when today finished the stage, so the next stage starts tomorrow. */
  nextStageTomorrow: boolean;
  /** Each practised day: how it went, the plan in force then, and the repetitions done. */
  days: Map<string, { status: DayStatus; plan: DayPlan; reps: SkillReps }>;
  /** Days in a row, up to today, on which the whole plan was done. */
  streak: number;
};

/**
 * Works out where the learner is in the plan from the repetitions they have done.
 * Days are taken in order; each day is judged against the plan in force on that day (the stage
 * and the day of the stage), and a stage moves on after DAYS_PER_STAGE days with the whole plan done.
 */
export function programme(sessions: PracticeSession[], now = Date.now()): Programme {
  const perDay = repsPerDay(sessions);
  const todayKey = dayKey(now);
  const keys = [...perDay.keys()].filter((k) => k <= todayKey).sort();
  const days: Programme['days'] = new Map();
  let index = 0;
  let done = 0;
  let todayPlan: DayPlan | null = null;
  let todayDaysDone = 0;
  let nextStageTomorrow = false;
  for (const key of keys) {
    const plan = dayPlan(index, done + 1);
    const reps = perDay.get(key) ?? {};
    const complete = planDone(plan, reps);
    const any = Object.values(reps).some((n) => (n ?? 0) > 0);
    days.set(key, { status: complete ? 'done' : any ? 'some' : 'none', plan, reps });
    if (complete) done++;
    if (key === todayKey) {
      todayPlan = plan;
      todayDaysDone = done;
    }
    if (complete && done >= DAYS_PER_STAGE) {
      if (key === todayKey) nextStageTomorrow = true;
      index++;
      done = 0;
    }
  }
  const today = todayPlan ?? dayPlan(index, done + 1);
  const stageIndex = today.stage - 1;
  const todayReps = perDay.get(todayKey) ?? {};

  // Streak: whole-plan days in a row, ending today, or yesterday while today is not done yet.
  let streak = 0;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (days.get(todayKey)?.status !== 'done') d.setDate(d.getDate() - 1);
  while (days.get(dayKey(d.getTime()))?.status === 'done') {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return {
    today,
    stageIndex,
    todayReps,
    todayDone: planDone(today, todayReps),
    daysDone: todayPlan ? todayDaysDone : done,
    nextStageTomorrow,
    days,
    streak,
  };
}

/** The last `count` days, oldest first, as day keys. */
export function lastDays(count: number, now = Date.now()): string[] {
  const out: string[] = [];
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    out.push(dayKey(day.getTime()));
  }
  return out;
}

/** A short line for a day's plan: "10 stances" or "5 steps, 20 each". */
export function planLine(plan: DayPlan): string {
  const drills = plan.tasks.filter((t) => t.drill);
  if (drills.length > 1 && drills.every((t) => t.reps === drills[0].reps) && drills.length === plan.tasks.length) {
    return `${drills.length} steps, ${drills[0].reps} of each`;
  }
  return plan.tasks.map((t) => `${t.reps} ${t.drill ? DRILL_BY_ID[t.drill].noun : t.skill}`).join(' and ');
}

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** "Three", for the voice; numbers above ten are said as numbers. */
export function spokenNumber(n: number): string {
  return WORDS[n] ?? String(n);
}
