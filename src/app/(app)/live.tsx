import { Ionicons } from '@expo/vector-icons';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { SPEECH_RATE } from '@/lib/voice';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PoseCamera, type PoseCameraHandle, type PoseLight, type PoseStatus } from '@/components/PoseCamera';
import { Button, Seam, type IconName } from '@/components/ui';
import { personalise } from '@/data/curriculum';
import { CAMERA_PROBLEM_MESSAGE, SKILL_INFO } from '@/data/skills';
import {
  DRILL_BY_ID,
  isDrill,
  RELAX_MS,
  REP_HOLD_MS,
  spokenNumber,
  STANCE_FAILS_TO_SEND_BACK,
  STANCE_FIRST_REPS,
  STANCE_GATE_HOLD_MS,
  STANCE_GATE_TIMEOUT_MS,
  taskKey,
  type Rep,
} from '@/data/training';
import { CAMERA_SKILLS, MISSING_PART_MESSAGE, SHOT_SKILLS, type BodyPart, type Skill } from '@/lib/pose/benchmarks';
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { PoseFacing } from '@/lib/pose/poseHtml';
import { PHONE_MESSAGE, usePhoneSteadiness } from '@/lib/phoneSteady';
import { analyzePose, averageChecks, blocks, isGoodPosition, StanceSmoother, standingSide, detectView, type CameraProblem, type CameraView, type CheckResult, type PoseAnalysis } from '@/lib/pose/stanceAnalyzer';
import { saveClip } from '@/services/clips';
import { newId } from '@/services/backend';
import { saveSnapshot } from '@/services/snapshots';
import { useProfile } from '@/state/AuthContext';
import { useData } from '@/state/DataContext';
import { C, F, R, sp, statusIcon } from '@/theme';

// Timing of the live feedback. Everything here happens on the phone, with no network call.
const UI_EVERY_MS = 150; // how often the numbers on screen refresh
const CUE_SETTLE_MS = 350; // a fault must last this long before it is shown or spoken
// A held good position is not lost to a not-good blip shorter than this (field test, 19 October
// 2026: one shaky frame reset the hold bar again and again).
const HOLD_GRACE_MS = 400;
const SPEAK_GAP_MS = 2500; // shortest quiet gap after the voice has finished, before the next cue
const REPEAT_CUE_MS = 12000; // the same cue is repeated after this long
/** Shown when a position is not good and no single check says why. */
const NOT_YET_CUE: CheckResult = { id: 'feet', label: '', value: null, score: 0, status: 'fair', message: 'Not quite right yet. Watch the demonstration again and copy the position.' };
const HOLD_SCORE = 85; // a position at or above this score, with no part marked "fix this", counts as good
const SHOT_HOLD_MS = 2000; // shots: hold the finished shot this long
const LOST_MS = 700; // the body must be lost for this long before the screen says so
const PROBLEM_SETTLE_MS = 1500; // a camera problem must last this long before it is spoken
const PROBLEM_REPEAT_MS = 9000; // and is repeated after this long
// Holding the bat the other way round (as a left-hander when set up as right-handed, or the reverse).
const SIDE_EMA = 0.12; // how quickly the guess follows each frame
const WRONG_SIDE_AT = -0.6; // below this (for the learner's own hand) the bat is held the other way round
const WRONG_SIDE_MS = 3000; // for this long, with the whole body seen, before it is said
const WRONG_SIDE_REPEAT_MS = 10000;
// Light: when the picture is too dark the app turns on a light by itself (the torch on the back
// camera; the screen as a light on the front camera) and says so. If it is still too dark after a
// while, it asks for a room light.
const DARK_SETTLE_MS = 1500; // dark for this long before the light is turned on
const STILL_DARK_MS = 6000; // still dark this long after the light came on: ask for a room light
const STILL_DARK_REPEAT_MS = 20000;

type Ok = Extract<PoseAnalysis, { state: 'ok' }>;
type LiveView =
  | { kind: 'waiting' }
  | { kind: 'no-body'; missing: BodyPart | null }
  | { kind: 'wrong-angle'; problem: CameraProblem }
  | { kind: 'ok'; score: number; checks: CheckResult[]; cue: CheckResult | null; second: CheckResult | null };

/**
 * Where the learner is in one repetition.
 *   hold   grip or stance: get into position and hold it
 *   relax  grip or stance: come out of position before the next one
 *   gate   shots: a good stance first
 *   shot   shots: play the shot and hold it
 */
type Phase = 'hold' | 'relax' | 'gate' | 'shot';

/**
 * The camera practice for one skill or one step of a skill
 * (`/live?skill=stance|defence|drive&drill=def-footwork&view=front|side`).
 * It counts good repetitions towards today's plan. Each camera frame is judged on the phone and
 * the correction is shown and spoken at once.
 */
export default function Live() {
  const params = useLocalSearchParams<{ skill: string; drill?: string; view?: string; bat?: string }>();
  const valid = (CAMERA_SKILLS as string[]).includes(params.skill);
  const skill: Skill = valid ? (params.skill as Skill) : 'stance';
  // The forward defence is practised in steps; without a step, it is the whole shot.
  const drill = isDrill(params.drill) && DRILL_BY_ID[params.drill].skill === skill ? DRILL_BY_ID[params.drill] : skill === 'defence' ? DRILL_BY_ID['def-full'] : null;
  // Where the phone is: at the side, seeing the chest (the default), or in front where the bowler would be.
  const camView: CameraView = params.view === 'front' ? 'front' : 'side';
  // Practising with a bat (the default): the bat must then be seen for a stance to count.
  const withBat = params.bat !== '0';
  const skillInfo = SKILL_INFO[skill];
  const info = drill ? { ...skillInfo, name: drill.name, noun: drill.noun, relax: drill.relax, again: drill.again } : skillInfo;
  const judgeSkill: Skill = drill?.judge ?? skill;
  const only = drill?.checks;
  const profile = useProfile();
  const hand = profile.battingHand;
  const { recordSession, skills, taskToday, stanceReps } = useData();
  // Good stances saved before this set, towards opening the shots (STANCE_FIRST_REPS).
  const stanceBefore = useRef(stanceReps).current;
  const countsTowardsShots = skill === 'stance' && !drill && stanceBefore < STANCE_FIRST_REPS;
  const allowed = valid && skills[skill].unlocked;
  const isShot = drill ? drill.gate : SHOT_SKILLS.includes(skill);
  const firstPhase: Phase = isShot ? 'gate' : 'hold';

  // This set finishes today's plan for the skill (or step); once that is done, it is an extra set.
  const target = useRef(taskToday(taskKey({ skill, drill: drill?.id })).setSize).current;

  const camera = useRef<PoseCameraHandle>(null);
  const smoother = useRef(new StanceSmoother()).current;
  const [cameraKey, setCameraKey] = useState(0);
  const [facing, setFacing] = useState<PoseFacing>('front');
  const [status, setStatus] = useState<PoseStatus>('starting');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [view, setView] = useState<LiveView>({ kind: 'waiting' });
  const [hold, setHold] = useState(0);
  const [voice, setVoice] = useState(true);
  const [fps, setFps] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [phase, setPhaseState] = useState<Phase>(firstPhase);
  const [sendBack, setSendBack] = useState(false);
  const [wrongSide, setWrongSide] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [hasClip, setHasClip] = useState(false);
  const [light, setLight] = useState<PoseLight | null>(null);
  // The learner's light: switched on by the app in the dark, or with the light button.
  const [lightOn, setLightOn] = useState(false);
  const [stillDark, setStillDark] = useState(false);
  const lightRef = useRef({ darkSince: 0, onSince: 0, userOff: false, askedAt: 0 });
  // The phone must stand still: its motion sensors say when it moves or lies flat.
  const phone = usePhoneSteadiness(status === 'ready' && !replaying);
  const phoneSpoken = useRef({ at: 0, state: '' });

  // Values that change every frame live in refs so that a frame does not always cause a render.
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const live = useRef({
    lastUi: 0,
    lastBody: 0,
    lastFrame: 0,
    pendingCue: 'none',
    pendingSince: 0,
    shownCue: '', // empty until the first cue has settled
    lastSpokenCue: '',
    lastSpokenAt: 0,
    goodSince: 0,
    badSince: 0,
    problem: '',
    problemSince: 0,
    spokenProblem: '',
    highlightKey: '',
    latest: null as Ok | null,
    world: null as number[] | null,
    finished: false,
    // Repetitions
    phase: firstPhase as Phase,
    relaxSince: 0,
    gateTime: 0,
    gateFails: 0,
    reps: [] as Rep[],
    repChecks: [] as CheckResult[][],
    best: null as { score: number; world: number[] | null; image: string | null } | null,
    // Which way round the bat is held (see standingSide), smoothed over frames.
    side: 0,
    wrongSince: 0,
    rightSince: 0,
    wrongSide: false,
    wrongSpokenAt: 0,
    recording: false,
    replaying: false,
  }).current;

  // Field test (24 October 2026): the voice was too fast, and a new tip cut the last one off half
  // way. Now the voice is slower (see voice.ts), a tip never interrupts another tip, and the gap
  // before the next tip is counted from when the voice finished, not when it started.
  // Counts ("One", "Two") and the start and stop messages are urgent and still interrupt.
  const speaking = useRef(false);
  const say = useCallback((text: string, urgent = false) => {
    if (!voiceRef.current) return;
    if (speaking.current && !urgent) return;
    Speech.stop();
    speaking.current = true;
    const done = () => {
      speaking.current = false;
      live.lastSpokenAt = Date.now();
    };
    Speech.speak(text, { language: 'en', rate: SPEECH_RATE, onDone: done, onStopped: () => { speaking.current = false; }, onError: done });
  }, []);

  // Keep the screen on while the camera is in use, and stop any speech on the way out.
  useEffect(() => {
    activateKeepAwakeAsync('practice').catch(() => {});
    return () => {
      deactivateKeepAwake('practice').catch(() => {});
      void Speech.stop();
    };
  }, []);

  // A video of each repetition: recording starts when the learner gets ready and stops when it counts.
  const startRecording = useCallback(() => {
    live.recording = true;
    camera.current?.send({ rec: 'start' });
  }, [live]);

  const setPhase = useCallback(
    (next: Phase, now: number) => {
      if ((next === 'hold' || next === 'gate') && !live.recording) startRecording();
      live.phase = next;
      live.goodSince = 0;
      live.relaxSince = 0;
      live.gateTime = 0;
      live.shownCue = '';
      live.pendingCue = 'none';
      live.pendingSince = now;
      smoother.reset();
      setPhaseState(next);
      setHold(0);
    },
    [live, smoother, startRecording],
  );

  /** Saves the set (or a single attempt when no repetition was finished) and opens the result. */
  const finish = useCallback(
    async (then?: string) => {
      if (live.finished) return;
      const reps = live.reps;
      if (!reps.length && !live.latest) return;
      live.finished = true;
      setSaving(true);
      // The photo of the best repetition; for a single attempt, a picture of this moment.
      let image = live.best?.image ?? null;
      if (!image) image = (await camera.current?.snapshot().catch(() => null)) ?? null;
      // The video of the best repetition, kept on this phone.
      let clip: string | null = null;
      if (reps.length) {
        const data = (await camera.current?.clip('best').catch(() => null)) ?? null;
        if (data) clip = await saveClip(newId(), data);
      }
      camera.current?.send({ paused: true, rec: 'stop', keep: null, replay: null });
      const single = live.latest!;
      const session = recordSession({
        kind: skill,
        ...(drill ? { drill: drill.id } : {}),
        ...(clip ? { clip } : {}),
        hand,
        score: reps.length ? Math.round(reps.reduce((t, r) => t + r.score, 0) / reps.length) : single.score,
        checks: reps.length ? averageChecks(judgeSkill, live.repChecks, hand, only) : single.checks,
        world: (live.best?.world ?? live.world) ?? undefined,
        reps,
        target,
        ...(isShot ? { stanceFails: live.gateFails } : {}),
      });
      if (image) await saveSnapshot(session.id, image);
      router.replace(then ?? `/session/${session.id}?done=1`);
    },
    [drill, hand, isShot, judgeSkill, live, only, recordSession, skill, target],
  );

  /** A good repetition has been held long enough. */
  const completeRep = useCallback(
    (analysis: Ok, now: number) => {
      live.reps.push({ score: analysis.score, at: now });
      live.repChecks.push(analysis.checks);
      const n = live.reps.length;
      setRepCount(n);
      // Keep the video of this repetition: always as the last one, and as the best one if it is.
      const isBest = !live.best || analysis.score >= live.best.score;
      if (live.recording) {
        live.recording = false;
        camera.current?.send({ rec: 'stop', keep: isBest ? ['last', 'best'] : ['last'] });
      }
      // Keep a photo of the best repetition for the result screen.
      if (isBest) {
        const best = { score: analysis.score, world: live.world, image: null as string | null };
        live.best = best;
        void camera.current?.snapshot().then((image) => {
          if (image && live.best === best) best.image = image;
        });
      }
      live.lastSpokenAt = now;
      live.lastSpokenCue = '';
      if (n >= target) {
        say(spokenNumber(n), true);
        // Give the photo a moment to arrive. The result screen says well done.
        setTimeout(() => void finish(), 700);
        live.phase = 'relax';
        setPhaseState('relax');
        return;
      }
      // The fiftieth good stance opens the shots: say so straight away.
      if (countsTowardsShots && stanceBefore + n === STANCE_FIRST_REPS) {
        say(`${spokenNumber(n)}. That is ${STANCE_FIRST_REPS} good stances. Well done! All the shots are open now. ${info.relax}`, true);
      } else {
        say(`${spokenNumber(n)}. ${info.relax}`, true);
      }
      setPhase(isShot ? 'gate' : 'relax', now);
    },
    [finish, info.relax, isShot, live, say, setPhase, target, countsTowardsShots, stanceBefore],
  );

  // The camera cannot judge the learner yet: a part of the body is out of view, or the phone
  // is in the wrong place. Shown after a short wait so one bad frame does not flash a message.
  const blocked = useCallback(
    (now: number, key: string, next: LiveView, spoken: string | null) => {
      live.goodSince = 0;
      if (key !== live.problem) {
        live.problem = key;
        live.problemSince = now;
      }
      // Walking out of the picture between repetitions counts as relaxing.
      if (live.phase === 'relax' && live.reps.length < target && now - live.lastBody > RELAX_MS) {
        setPhase('hold', now);
      }
      if (now - live.lastBody <= LOST_MS) return;
      // Without a whole body there is no verdict on which way round the bat is held.
      live.side = 0;
      live.wrongSince = 0;
      live.rightSince = 0;
      if (live.wrongSide) {
        live.wrongSide = false;
        setWrongSide(false);
      }
      smoother.reset();
      live.latest = null;
      live.shownCue = '';
      live.pendingCue = 'none';
      setView((v) => (JSON.stringify(v) === JSON.stringify(next) ? v : next));
      setHold(0);
      if (live.highlightKey !== '') {
        live.highlightKey = '';
        camera.current?.send({ highlights: [], tone: 'idle' });
      }
      if (!spoken || now - live.problemSince < PROBLEM_SETTLE_MS) return;
      const sinceSpoken = speaking.current ? -1 : now - live.lastSpokenAt; // never over the voice
      const changed = key !== live.spokenProblem;
      if ((changed && sinceSpoken >= SPEAK_GAP_MS) || (!changed && sinceSpoken >= PROBLEM_REPEAT_MS)) {
        live.spokenProblem = key;
        live.lastSpokenCue = '';
        live.lastSpokenAt = now;
        say(spoken);
      }
    },
    [live, say, setPhase, smoother, target],
  );

  const onFrame = useCallback(
    (frame: PoseFrame) => {
      if (live.finished) return;
      const now = Date.now();
      const step = live.lastFrame ? Math.min(now - live.lastFrame, 250) : 0;
      live.lastFrame = now;
      // A moving phone moves the whole picture: nothing is judged or counted until it is still.
      const phoneState = phone.ref.current;
      if (phoneState !== 'steady') {
        live.goodSince = 0;
        setHold(0);
        smoother.reset();
        const ps = phoneSpoken.current;
        if ((ps.state !== phoneState || now - ps.at >= PROBLEM_REPEAT_MS) && !speaking.current) {
          ps.state = phoneState;
          ps.at = now;
          live.lastSpokenAt = now;
          say(PHONE_MESSAGE[phoneState].say, true);
        }
        return;
      }
      phoneSpoken.current.state = '';
      // Before each shot the stance is checked with the stance benchmarks.
      const gate = live.phase === 'gate';
      const judge: Skill = gate ? 'stance' : judgeSkill;
      const analysis = analyzePose(judge, frame, hand, smoother, { view: camView, only: gate ? undefined : only, requireBat: withBat });

      if (analysis.state === 'no-body') {
        const message = analysis.missing ? MISSING_PART_MESSAGE[analysis.missing] : null;
        blocked(now, `missing:${analysis.missing}`, { kind: 'no-body', missing: analysis.missing }, message);
        return;
      }
      if (analysis.state === 'wrong-angle') {
        blocked(now, `angle:${analysis.problem}`, { kind: 'wrong-angle', problem: analysis.problem }, CAMERA_PROBLEM_MESSAGE[analysis.problem].say);
        return;
      }

      live.lastBody = now;
      live.problem = '';
      live.spokenProblem = '';
      live.latest = analysis;
      live.world = frame.world;

      // 0. Is the bat held the other way round? Beginners often stand as a left-hander when they
      // bat right-handed, or the reverse. Not checked while relaxing.
      if (live.phase !== 'relax') {
        const vote = standingSide(frame.world, frame.lm, detectView(frame.world)) * (hand === 'right' ? 1 : -1);
        live.side += SIDE_EMA * (vote - live.side);
        if (live.side < WRONG_SIDE_AT) {
          live.rightSince = 0;
          if (!live.wrongSince) live.wrongSince = now;
          if (!live.wrongSide && now - live.wrongSince >= WRONG_SIDE_MS) {
            live.wrongSide = true;
            setWrongSide(true);
          }
        } else if (live.side > 0) {
          live.wrongSince = 0;
          if (!live.rightSince) live.rightSince = now;
          if (live.wrongSide && now - live.rightSince >= 1200) {
            live.wrongSide = false;
            setWrongSide(false);
            live.lastSpokenAt = now;
            say('That is better. Now you are holding the bat the right way.', true);
          }
        }
        if (live.wrongSide) {
          // Nothing counts until the bat is held the right way round.
          live.goodSince = 0;
          setHold(0);
          if (now - live.wrongSpokenAt >= WRONG_SIDE_REPEAT_MS && !speaking.current && now - live.lastSpokenAt >= SPEAK_GAP_MS) {
            live.wrongSpokenAt = now;
            live.lastSpokenAt = now;
            say(wrongSideSpeech(hand), true);
          }
          return;
        }
      }

      // 1. Skeleton: mark the joints to fix. Sent only when they change.
      const resting = live.phase === 'relax';
      const highlights = resting ? [] : analysis.highlights;
      const key = highlights.join(',') + (analysis.cues.length || resting ? '' : 'g');
      if (key !== live.highlightKey) {
        live.highlightKey = key;
        camera.current?.send({ highlights, tone: analysis.cues.length || resting ? 'idle' : 'good' });
      }

      // 2. Between repetitions: wait for the learner to come out of position.
      if (live.phase === 'relax') {
        if (live.reps.length >= target) return;
        if (!isGoodPosition(analysis)) {
          if (!live.relaxSince) live.relaxSince = now;
          if (now - live.relaxSince >= RELAX_MS) {
            setPhase('hold', now);
            live.lastSpokenAt = now;
            say(info.again);
          }
        } else {
          live.relaxSince = 0;
        }
        if (now - live.lastUi >= UI_EVERY_MS) {
          live.lastUi = now;
          setView({ kind: 'ok', score: analysis.score, checks: analysis.checks, cue: null, second: null });
        }
        return;
      }

      // 3. Cue: the worst fault, once it has lasted long enough to be real.
      const top = analysis.cues[0]?.id ?? 'none';
      if (top !== live.pendingCue) {
        live.pendingCue = top;
        live.pendingSince = now;
      }
      if (now - live.pendingSince >= CUE_SETTLE_MS) live.shownCue = top;

      // 4. Voice: speak a new cue, or repeat an old one after a while.
      const cue = analysis.cues.find((c) => c.id === live.shownCue) ?? null;
      if (live.shownCue !== '') {
        const sinceSpoken = speaking.current ? -1 : now - live.lastSpokenAt; // never over the voice
        const changed = live.shownCue !== live.lastSpokenCue;
        const allGood = live.shownCue === 'none' && analysis.cues.length === 0;
        if ((changed && sinceSpoken >= SPEAK_GAP_MS && (cue || allGood)) || (!changed && cue && sinceSpoken >= REPEAT_CUE_MS)) {
          live.lastSpokenCue = live.shownCue;
          live.lastSpokenAt = now;
          say(cue?.message ?? (live.phase === 'gate' ? 'Good stance. Hold it.' : 'Good. Hold it there.'));
        }
      }

      // 5. Hold a good position: in the stance check it opens the shot, otherwise it counts one.
      const holdFor = live.phase === 'gate' ? STANCE_GATE_HOLD_MS : live.phase === 'shot' ? SHOT_HOLD_MS : REP_HOLD_MS;
      let progress = 0;
      const nothingPoor = !analysis.cues.some(blocks);
      if (analysis.score >= HOLD_SCORE && nothingPoor) {
        live.badSince = 0;
        if (!live.goodSince) live.goodSince = now;
        progress = Math.min(1, (now - live.goodSince) / holdFor);
        if (progress >= 1) {
          if (live.phase === 'gate') {
            setPhase('shot', now);
            live.lastSpokenAt = now;
            say(info.again);
          } else {
            completeRep(analysis, now);
          }
          return;
        }
      } else if (live.goodSince && (live.badSince === 0 || now - live.badSince < HOLD_GRACE_MS)) {
        // A short blip: keep the hold (the bar stops for a moment) unless it lasts.
        if (!live.badSince) live.badSince = now;
        progress = Math.min(1, (live.badSince - live.goodSince) / holdFor);
      } else {
        live.goodSince = 0;
        live.badSince = 0;
      }

      // 6. Shots: a stance that does not come right in time is a failed stance check.
      if (live.phase === 'gate') {
        live.gateTime += step;
        if (live.gateTime >= STANCE_GATE_TIMEOUT_MS) {
          live.gateTime = 0;
          live.gateFails += 1;
          live.lastSpokenAt = now;
          if (live.gateFails >= STANCE_FAILS_TO_SEND_BACK) {
            setSendBack(true);
            say(`Your stance needs more work. Go back to stance practice, then try the ${info.noun} again.`, true);
          } else {
            say('Your stance is not right yet. Listen to the tips and take your stance again.', true);
          }
        }
      }

      // 7. Screen: refresh a few times a second.
      if (now - live.lastUi >= UI_EVERY_MS) {
        live.lastUi = now;
        // "Good. Hold it." is shown only for a position that really is good. While a new fault is
        // still settling, or when the position is not good for a reason no single check explains
        // (field test, 18 October 2026: "Good stance. Hold it." beside a score of 15), the current
        // worst fault, or a general message, is shown instead.
        const notGood = analysis.score < HOLD_SCORE || analysis.cues.some(blocks);
        const shown = cue ?? (notGood ? analysis.cues[0] ?? NOT_YET_CUE : null);
        const second = analysis.cues.find((c) => c.id !== shown?.id) ?? null;
        setView({ kind: 'ok', score: analysis.score, checks: analysis.checks, cue: shown, second: shown ? second : null });
        setHold(progress);
      }
    },
    [blocked, completeRep, hand, info, judgeSkill, live, only, say, setPhase, smoother, target, camView, withBat],
  );

  // Nobody in the picture at all.
  const onNoPose = useCallback(() => {
    if (live.finished) return;
    blocked(Date.now(), 'nobody', { kind: 'no-body', missing: null }, null);
  }, [blocked, live]);

  const onStatus = useCallback((s: PoseStatus, message: string | null) => {
    setStatus(s);
    setStatusMessage(message);
  }, []);

  const retry = () => {
    setStatus('starting');
    setStatusMessage(null);
    setView({ kind: 'waiting' });
    setCameraKey((k) => k + 1);
  };

  const failed = status === 'camera-denied' || status === 'camera-missing' || status === 'camera-busy' || status === 'model-failed';
  const ready = status === 'ready';

  // Say where to stand once the camera is running.
  const greeted = useRef(false);
  useEffect(() => {
    if (!ready || greeted.current) return;
    greeted.current = true;
    camera.current?.send({ hand, view: camView, stumps: 'off' });
    if (!live.recording) startRecording();
    live.lastSpokenAt = Date.now();
    const where = camView === 'front' ? 'The phone is the bowler. Stand side-on, with your front shoulder pointing at the phone, and your whole body in the picture' : info.waiting;
    say(`${where}. Look at the bowler, not at the phone, and listen to me. Let's do ${spokenNumber(target).toLowerCase()}.`, true);
  }, [ready, info, live, say, target, hand, camView, startRecording]);

  // The learner can move the phone during practice: to the side, or in front (the bowler's view).
  const switchView = () => {
    const next: CameraView = camView === 'front' ? 'side' : 'front';
    router.setParams({ view: next });
  };
  const shownView = useRef(camView);
  useEffect(() => {
    if (shownView.current === camView) return;
    shownView.current = camView;
    camera.current?.send({ view: camView });
    smoother.reset();
    live.goodSince = 0;
    live.side = 0;
    live.wrongSince = 0;
    live.rightSince = 0;
    setHold(0);
    live.lastSpokenAt = Date.now();
    say(
      camView === 'front'
        ? 'Now the phone is the bowler. Put it 3 to 4 metres in front of you, and stand side-on with your front shoulder pointing at it.'
        : `Now the phone is at your side. ${personalise(info.waiting, hand)}.`,
      true,
    );
  }, [camView, hand, info, live, say, smoother]);

  const showReplay = (on: boolean) => {
    live.replaying = on;
    setReplaying(on);
    void Speech.stop();
    if (on) {
      // Do not record the replay itself.
      live.recording = false;
      camera.current?.send({ rec: 'stop', keep: null, replay: 'last' });
    } else {
      camera.current?.send({ replay: null });
      live.relaxSince = 0;
      live.lastFrame = 0;
      live.goodSince = 0;
      live.gateTime = 0;
      if (live.phase !== 'relax') startRecording();
    }
  };
  const onClip = useCallback((slots: string[]) => {
    if (slots.includes('last')) setHasClip(true);
  }, []);

  // ---- Light
  // The front camera faces the learner with the screen, so the screen itself is the light: it goes
  // to full brightness with a white frame round the picture. The back camera uses its torch.
  const torchUsable = facing === 'back' && light?.torch !== 'none' && light !== null;
  const screenLight = lightOn && facing === 'front';
  const onLight = useCallback(
    (l: PoseLight) => {
      setLight((prev) => (prev && prev.dark === l.dark && prev.torch === l.torch && prev.boosted === l.boosted && Math.abs(prev.level - l.level) < 4 ? prev : l));
      const s = lightRef.current;
      const now = Date.now();
      if (!l.dark) {
        s.darkSince = 0;
        setStillDark(false);
        return;
      }
      if (!s.darkSince) s.darkSince = now;
      // Turn the light on by itself, unless the learner turned it off.
      if (!lightOn && !s.userOff && now - s.darkSince >= DARK_SETTLE_MS) {
        s.onSince = now;
        setLightOn(true);
        const canLight = facing === 'front' || l.torch !== 'none';
        live.lastSpokenAt = now;
        say(
          !canLight
            ? 'It is too dark here, and this camera has no light. Please turn on a room light.'
            : facing === 'front'
              ? 'It is dark here, so I have turned on the screen light.'
              : 'It is dark here, so I have turned on the torch.',
        );
        return;
      }
      // Still too dark with the light on.
      if (lightOn && s.onSince && now - s.onSince >= STILL_DARK_MS) {
        setStillDark(true);
        if (now - s.askedAt >= STILL_DARK_REPEAT_MS && !speaking.current && now - live.lastSpokenAt >= SPEAK_GAP_MS) {
          s.askedAt = now;
          live.lastSpokenAt = now;
          say(
            facing === 'front'
              ? 'It is still too dark for me to see you well. Turn on a room light, or switch to the back camera and its torch.'
              : 'It is still too dark for me to see you well. Please turn on a room light.',
          );
        }
      }
    },
    [facing, lightOn, live, say],
  );
  const toggleLight = () => {
    const next = !lightOn;
    lightRef.current.userOff = !next;
    lightRef.current.onSince = next ? Date.now() : 0;
    setLightOn(next);
    if (!next) setStillDark(false);
  };
  // The torch follows the light on the back camera.
  useEffect(() => {
    camera.current?.send({ torch: lightOn && facing === 'back' });
    if (lightOn) lightRef.current.onSince = Date.now();
  }, [lightOn, facing, status]);
  // Full screen brightness while the screen is the light; the old brightness comes back after.
  useEffect(() => {
    if (!screenLight) return;
    let before: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        before = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness cannot be changed on this device; the white frame still helps.
      }
    })();
    return () => {
      cancelled = true;
      if (before !== null) Brightness.setBrightnessAsync(before).catch(() => {});
    };
  }, [screenLight]);

  if (!allowed) return <Redirect href="/practice" />;
  // The demonstration (and the coaching video, where there is one) comes before practice.
  if (!skills[skill].watched) return <Redirect href={`/demo/${skill}`} />;
  const setupHref = `/setup?skill=${skill}${drill && skill === 'defence' ? `&drill=${drill.id}` : ''}`;

  const close = () => {
    // Repetitions already done are kept.
    if (live.reps.length) void finish();
    else if (router.canGoBack()) router.back();
    else router.replace('/practice');
  };

  const goToStance = () => {
    void Speech.stop();
    if (live.reps.length) void finish('/setup?skill=stance');
    else router.replace('/setup?skill=stance');
  };

  const waiting =
    light?.dark && view.kind === 'no-body'
      ? { icon: 'moon' as IconName, title: 'It is too dark for the camera to see you', detail: facing === 'front' ? 'The screen is now your light. Turn on a room light too, or face a window or lamp.' : 'Turn on a room light, or face a window or lamp.' }
      : view.kind === 'wrong-angle'
      ? { icon: 'sync' as IconName, title: CAMERA_PROBLEM_MESSAGE[view.problem].title, detail: personalise(CAMERA_PROBLEM_MESSAGE[view.problem].detail, hand) }
      : view.kind === 'no-body' && view.missing
        ? { icon: 'scan' as IconName, title: MISSING_PART_MESSAGE[view.missing], detail: info.waitingDetail }
        : camView === 'front'
          ? { icon: 'scan' as IconName, title: 'Stand side-on, front shoulder to the phone', detail: 'The phone is the bowler: about 3 to 4 metres in front of you, with your whole body in the picture.' }
          : { icon: 'scan' as IconName, title: personalise(info.waiting, hand), detail: info.waitingDetail };

  const stageLabel = phase === 'gate' ? 'Quick check: your stance' : phase === 'shot' ? info.name.replace(/^Step \d: /, '') : null;
  const canSave = repCount > 0 || phase !== 'gate';

  return (
    <View style={styles.root}>
      <PoseCamera key={cameraKey} ref={camera} facing={facing} onFrame={onFrame} onNoPose={onNoPose} onStatus={onStatus} onFps={setFps} onClip={onClip} onLight={onLight} />
      {/* The screen as a light for the front camera: a bright white frame round the picture. */}
      {screenLight ? <View style={styles.screenLight} pointerEvents="none" /> : null}

      <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none" edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.top} pointerEvents="box-none">
          <RoundButton icon="close" label={repCount ? 'Finish and save' : 'Close'} onPress={close} />
          <View style={styles.name} pointerEvents="none">
            <Text style={styles.nameText} numberOfLines={1}>
              {info.name}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <RoundButton icon="help" label="How to set up the phone" onPress={() => router.replace(setupHref)} />
          <RoundButton
            icon={lightOn ? 'flashlight' : 'flashlight-outline'}
            label={lightOn ? 'Turn the light off' : facing === 'front' ? 'Use the screen as a light' : 'Turn on the torch'}
            onPress={toggleLight}
            active={lightOn}
          />
          <RoundButton icon={voice ? 'volume-high' : 'volume-mute'} label={voice ? 'Turn voice off' : 'Turn voice on'} onPress={() => setVoice((v) => !v)} />
          <RoundButton icon="camera-reverse" label="Switch camera" onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} />
        </View>

        {/* Repetitions in this set */}
        <View style={styles.reps} pointerEvents="none" accessibilityLabel={`${repCount} of ${target} done`}>
          <Text style={styles.repText}>
            {repCount} <Text style={styles.repOf}>of {target}</Text>
          </Text>
          {target <= 20 ? (
            <View style={styles.dots}>
              {Array.from({ length: target }, (_, i) => (
                <View key={i} style={[styles.dot, i < repCount && styles.dotDone]} />
              ))}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Seam value={repCount / target} total={20} color="#5BE49B" track="rgba(255,255,255,0.25)" />
            </View>
          )}
        </View>

        {/* Progress towards opening the shots. */}
        {countsTowardsShots ? (
          <View style={styles.unlock} pointerEvents="none">
            <Ionicons name={stanceBefore + repCount >= STANCE_FIRST_REPS ? 'lock-open' : 'lock-closed'} size={15} color="#FFE08A" />
            <Text style={styles.unlockText}>
              {stanceBefore + repCount >= STANCE_FIRST_REPS
                ? 'All the shots are open now'
                : `Shots open at ${STANCE_FIRST_REPS} good stances: ${stanceBefore + repCount} done, ${STANCE_FIRST_REPS - stanceBefore - repCount} to go`}
            </Text>
          </View>
        ) : null}

        {/* Where the phone is. Tap to change it during practice. */}
        {ready && !replaying ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`The phone is ${camView === 'front' ? 'in front of you, as the bowler' : 'at your side'}. Change the view`}
            onPress={switchView}
            style={({ pressed }) => [styles.viewPill, pressed && { opacity: 0.7 }]}>
            <Ionicons name={camView === 'front' ? 'person' : 'person-outline'} size={16} color="#FFFFFF" />
            <Text style={styles.viewText}>{camView === 'front' ? 'Phone in front (bowler)' : 'Phone at the side'}</Text>
            <Ionicons name="swap-horizontal" size={16} color="#5BE49B" />
            <Text style={[styles.viewText, { color: '#5BE49B' }]}>Change</Text>
          </Pressable>
        ) : null}

        {/* The phone is moving or lying flat. */}
        {ready && !replaying && phone.state !== 'steady' ? (
          <View style={styles.phoneNote} accessibilityLiveRegion="assertive">
            <Ionicons name={phone.state === 'flat' ? 'phone-portrait-outline' : 'pulse'} size={22} color="#FFC864" />
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Text style={styles.phoneTitle}>{PHONE_MESSAGE[phone.state].title}</Text>
              <Text style={styles.phoneDetail}>{PHONE_MESSAGE[phone.state].detail}</Text>
            </View>
          </View>
        ) : null}

        {/* Light: a short note while the picture is too dark. */}
        {ready && light?.dark ? (
          <View style={styles.darkNote} accessibilityLiveRegion="polite">
            <Ionicons name={lightOn ? 'flashlight' : 'moon'} size={18} color="#FFE08A" />
            <Text style={styles.darkText}>
              {!lightOn
                ? 'Too dark. Tap the light button, or turn on a room light.'
                : stillDark
                  ? facing === 'front'
                    ? 'Still too dark. Turn on a room light, or use the back camera with its torch.'
                    : 'Still too dark. Please turn on a room light.'
                  : facing === 'front'
                    ? 'Dark here: the screen is your light.'
                    : torchUsable
                      ? 'Dark here: the torch is on.'
                      : 'Too dark, and this camera has no torch. Turn on a room light.'}
            </Text>
          </View>
        ) : null}

        {/* Score and the checks */}
        {ready && view.kind === 'ok' && phase !== 'relax' ? (
          <View style={styles.scoreRow} pointerEvents="none">
            <View style={styles.scoreBox}>
              <Text style={styles.score}>{view.score}</Text>
              <Text style={styles.scoreLabel}>out of 100</Text>
            </View>
            <View style={styles.chips}>
              {view.checks.map((c) => (
                <View key={c.id} style={styles.chip} accessibilityLabel={`${c.label}: ${c.status}`}>
                  <Ionicons
                    name={c.value === null ? 'eye-off' : c.advisory && c.status !== 'good' ? 'information-circle' : statusIcon[c.status]}
                    size={15}
                    color={c.value === null ? (c.required ? statusTint.poor : '#FFFFFF') : c.advisory && c.status !== 'good' ? '#9FD3FF' : statusTint[c.status]}
                  />
                  <Text style={styles.chipText}>{c.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ flex: 1 }} pointerEvents="none" />

        {/* Bottom panel */}
        <View style={[styles.panel, status === 'permission' && { display: 'none' }]}>
          {status === 'starting' ? (
            <View style={styles.centre}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.cue}>Getting the camera ready</Text>
              <Text style={styles.sub}>The first time, the pose model is downloaded. This needs the internet.</Text>
            </View>
          ) : null}

          {failed ? (
            <View style={styles.centre}>
              <Ionicons name="alert-circle" size={30} color="#FFB4B6" />
              <Text style={styles.cue}>{statusMessage ?? 'The camera could not start.'}</Text>
              <Button title="Try again" icon="refresh" kind="secondary" onPress={retry} style={{ alignSelf: 'stretch' }} />
            </View>
          ) : null}

          {ready && replaying ? (
            <View style={{ gap: sp(3) }}>
              <View style={styles.cueRow}>
                <Ionicons name="play-circle" size={28} color="#9FD3FF" />
                <Text style={styles.cue}>Your last {info.noun}</Text>
              </View>
              <Text style={styles.sub}>Watch your feet, knees, head and bat. Then go back and do the next one.</Text>
              <Button title="Back to practice" icon="camera" onPress={() => showReplay(false)} />
            </View>
          ) : null}

          {ready && !replaying && wrongSide && !sendBack ? (
            <View style={{ gap: sp(2) }}>
              <View style={styles.cueRow}>
                <Ionicons name="swap-horizontal" size={30} color="#FFC864" />
                <Text style={styles.cue}>You are holding the bat the other way round</Text>
              </View>
              <Text style={styles.sub}>{wrongSideText(hand)}</Text>
              <Button title="I bat the other way: change it" kind="secondary" icon="person" onPress={() => router.push('/profile')} />
            </View>
          ) : null}

          {ready && !replaying && sendBack ? (
            <View style={{ gap: sp(3) }}>
              <View style={styles.cueRow}>
                <Ionicons name="arrow-undo-circle" size={30} color="#FFC864" />
                <Text style={styles.cue}>Your stance needs more work</Text>
              </View>
              <Text style={styles.sub}>Every {info.noun} starts from a good stance. Practise the stance first, then come back.</Text>
              <Button title="Practise the stance" icon="body" onPress={goToStance} />
              <Button
                title="Keep trying"
                kind="secondary"
                onPress={() => {
                  setSendBack(false);
                  live.gateTime = 0;
                }}
              />
            </View>
          ) : null}

          {ready && !replaying && !wrongSide && !sendBack && view.kind !== 'ok' ? (
            <View style={styles.centre}>
              <Ionicons name={waiting.icon} size={30} color={view.kind === 'wrong-angle' ? '#FFC864' : '#FFFFFF'} />
              <Text style={[styles.cue, { textAlign: 'center' }]}>{waiting.title}</Text>
              <Text style={[styles.sub, { textAlign: 'center' }]}>{waiting.detail}</Text>
            </View>
          ) : null}

          {ready && !replaying && !wrongSide && !sendBack && view.kind === 'ok' ? (
            <View style={{ gap: sp(3) }}>
              {phase === 'relax' ? (
                <View style={styles.cueRow}>
                  <Ionicons name="pause-circle" size={28} color="#9FD3FF" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.cue}>{repCount >= target ? 'All done. Saving.' : info.relax}</Text>
                    {repCount < target ? <Text style={styles.sub}>Then take your {isShot ? 'stance' : info.noun} again.</Text> : null}
                  </View>
                </View>
              ) : null}
              {phase === 'relax' ? null : view.cue ? (
                <View style={{ gap: sp(1.5) }}>
                  {stageLabel ? <Text style={styles.stage}>{stageLabel}</Text> : null}
                  <View style={styles.cueRow}>
                    <Ionicons
                      name={view.cue.advisory ? 'information-circle' : statusIcon[view.cue.status]}
                      size={28}
                      color={view.cue.advisory ? '#9FD3FF' : statusTint[view.cue.status]}
                    />
                    <Text style={styles.cue}>{view.cue.advisory ? `Tip: ${view.cue.message}` : view.cue.message}</Text>
                  </View>
                  {view.second ? <Text style={styles.sub}>Then: {view.second.message}</Text> : null}
                </View>
              ) : (
                <View style={{ gap: sp(1.5) }}>
                  {stageLabel ? <Text style={styles.stage}>{stageLabel}</Text> : null}
                  <View style={styles.cueRow}>
                    <Ionicons name="checkmark-circle" size={28} color="#5BE49B" />
                    <Text style={styles.cue}>{phase === 'gate' ? 'Good stance. Hold it.' : `Good ${info.noun}. Hold it there.`}</Text>
                  </View>
                </View>
              )}
              {hold > 0 && phase !== 'relax' ? <Seam value={hold} total={20} color="#5BE49B" track="rgba(255,255,255,0.25)" /> : null}
              {hasClip && repCount > 0 && repCount < target && (phase === 'relax' || (phase === 'gate' && hold === 0)) ? (
                <Button title="Watch the last one again" icon="play" kind="secondary" onPress={() => showReplay(true)} />
              ) : null}
              {canSave ? (
                <Button title={repCount ? `Finish for now (${repCount} done)` : 'Save this attempt'} kind="secondary" loading={saving} onPress={() => void finish()} />
              ) : null}
            </View>
          ) : null}
        </View>

        {fps !== null && ready ? <Text style={styles.fps}>{fps} frames per second</Text> : null}
      </SafeAreaView>
    </View>
  );
}

/** Said when the learner holds the bat the other way round from their batting hand. */
function wrongSideSpeech(hand: 'right' | 'left'): string {
  const top = hand === 'right' ? 'left' : 'right';
  return `Stop. You are holding the bat the other way round. You bat ${hand}-handed, so your ${top} hand goes on top, and your ${top} shoulder points at the bowler. Turn round and take your stance again.`;
}
function wrongSideText(hand: 'right' | 'left'): string {
  const top = hand === 'right' ? 'left' : 'right';
  return `You set up as a ${hand}-handed batter, but you are standing like a ${hand === 'right' ? 'left' : 'right'}-hander. Put your ${top} hand on top of the handle and point your ${top} shoulder at the bowler. Practising the wrong way builds the wrong habit, so nothing is counted until you turn round.`;
}

// Lighter tints of the status colours, readable on the dark camera view.
const statusTint = { good: '#5BE49B', fair: '#FFC864', poor: '#FF8A8D' } as const;

function RoundButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.round, active && styles.roundActive, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={24} color={active ? '#0A1612' : '#FFFFFF'} />
    </Pressable>
  );
}

const glass = 'rgba(10,22,18,0.78)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.night },
  top: { flexDirection: 'row', gap: sp(2), paddingHorizontal: sp(4), paddingTop: sp(2) },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: glass, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: '#FFE08A' },
  screenLight: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 34, borderColor: '#FFFFFF', borderRadius: 4 },
  unlock: { flexDirection: 'row', alignItems: 'center', gap: sp(1.5), marginHorizontal: sp(4), marginTop: sp(2), alignSelf: 'flex-start', backgroundColor: glass, borderRadius: R.pill, paddingHorizontal: sp(3), paddingVertical: sp(1.5) },
  unlockText: { color: '#FFE08A', fontSize: 13, fontWeight: '600' },
  viewPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: sp(1.5), marginHorizontal: sp(4), marginTop: sp(2), backgroundColor: glass, borderRadius: R.pill, paddingHorizontal: sp(3), paddingVertical: sp(2) },
  viewText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  phoneNote: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5), marginHorizontal: sp(4), marginTop: sp(2), backgroundColor: 'rgba(60,40,0,0.82)', borderRadius: R.lg, paddingHorizontal: sp(3.5), paddingVertical: sp(3) },
  phoneTitle: { color: '#FFC864', fontSize: 16, fontWeight: '700' },
  phoneDetail: { color: '#FFFFFF', fontSize: 14, lineHeight: 19 },
  darkNote: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginHorizontal: sp(4), marginTop: sp(2), backgroundColor: glass, borderRadius: R.pill, paddingHorizontal: sp(3), paddingVertical: sp(2) },
  darkText: { flexShrink: 1, color: '#FFE08A', fontSize: 14, fontWeight: '600' },
  name: { height: 44, borderRadius: 22, backgroundColor: glass, paddingHorizontal: sp(4), justifyContent: 'center', flexShrink: 1 },
  nameText: { color: '#FFFFFF', fontFamily: F.display, fontSize: 20 },
  reps: { flexDirection: 'row', alignItems: 'center', gap: sp(3), marginHorizontal: sp(4), marginTop: sp(3), backgroundColor: glass, borderRadius: R.lg, paddingHorizontal: sp(4), paddingVertical: sp(2) },
  repText: { color: '#FFFFFF', fontFamily: F.displayBold, fontSize: 30, lineHeight: 34 },
  repOf: { color: '#D5DDD7', fontFamily: F.display, fontSize: 18 },
  dots: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  dotDone: { backgroundColor: '#5BE49B', borderColor: '#5BE49B' },
  scoreRow: { flexDirection: 'row', gap: sp(3), paddingHorizontal: sp(4), paddingTop: sp(3), alignItems: 'flex-start' },
  scoreBox: { backgroundColor: glass, borderRadius: R.lg, paddingHorizontal: sp(4), paddingVertical: sp(2), alignItems: 'center', minWidth: 104 },
  score: { fontFamily: F.displayBold, fontSize: 64, lineHeight: 66, color: '#FFFFFF' },
  scoreLabel: { color: '#D5DDD7', fontSize: 12 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: sp(1.5), justifyContent: 'flex-end' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: glass, borderRadius: R.pill, paddingHorizontal: sp(2.5), paddingVertical: sp(1.5) },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  panel: { margin: sp(4), padding: sp(4), borderRadius: R.lg, backgroundColor: glass },
  centre: { alignItems: 'center', gap: sp(2.5) },
  cueRow: { flexDirection: 'row', gap: sp(3), alignItems: 'center' },
  cue: { flexShrink: 1, color: '#FFFFFF', fontFamily: F.display, fontSize: 26, lineHeight: 30 },
  stage: { color: '#9FD3FF', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  sub: { color: '#D5DDD7', fontSize: 14, lineHeight: 20 },
  fps: { position: 'absolute', left: sp(4), bottom: sp(1), color: 'rgba(255,255,255,0.5)', fontSize: 11 },
});
