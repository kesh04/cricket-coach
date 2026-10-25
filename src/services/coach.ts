import { fetch as streamingFetch } from 'expo/fetch';

import { LESSONS, LESSON_BY_ID, nextLesson, personalise, sentence } from '@/data/curriculum';
import { programme, planLine } from '@/data/training';
import { BENCHMARK_BY_ID, SKILL_NAME, SKILLS, type CheckId, type Skill } from '@/lib/pose/benchmarks';
import type { CoachMessage, MatchRecord, PracticeSession, QuizAttempt, UserProfile } from '@/services/backend';
import { careerLine } from '@/data/matchStats';
import { stanceRepsDone, STANCE_FIRST_REPS } from '@/data/training';

/**
 * The AI coach.
 *
 * The app never talks to the language model directly, because that would put the API key
 * inside the app where anyone could read it. It calls the small server in /server, which
 * adds the coaching instructions, calls the model and streams the answer back word by word.
 *
 * Set EXPO_PUBLIC_COACH_API_URL in .env to the address of that server.
 * Without it, the coach answers from tips stored in the app.
 */
const API_URL = (process.env.EXPO_PUBLIC_COACH_API_URL ?? '').replace(/\/+$/, '');

export const coachConfigured = API_URL.length > 0;

/** What the server is told about the learner. No name, email or other identifying detail is sent. */
export type LearnerSummary = {
  ageGroup: string;
  experience: string;
  battingHand: string;
  goal: string;
  lessonsPassed: string[];
  nextLesson: string | null;
  recentStanceScores: number[];
  /** Stance faults seen most often in recent checks, most frequent first. */
  commonFaults: string[];
  recentGripScores: number[];
  /** Grip faults seen most often in recent checks, most frequent first. */
  commonGripFaults: string[];
  /** Where the learner is in the training plan, for example "week 2 (stance and forward defence): ...". */
  practiceStep: string | null;
  /** Each skill practised with the camera: latest and best score and how many sets. */
  skillScores?: string[];
  /** Good stances done towards the stance-first rule, e.g. "7 of 10". */
  stanceFirst?: string;
  /** Lessons whose quiz was tried but not passed yet. */
  quizzesToRetry?: string[];
  /** Days with practice in the last 14 days. */
  daysPractisedLast14?: number;
  /** When the learner last practised, e.g. "today", "3 days ago", "never". */
  lastPractice?: string;
  /** The learner's own match figures, from the matches they entered. */
  matchRecord?: string;
};

/** The faults seen most often in a few attempts, most frequent first. */
function commonFaults(attempts: PracticeSession[]): string[] {
  const counts = new Map<CheckId, number>();
  for (const s of attempts) {
    for (const c of s.checks) {
      if (c.value !== null && c.status !== 'good') counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => BENCHMARK_BY_ID[id].label.toLowerCase());
}

const DAY = 86_400_000;

function skillScores(sessions: PracticeSession[]): string[] {
  const by = new Map<string, PracticeSession[]>();
  for (const s of sessions) {
    const k = s.kind ?? 'stance';
    if (k === 'grip') continue;
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  return [...by.entries()].map(([k, list]) => {
    const sorted = list.slice().sort((a, b) => b.at - a.at);
    const best = Math.max(...list.map((x) => x.score));
    return `${SKILL_NAME[k as Skill] ?? k}: latest ${sorted[0].score}, best ${best}, ${list.length} set${list.length === 1 ? '' : 's'}`;
  });
}

function lastPractice(sessions: PracticeSession[], now: number): string {
  if (!sessions.length) return 'never';
  const days = Math.floor((now - Math.max(...sessions.map((s) => s.at))) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

export function summariseLearner(profile: UserProfile, passed: Set<string>, sessions: PracticeSession[], quizAttempts: QuizAttempt[] = [], now = Date.now(), matches: MatchRecord[] = []): LearnerSummary {
  // Attempts saved before the grip was added have no kind; they were stance checks.
  const stance = sessions.filter((s) => (s.kind ?? 'stance') === 'stance').slice(0, 5);
  const grip = sessions.filter((s) => s.kind === 'grip').slice(0, 5);
  const plan = programme(sessions);
  const step = `stage ${plan.today.stage} (${plan.today.title.toLowerCase()}), day ${plan.today.day} of ${plan.today.days}: today ${planLine(plan.today)}; today ${plan.todayDone ? 'done' : 'not finished yet'}`;
  return {
    ageGroup: profile.ageGroup,
    experience: profile.experience,
    battingHand: profile.battingHand,
    goal: profile.goal,
    lessonsPassed: LESSONS.filter((l) => passed.has(l.id)).map((l) => l.title),
    nextLesson: nextLesson(passed)?.title ?? null,
    recentStanceScores: stance.map((s) => s.score),
    commonFaults: commonFaults(stance),
    recentGripScores: grip.map((s) => s.score),
    commonGripFaults: commonFaults(grip),
    practiceStep: step,
    skillScores: skillScores(sessions),
    stanceFirst: `${Math.min(stanceRepsDone(sessions), STANCE_FIRST_REPS)} of ${STANCE_FIRST_REPS} good stances (the shots open at ${STANCE_FIRST_REPS})`,
    quizzesToRetry: [...new Set(quizAttempts.filter((a) => !a.passed && !passed.has(a.lessonId)).map((a) => LESSON_BY_ID[a.lessonId]?.title).filter(Boolean) as string[])],
    daysPractisedLast14: new Set(sessions.filter((s) => now - s.at < 14 * DAY).map((s) => new Date(s.at).toDateString())).size,
    lastPractice: lastPractice(sessions, now),
    matchRecord: careerLine(matches),
  };
}

export { openTarget, parseCoachReply, type CoachAction, type ParsedReply } from './coachReply';

export type CoachReply = { text: string; offline: boolean };

export async function askCoach(input: {
  question: string;
  history: CoachMessage[];
  profile: UserProfile;
  learner: LearnerSummary;
  /** Called with the full text so far each time more of the answer arrives. */
  onText(text: string): void;
  signal?: AbortSignal;
}): Promise<CoachReply> {
  if (coachConfigured) {
    try {
      const text = await askServer(input);
      if (text.trim()) return { text, offline: false };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // Fall through to the stored tips when the server cannot be reached.
    }
  }
  const text = offlineTip(input.question, input.profile, input.learner);
  input.onText(text);
  return { text, offline: true };
}

async function askServer({ question, history, learner, onText, signal }: Parameters<typeof askCoach>[0]): Promise<string> {
  const messages = [
    ...history.slice(-12).map((m) => ({ role: m.role === 'coach' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: question },
  ];
  const response = await streamingFetch(`${API_URL}/coach/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
    body: JSON.stringify({ messages, learner }),
    signal,
  });
  if (!response.ok) throw new Error(`Coach server replied ${response.status}`);

  // Read the answer as it streams in, so the first words show within a moment.
  const reader = response.body?.getReader();
  if (!reader) {
    const whole = await response.text();
    onText(whole);
    return whole;
  }
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

// Stored tips: used when the AI coach is not connected or cannot be reached.

const TOPICS: { words: string[]; lesson: string }[] = [
  { words: ['stance', 'stand', 'feet', 'knee', 'balance', 'posture'], lesson: 'stance' },
  { words: ['grip', 'hold the bat', 'hands on'], lesson: 'grip' },
  { words: ['backlift', 'back lift', 'lift the bat', 'pick up'], lesson: 'backlift' },
  { words: ['forward defence', 'forward defense', 'front foot defen', 'block'], lesson: 'forward-defence' },
  { words: ['drive', 'cover', 'straight drive', 'hit along'], lesson: 'front-foot-drive' },
  { words: ['pull', 'pull shot', 'hook', 'short ball to leg'], lesson: 'pull-shot' },
  { words: ['cut', 'square cut', 'late cut'], lesson: 'square-cut' },
  { words: ['sweep', 'sweep shot', 'reverse sweep'], lesson: 'sweep-shot' },
  { words: ['back foot', 'short ball', 'bouncer', 'bounce'], lesson: 'back-foot-defence' },
  { words: ['running', 'calling', 'between the wickets', 'run out', 'quick single'], lesson: 'running' },
  { words: ['line', 'length', 'leave', 'which shot', 'judge'], lesson: 'line-length' },
  { words: ['lbw', 'bowled', 'caught', 'stumped', 'get out', 'getting out', 'dismiss'], lesson: 'dismissals' },
  { words: ['off side', 'leg side', 'crease', 'pitch', 'field'], lesson: 'pitch' },
  { words: ['powerplay', 'power play', 'circle', 'set a field', 'setting a field', 'field setting', 'attacking field'], lesson: 'setting-a-field' },
  { words: ['slip', 'gully', 'point', 'mid-on', 'mid-off', 'fine leg', 'third man', 'fielding position', 'fielder'], lesson: 'fielding-positions' },
  { words: ['appeal', "how's that", 'howzat', 'umpire', 'signal', 'wide', 'no-ball', 'no ball', 'leg bye'], lesson: 'umpires-appeals' },
  { words: ['rules', 'an over', 'innings', 'score runs', 'how many'], lesson: 'match' },
];

const FAULT_IDS: Record<string, CheckId> = { feet: 'feet', knees: 'knees', lean: 'lean', shoulders: 'shoulders', head: 'head', hands: 'hands' };

export function offlineTip(question: string, profile: UserProfile, learner: LearnerSummary): string {
  const q = question.toLowerCase();
  const hand = profile.battingHand;

  // A named stance fault, e.g. "how do I fix my knees?"
  const named = Object.keys(FAULT_IDS).find((k) => q.includes(k));
  const asksFix = /fix|wrong|improve|better|practi[sc]e|work on|next|today/.test(q);
  if (named && (q.includes('stance') || asksFix)) {
    const b = BENCHMARK_BY_ID[FAULT_IDS[named]];
    return `${b.label}: ${b.aim} Stand in your stance in front of a mirror or the stance check and hold it for ten seconds, five times. Change one thing at a time.\nOPEN: demo:stance\nNEXT: What should I practise today? | How do I hold the bat? | How do I play a forward defence?`;
  }

  const topic = TOPICS.find((t) => t.words.some((w) => q.includes(w)));
  if (topic) {
    const lesson = LESSON_BY_ID[topic.lesson];
    const points = lesson.keyPoints.map((k) => `• ${sentence(personalise(k, hand))}`).join('\n');
    return `${lesson.title}:\n${points}\n\nThe lesson "${lesson.title}" has the full steps and a quiz.\nOPEN: lesson:${lesson.id}\nNEXT: What should I practise today? | How do I fix my stance? | How does a powerplay work?`;
  }

  if (asksFix || q.includes('what should')) {
    const parts: string[] = [];
    if (learner.commonFaults.length) {
      const id = FAULT_IDS[learner.commonFaults[0]];
      const b = id ? BENCHMARK_BY_ID[id] : null;
      if (b) parts.push(`In your recent stance checks the thing to fix most often was your ${b.label.toLowerCase()}. ${b.aim}`);
    } else if (learner.commonGripFaults.length) {
      parts.push(`In your recent grip checks the thing to fix most often was: ${learner.commonGripFaults[0]}. Watch the grip demonstration again on the Practise tab.`);
    } else if (learner.practiceStep) {
      parts.push(`Your next practice step is ${learner.practiceStep}. Open the Practise tab: watch it, listen to it, then try it with the camera.`);
    }
    if (learner.nextLesson) parts.push(`Your next lesson is "${learner.nextLesson}".`);
    parts.push('Ten minutes a day is better than one long session a week.');
    return `${parts.join(' ')}\nOPEN: practice\nNEXT: How do I fix my stance? | How do I hold the bat? | How do I appeal for a wicket?`;
  }

  return 'Ask about your stance, grip, backlift, a shot, fielding positions, powerplays, umpires, or what to practise next.\nNEXT: What should I practise today? | How do I hold the bat? | How does a powerplay work?';
}

/**
 * The grip photo check.
 *
 * The pose camera sees wrists, not fingers, so it cannot judge a grip. Instead the learner takes
 * (or picks) one photo of their hands on the bat, and the coach server shows it to a model that
 * can look at pictures. The photo is sent only when the learner presses the button, and the
 * server does not keep it.
 */
export async function askGripCoach(input: {
  /** A JPEG data URL. */
  image: string;
  hand: 'right' | 'left';
  question?: string;
  onText(text: string): void;
  signal?: AbortSignal;
}): Promise<CoachReply> {
  if (coachConfigured) {
    try {
      const response = await streamingFetch(`${API_URL}/coach/grip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
        body: JSON.stringify({ image: input.image, hand: input.hand, question: input.question ?? '' }),
        signal: input.signal,
      });
      if (response.ok) {
        const reader = response.body?.getReader();
        let text = '';
        if (!reader) {
          text = await response.text();
          input.onText(text);
        } else {
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            input.onText(text);
          }
        }
        if (text.trim()) return { text, offline: false };
      } else {
        const message = await response.text().catch(() => '');
        if (response.status === 413 || response.status === 400 || response.status === 501 || response.status === 429) {
          input.onText(message);
          return { text: message, offline: true };
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  const text = offlineGripCheck(input.hand);
  input.onText(text);
  return { text, offline: true };
}

/** Without the coach server: a list the learner checks against their own photo. */
export function offlineGripCheck(hand: 'right' | 'left'): string {
  const top = hand === 'right' ? 'left' : 'right';
  const bottom = hand === 'right' ? 'right' : 'left';
  return [
    'The AI coach is not connected, so check your photo yourself:',
    `- Your ${top} hand is on top, near the top of the handle.`,
    `- Your ${bottom} hand is just below it. The two hands touch or almost touch.`,
    '- The V between your thumb and first finger on each hand points down the back of the bat, between the middle and the outside edge.',
    '- Your fingers wrap round the handle. You hold it in your fingers, not deep in your palm.',
    'If all four are true, it is a good grip.',
  ].join('\n');
}
