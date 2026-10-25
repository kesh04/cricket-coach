import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { LESSONS, isUnlocked, nextLesson, passesQuiz, type Lesson } from '@/data/curriculum';
import { DRILL_BY_ID, dayKey, EXTRA_SET, introducedIn, OPEN_FROM_START, programme as buildProgramme, repsByDay, STANCE_FIRST_REPS, stanceRepsDone, taskKey, type DrillId, type Programme, type Task, type TaskKey } from '@/data/training';
import { SKILL_NAME, SKILLS, type Skill } from '@/lib/pose/benchmarks';
import { backend, newId, type PracticeSession, type QuizAttempt } from '@/services/backend';
import { MUST_WATCH, MUST_WATCH_EVERY_DAY } from '@/data/videos';
import { allStepsOpen, markDemoWatched, markVideoDay, setAllStepsOpen, videoDays, watchedDemos } from '@/services/flags';
import { useAuth } from '@/state/AuthContext';

/** Where the learner has got to with one skill on the practice path. */
export type SkillState = {
  skill: Skill;
  /** Saved attempts, newest first. */
  attempts: PracticeSession[];
  best: number | null;
  /** Good repetitions done today. */
  today: number;
  /** Good repetitions on each day, by day key (see data/training.ts). */
  days: Map<string, number>;
  /** Repetitions of this skill in today's plan, or 0 when it is not in today's plan. */
  target: number;
  /** Repetitions still to do today for the plan. */
  remaining: number;
  /** How many to aim for in the next set: the rest of today's plan, or an extra set. */
  setSize: number;
  /** True when the plan has reached this skill (or a coach has opened every step) and, for every
   * skill but the stance, the stance has been done first (STANCE_FIRST_REPS good stances). */
  unlocked: boolean;
  /** True when this skill is closed only because the stance has not been done yet. */
  needsStance: boolean;
  /** True when today's plan for this skill is done (or it is not in today's plan). */
  doneToday: boolean;
  /** True once the demonstration has been watched to the end, and the coaching video if there is one. */
  watched: boolean;
  /** True when the coaching video for this skill has been watched (or there is none). */
  videoSeen: boolean;
};

/** One task of today's plan: a skill, or one step of a skill. */
export type TaskState = {
  key: TaskKey;
  skill: Skill;
  drill?: DrillId;
  /** Shown in lists. */
  name: string;
  /** Good repetitions done today. */
  today: number;
  /** Repetitions in today's plan. */
  target: number;
  remaining: number;
  done: boolean;
};

type DataState = {
  ready: boolean;
  quizAttempts: QuizAttempt[];
  /** Newest first. */
  sessions: PracticeSession[];
  /** Ids of lessons whose quiz has been passed. */
  passed: Set<string>;
  next: Lesson | null;
  unlocked(lessonId: string): boolean;
  recordQuiz(lessonId: string, score: number, total: number): QuizAttempt;
  recordSession(session: Omit<PracticeSession, 'id' | 'at'>): PracticeSession;
  /** Progress on each skill of the practice path. */
  skills: Record<Skill, SkillState>;
  /** Good stances held with the camera so far (the other practices open at STANCE_FIRST_REPS). */
  stanceReps: number;
  /** Where the learner is in the training plan, today's plan and the history of each day. */
  programme: Programme;
  /** Today's tasks, in order. */
  tasks: TaskState[];
  /** The first task of today's plan that is not done yet, or null when today's plan is done. */
  nextTask: TaskState | null;
  /** Good repetitions today and the plan's target for any skill or drill. */
  taskToday(key: TaskKey): { today: number; target: number; remaining: number; setSize: number };
  markWatched(skill: Skill): void;
  /** Records that the coaching video was watched to the end today. */
  markVideoSeen(skill: Skill): void;
  /** A coach can open every step, for a learner the camera cannot judge well. */
  stepsOpen: boolean;
  setStepsOpen(open: boolean): void;
  /** A save that failed, for example with no connection. The record is still kept on screen. */
  saveError: string | null;
};

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [ready, setReady] = useState(false);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [watched, setWatched] = useState<Skill[]>([]);
  const [stepsOpen, setStepsOpenState] = useState(false);
  const [videos, setVideos] = useState<Partial<Record<Skill, string>>>({});

  useEffect(() => {
    let alive = true;
    setReady(false);
    setQuizAttempts([]);
    setSessions([]);
    setWatched([]);
    setStepsOpenState(false);
    setVideos({});
    if (!uid) return;
    (async () => {
      try {
        const [q, s, w, open, v] = await Promise.all([
          backend.list(uid, 'quizAttempts', 200),
          backend.list(uid, 'practiceSessions', 400),
          watchedDemos(uid),
          allStepsOpen(uid),
          videoDays(uid),
        ]);
        if (!alive) return;
        setQuizAttempts(q);
        setSessions(s);
        setWatched(w);
        setStepsOpenState(open);
        setVideos(v);
      } catch (e) {
        if (alive) setSaveError((e as Error).message);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  const passed = useMemo(() => new Set(quizAttempts.filter((a) => a.passed).map((a) => a.lessonId)), [quizAttempts]);

  // Records appear on screen at once; the write to the backend happens in the background.
  const recordQuiz = useCallback(
    (lessonId: string, score: number, total: number) => {
      const attempt: QuizAttempt = { id: newId(), lessonId, score, total, passed: passesQuiz(score, total), at: Date.now() };
      setQuizAttempts((prev) => [attempt, ...prev]);
      if (uid) backend.add(uid, 'quizAttempts', attempt).then(() => setSaveError(null), (e) => setSaveError((e as Error).message));
      return attempt;
    },
    [uid],
  );

  const recordSession = useCallback(
    (input: Omit<PracticeSession, 'id' | 'at'>) => {
      const session: PracticeSession = { ...input, id: newId(), at: Date.now() };
      setSessions((prev) => [session, ...prev]);
      if (uid) backend.add(uid, 'practiceSessions', session).then(() => setSaveError(null), (e) => setSaveError((e as Error).message));
      return session;
    },
    [uid],
  );

  const markWatched = useCallback(
    (skill: Skill) => {
      setWatched((prev) => (prev.includes(skill) ? prev : [...prev, skill]));
      if (uid) void markDemoWatched(uid, skill);
    },
    [uid],
  );

  const markVideoSeen = useCallback(
    (skill: Skill) => {
      const day = dayKey(Date.now());
      setVideos((prev) => ({ ...prev, [skill]: day }));
      if (uid) void markVideoDay(uid, skill, day);
    },
    [uid],
  );

  const setStepsOpen = useCallback(
    (open: boolean) => {
      setStepsOpenState(open);
      if (uid) void setAllStepsOpen(uid, open);
    },
    [uid],
  );

  // Where the learner is in the training plan, worked out from the repetitions they have done.
  const plan = useMemo(() => buildProgramme(sessions), [sessions]);

  // The stance must be done before any other camera practice opens (STANCE_FIRST_REPS).
  const stanceReps = useMemo(() => stanceRepsDone(sessions), [sessions]);
  const stanceDone = stanceReps >= STANCE_FIRST_REPS;

  const skills = useMemo(() => {
    const out = {} as Record<Skill, SkillState>;
    for (const skill of SKILLS) {
      // Attempts saved before the grip was added have no kind; they were stance checks.
      const attempts = sessions.filter((s) => (s.kind ?? 'stance') === skill);
      const best = attempts.length ? Math.max(...attempts.map((a) => a.score)) : null;
      const days = repsByDay(attempts);
      const today = days.get(dayKey(Date.now())) ?? 0;
      // A skill taught in steps counts as one task per step; here the skill's total is used.
      const target = plan.today.tasks.filter((t) => t.skill === skill).reduce((n, t) => n + t.reps, 0);
      const remaining = Math.max(0, target - today);
      // A coaching video must be watched once (or every day, if set) before practice.
      const seenOn = videos[skill];
      const videoSeen = !MUST_WATCH[skill] || (MUST_WATCH_EVERY_DAY ? seenOn === dayKey(Date.now()) : !!seenOn);
      // Each skill opens when the plan reaches it. (The grip is not practised here: see benchmarks.ts.)
      const reached = skill === 'grip' || plan.stageIndex >= introducedIn(skill);
      out[skill] = {
        skill,
        attempts,
        best,
        today,
        days,
        target,
        remaining,
        setSize: remaining > 0 ? remaining : EXTRA_SET,
        unlocked: (reached || stepsOpen || OPEN_FROM_START.includes(skill)) && (skill === 'stance' || skill === 'grip' || stanceDone),
        needsStance: skill !== 'stance' && skill !== 'grip' && !stanceDone,
        doneToday: remaining === 0,
        watched: watched.includes(skill) && videoSeen,
        videoSeen,
      };
    }
    return out;
  }, [sessions, watched, stepsOpen, videos, plan, stanceDone]);

  const taskToday = useCallback(
    (key: TaskKey) => {
      const today = plan.todayReps[key] ?? 0;
      const target = plan.today.tasks.find((t) => taskKey(t) === key)?.reps ?? 0;
      const remaining = Math.max(0, target - today);
      return { today, target, remaining, setSize: remaining > 0 ? remaining : EXTRA_SET };
    },
    [plan],
  );
  const tasks = useMemo<TaskState[]>(
    () =>
      plan.today.tasks.map((t: Task) => {
        const key = taskKey(t);
        const today = plan.todayReps[key] ?? 0;
        const remaining = Math.max(0, t.reps - today);
        return { key, skill: t.skill, drill: t.drill, name: t.drill ? DRILL_BY_ID[t.drill].name : SKILL_NAME[t.skill], today, target: t.reps, remaining, done: remaining === 0 };
      }),
    [plan],
  );
  const nextTask = tasks.find((t) => !t.done) ?? null;

  const value = useMemo<DataState>(
    () => ({
      ready,
      quizAttempts,
      sessions,
      passed,
      next: nextLesson(passed),
      unlocked: (id: string) => isUnlocked(id, passed) || LESSONS.some((l) => l.id === id && !!l.practice && OPEN_FROM_START.includes(l.practice)),
      recordQuiz,
      recordSession,
      skills,
      stanceReps,
      programme: plan,
      tasks,
      nextTask,
      taskToday,
      markWatched,
      markVideoSeen,
      stepsOpen,
      setStepsOpen,
      saveError,
    }),
    [ready, quizAttempts, sessions, passed, recordQuiz, recordSession, skills, stanceReps, plan, tasks, nextTask, taskToday, markWatched, markVideoSeen, stepsOpen, setStepsOpen, saveError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}

/** Where to go to practise a skill: the demonstration first if it has not been watched yet. */
export function practiseRoute(state: SkillState, drill?: DrillId): string {
  if (!state.watched) return `/demo/${state.skill}`;
  return drill ? `/setup?skill=${state.skill}&drill=${drill}` : `/setup?skill=${state.skill}`;
}

/** Where to go for a task of today's plan. */
export function taskRoute(task: TaskState, skills: Record<Skill, SkillState>): string {
  return practiseRoute(skills[task.skill], task.drill);
}


export function levelProgress(level: number, passed: Set<string>) {
  const lessons = LESSONS.filter((l) => l.level === level);
  const done = lessons.filter((l) => passed.has(l.id)).length;
  return { done, total: lessons.length };
}
