import type { Skill } from '@/lib/pose/benchmarks';
import type { CheckResult } from '@/lib/pose/stanceAnalyzer';
import type { Hand } from '@/lib/pose/landmarks';
import type { DrillId } from '@/data/training';

export type AgeGroup = '10-13' | '14-17' | '18-25';
export type Experience = 'new' | 'some' | 'club';

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  ageGroup: AgeGroup;
  experience: Experience;
  /** The hand the learner bats with. Lessons, the 3D figure and the stance check all follow this. */
  battingHand: Hand;
  goal: string;
  /** Required for learners under 18. */
  guardianName?: string;
  guardianConsent?: boolean;
  createdAt: number;
};

export type QuizAttempt = {
  id: string;
  lessonId: string;
  score: number;
  total: number;
  passed: boolean;
  at: number;
};

export type PracticeSession = {
  id: string;
  /** Which skill was practised. */
  kind: Skill;
  /** The step of the skill that was practised, for skills taught step by step (see data/training.ts). */
  drill?: DrillId;
  /** File name of the video of this set, kept on this phone only (see services/clips.ts). */
  clip?: string;
  hand: Hand;
  /** Overall technique score, 0 to 100. For a set of repetitions, the average of the repetitions. */
  score: number;
  /** For a set of repetitions, each check averaged over the repetitions. */
  checks: CheckResult[];
  /** World landmarks of the best repetition, for the 3D replay. The photo is kept on the phone only (see services/snapshots.ts). */
  world?: number[];
  /** Good repetitions done in this set (see data/training.ts). Empty for a single saved attempt. */
  reps?: Rep[];
  /** How many repetitions the set was aiming for. */
  target?: number;
  /** Forward defence: how many times the stance check before the shot was failed in this set. */
  stanceFails?: number;
  at: number;
};

/** One good repetition: a good position held long enough, then let go. */
export type Rep = { score: number; at: number };

export type CoachMessage = {
  id: string;
  role: 'user' | 'coach';
  text: string;
  /** True when the reply came from the tips stored in the app and not from the AI coach. */
  offline?: boolean;
  at: number;
};

export type Innings = {
  id: string;
  team: string;
  runs: number;
  wickets: number;
  balls: number;
  extras: number;
  /** Ball-by-ball record, e.g. "1", "4", "W", "Wd", "Nb". */
  log: string[];
  at: number;
};

/**
 * One trial of the coach test: a coach watched the learner and said whether the position was
 * good, and the app's own verdict at the same moment was recorded. Used to measure how well the
 * app agrees with a coach (see app/(app)/coach-test).
 */
export type CoachTrial = {
  id: string;
  skill: Skill;
  hand: Hand;
  /** The coach's verdict. */
  coach: 'good' | 'not';
  /** The app's verdict at the moment the coach pressed, or 'unseen' if it could not judge. */
  app: 'good' | 'not' | 'unseen';
  score: number | null;
  /** The check the app would have named first, if any. */
  appFault: string | null;
  /** What judged the position: the trained model, or the coaching-range rules alone (older trials: not recorded). */
  judge?: 'model' | 'rules';
  /** The class the trained model predicted (e.g. "correct", "feet_too_close"), when a model judged. */
  modelLabel?: string | null;
  /** The model's probability that the position is correct, 0 to 1. */
  modelProb?: number | null;
  /** True when the app's score and voice were hidden from the coach. */
  blind: boolean;
  /** Optional name or code of the coach, for the report. */
  rater: string;
  at: number;
};

/** How a batter's innings ended (the 11 ways out, not out, retired, or did not bat). */
export type HowOut =
  | 'not-out'
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'run-out'
  | 'stumped'
  | 'hit-wicket'
  | 'hit-twice'
  | 'obstructing'
  | 'handled'
  | 'timed-out'
  | 'retired-out'
  | 'retired-not-out'
  | 'did-not-bat';
export type MatchFormat = 'short' | 'one-day' | 'long' | 'practice';
export type MatchResult = 'won' | 'lost' | 'tied' | 'drawn' | 'no-result';

/** One real match the learner played, entered by the learner after the game. */
export type MatchRecord = {
  id: string;
  /** The day of the match (midnight, local time). Lists are sorted by this. */
  at: number;
  opponent: string;
  format: MatchFormat;
  result: MatchResult | null;
  // Batting
  howOut: HowOut;
  runs: number;
  /** Balls faced, if the learner knows it. */
  balls: number | null;
  fours: number;
  sixes: number;
  // Bowling (bowled is false when the learner did not bowl)
  bowled: boolean;
  /** Legal balls bowled (4.3 overs = 27 balls). */
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  // Fielding
  catches: number;
  notes: string;
  savedAt: number;
};

export type Collections = {
  quizAttempts: QuizAttempt;
  practiceSessions: PracticeSession;
  coachTrials: CoachTrial;
  coachMessages: CoachMessage;
  scorebook: Innings;
  matches: MatchRecord;
};
export type CollectionName = keyof Collections;

export type AuthUser = { uid: string; email: string };

/**
 * Everything the app needs from a backend. There are two implementations:
 * Firebase (Authentication + Cloud Firestore) and a local one that keeps data on the phone.
 */
export interface Backend {
  mode: 'firebase' | 'local';
  onAuthChange(listener: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getProfile(uid: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  /** Saves one record under the user. The record must already have an `id` and an `at` timestamp. */
  add<K extends CollectionName>(uid: string, collection: K, record: Collections[K]): Promise<void>;
  /** Newest first. */
  list<K extends CollectionName>(uid: string, collection: K, max?: number): Promise<Collections[K][]>;
  clear(uid: string, collection: CollectionName): Promise<void>;
  /** Deletes one record. */
  remove(uid: string, collection: CollectionName, id: string): Promise<void>;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
