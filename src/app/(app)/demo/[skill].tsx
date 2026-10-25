import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { SPEECH_RATE } from '@/lib/voice';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GripDiagram } from '@/components/GripDiagram';
import { MoreVideos } from '@/components/MoreVideos';
import { MustWatchVideo } from '@/components/MustWatchVideo';
import { StanceFigure, viewYaw, type FigureView } from '@/components/StanceFigure';
import { jointAngle } from '@/lib/pose/geometry';
import { Button, H2, Notice, P, Screen, Seam, Small, TopBar, type IconName } from '@/components/ui';
import { personalise } from '@/data/curriculum';
import { DEMO_VIDEOS } from '@/data/demoVideos';
import { MUST_WATCH } from '@/data/videos';
import { DEMO_STEPS, SKILL_INFO } from '@/data/skills';
import { SKILLS, type Skill } from '@/lib/pose/benchmarks';
import { isShotId, buildShot, shotBatAt, type ShotId, type ShotProgress } from '@/lib/pose/shotPoses';
import { batBetween, buildDefence, buildDrive, buildStance, driveBatAt, idealBat, IN_STANCE, type DefenceProgress, type DriveProgress, type StanceProgress } from '@/lib/pose/idealStance';
import { LM, type Hand, type Vec3 } from '@/lib/pose/landmarks';
import { narrate } from '@/lib/narrate';
import { useProfile } from '@/state/AuthContext';
import { useData } from '@/state/DataContext';
import { C, F, R, sp } from '@/theme';

// The video player is only loaded when a filmed demonstration has been added.
const DemoVideo = lazy(() => import('@/components/DemoVideo'));

const FIGURE_HEIGHT = 330;
const WATCH_STEP_MS = 1150; // how long each part of the movement is shown in the silent run-through
const MOVE_MS = 900; // how long the figure takes to move between two steps
const PAUSE_MS = 500; // gap between two spoken steps

type Mode = 'watch' | 'explain';

export default function Demo() {
  const params = useLocalSearchParams<{ skill: string; step?: string }>();
  const skill = (SKILLS as string[]).includes(params.skill) ? (params.skill as Skill) : null;
  const profile = useProfile();
  const hand = profile.battingHand;
  const { skills, markWatched, markVideoSeen } = useData();

  const steps = skill ? DEMO_STEPS[skill] : [];
  const last = steps.length - 1;
  // A coaching video that has to be watched to the end first (see data/videos.ts).
  const must = skill ? MUST_WATCH[skill] : undefined;
  const videoSeen = skill ? skills[skill].videoSeen : true;
  const [fallback, setFallback] = useState(false);
  const youtube = !!must && !fallback;
  // "Watch that step again" opens the explanation at one step, once the video has been watched.
  const wanted = params.step === undefined || !videoSeen ? null : Math.max(0, Math.min(last, Number(params.step) || 0));
  const video = skill ? DEMO_VIDEOS[skill] : null;

  const [mode, setMode] = useState<Mode>(wanted === null ? 'watch' : 'explain');
  const [index, setIndex] = useState(wanted ?? 0);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(true);
  const [ended, setEnded] = useState(false);

  const step = steps[index];
  const t = (text: string) => personalise(text, hand);
  const info = skill ? SKILL_INFO[skill] : null;
  // Watching is learning, not practice: a shot can be watched before the stance is done (the
  // practice itself stays closed until then).
  const open = skill ? skills[skill].unlocked || skills[skill].needsStance : false;

  // 1. Watch: the whole movement, once, without the explanation.
  useEffect(() => {
    if (!skill || !open || mode !== 'watch' || video || youtube || !playing) return;
    const timer = setTimeout(
      () => {
        if (index < last) setIndex(index + 1);
        else {
          setMode('explain');
          setIndex(0);
        }
      },
      index === 0 ? WATCH_STEP_MS + 900 : WATCH_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [skill, open, mode, video, youtube, playing, index, last]);

  // A short spoken introduction to the silent run-through.
  const introduced = useRef(false);
  useEffect(() => {
    if (!info || !open || mode !== 'watch' || introduced.current) return;
    introduced.current = true;
    if (voice && !youtube) Speech.speak(`Watch the ${info.noun} first. Then I will explain it.`, { language: 'en', rate: SPEECH_RATE });
  }, [info, open, mode, voice, youtube]);

  // 2. Listen: the voice explains one step at a time, and the picture follows.
  useEffect(() => {
    if (!skill || !open || mode !== 'explain' || !playing || !step) return;
    let pause: ReturnType<typeof setTimeout> | undefined;
    const spoken = step.why ? `${step.say} ${step.why}` : step.say;
    const cancel = narrate(personalise(spoken, hand), {
      voice,
      onEnd: () => {
        if (index < last) pause = setTimeout(() => setIndex((i) => Math.min(last, i + 1)), PAUSE_MS);
        else {
          setPlaying(false);
          setEnded(true);
        }
      },
    });
    return () => {
      cancel();
      clearTimeout(pause);
    };
  }, [skill, open, mode, playing, voice, index, last, step, hand]);

  // Reaching the last step of the explanation counts as having watched it.
  useEffect(() => {
    if (skill && open && mode === 'explain' && index === last) markWatched(skill);
  }, [skill, open, mode, index, last, markWatched]);

  // Stop talking when the learner leaves.
  useEffect(() => () => void Speech.stop(), []);

  if (!skill || !info) {
    return (
      <Screen>
        <TopBar title="Demonstration" />
        <P>This demonstration could not be found.</P>
        <Button title="Back to practice" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  if (!open) {
    return (
      <Screen>
        <TopBar title={info.name} />
        <Notice icon="lock-closed">Practice goes in order. Pass the step before this one to open it.</Notice>
        <Button title="Back to practice" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  const watched = skills[skill].watched;
  const canPractise = watched || (mode === 'explain' && index === last);

  const go = (i: number) => {
    setEnded(false);
    setIndex(Math.max(0, Math.min(last, i)));
    setPlaying(true);
  };
  const explain = () => {
    void Speech.stop();
    setMode('explain');
    setEnded(false);
    setIndex(0);
    setPlaying(true);
  };
  const watchAgain = () => {
    void Speech.stop();
    setMode('watch');
    setEnded(false);
    setIndex(0);
    setPlaying(true);
  };
  const toggle = () => {
    if (ended) go(0);
    else setPlaying((p) => !p);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar
        title={info.name}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel={voice ? 'Turn the voice off' : 'Turn the voice on'} hitSlop={10} onPress={() => setVoice((v) => !v)}>
            <Ionicons name={voice ? 'volume-high' : 'volume-mute'} size={26} color={C.outfield} />
          </Pressable>
        }
      />

      <View style={styles.stages}>
        <Stage n={1} label="Watch" on={mode === 'watch'} done={mode === 'explain'} />
        <Stage n={2} label="Listen" on={mode === 'explain'} done={canPractise} />
        <Stage n={3} label={skill === 'grip' ? 'Do it' : 'Try it'} on={false} done={false} />
      </View>

      {mode === 'watch' && youtube && must ? (
        <MustWatchVideo
          videoId={must.youtubeId}
          title={must.title}
          source={must.source}
          onFinished={() => {
            markVideoSeen(skill);
            explain();
          }}
          onFallback={() => {
            markVideoSeen(skill);
            setFallback(true);
            setIndex(0);
            setPlaying(true);
          }}
        />
      ) : mode === 'watch' && video ? (
        <Suspense fallback={<View style={[styles.loading, { height: FIGURE_HEIGHT }]}><ActivityIndicator color="#FFFFFF" /></View>}>
          <DemoVideo source={video} height={FIGURE_HEIGHT} onEnd={explain} />
        </Suspense>
      ) : skill === 'stance' ? (
        <StanceDemo hand={hand} progress={step.progress ?? IN_STANCE} view={step.view ?? 'side'} highlight={mode === 'explain' ? step.highlight : undefined} bat={!!step.bat} kneeAngles={mode === 'explain' && !!step.kneeAngles} />
      ) : skill === 'defence' ? (
        <DefenceDemo hand={hand} progress={step.defence!} view={step.view ?? 'side'} highlight={mode === 'explain' ? step.highlight : undefined} />
      ) : skill === 'drive' ? (
        <DriveDemo hand={hand} progress={step.drive!} view={step.view ?? 'side'} highlight={mode === 'explain' ? step.highlight : undefined} />
      ) : isShotId(skill) ? (
        <ShotDemo shot={skill} hand={hand} progress={step.shot!} view={step.view ?? 'side'} highlight={mode === 'explain' ? step.highlight : undefined} />
      ) : (
        <GripDiagram hand={hand} stage={step.grip ?? 'check'} height={FIGURE_HEIGHT} />
      )}

      {mode === 'watch' ? (
        <>
          <View style={{ gap: sp(1.5) }}>
            <H2>{youtube ? `Watch how to do the ${info.noun}` : 'Watch first'}</H2>
            <P soft>
              {youtube
                ? `A coach shows the ${info.noun}. Watch it to the end; then the voice explains each part and why.`
                : video
                  ? `Watch the ${info.noun}. The voice explains it next, one step at a time.`
                  : `This is the whole ${info.noun}, start to finish. The voice explains it next, one step at a time.`}
            </P>
          </View>
          {!video && !youtube ? <Seam value={(index + 1) / steps.length} total={steps.length * 3} /> : null}
          {/* The coaching video cannot be skipped the first time. */}
          {!youtube || videoSeen ? <Button title="Go to the explanation" icon="volume-high" kind="secondary" onPress={explain} /> : null}
        </>
      ) : (
        <>
          <Seam value={(index + 1) / steps.length} total={steps.length * 3} />
          <View style={{ gap: sp(1.5) }} accessibilityLiveRegion="polite">
            <Small>
              Step {index + 1} of {steps.length}
            </Small>
            <H2>{step.title}</H2>
            <Text style={styles.caption}>{t(step.say)}</Text>
            {step.why ? (
              <View style={styles.why}>
                <Ionicons name="bulb" size={20} color={C.willowDeep} style={{ marginTop: 2 }} />
                <Text style={styles.whyText}>
                  <Text style={{ fontWeight: '700' }}>Why? </Text>
                  {t(step.why)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.controls}>
            <Control icon="play-skip-back" label="Previous step" disabled={index === 0} onPress={() => go(index - 1)} />
            <Control icon={ended ? 'refresh' : playing ? 'pause' : 'play'} label={ended ? 'Play again from the start' : playing ? 'Pause' : 'Play'} big onPress={toggle} />
            <Control icon="play-skip-forward" label="Next step" disabled={index === last} onPress={() => go(index + 1)} />
          </View>
        </>
      )}

      {canPractise ? (
        skill === 'grip' ? (
          <>
            <Button title="Check my grip with a photo" icon="camera" onPress={() => router.push('/grip-check')} />
            <Button title="Spot the mistake: 6 grips" icon="search" kind="secondary" onPress={() => router.push('/grip-quiz')} />
            <Button title="Done: next, the stance" icon="arrow-forward" kind="secondary" onPress={() => router.replace('/demo/stance')} />
          </>
        ) : (
          <Button title="Now try it: set up my phone" icon="camera" onPress={() => router.push(`/setup?skill=${skill}`)} />
        )
      ) : (
        <Notice icon="eye">Watch and listen to the end. Then the camera practice opens.</Notice>
      )}
      {mode === 'explain' ? <Button title={youtube ? 'Watch the video again' : 'Watch the whole thing again'} kind="ghost" onPress={watchAgain} /> : null}
      <MoreVideos skill={skill} />
    </Screen>
  );
}

/** One of the three stages of learning a skill, shown as a row at the top. */
function Stage({ n, label, on, done }: { n: number; label: string; on: boolean; done: boolean }) {
  return (
    <View style={[styles.stage, on && styles.stageOn]} accessibilityLabel={`Stage ${n}: ${label}${on ? ', now' : done ? ', done' : ''}`}>
      {done && !on ? <Ionicons name="checkmark-circle" size={18} color={C.outfield} /> : <Text style={[styles.stageNumber, on && { color: '#FFFFFF' }]}>{n}</Text>}
      <Text style={[styles.stageLabel, on && { color: '#FFFFFF' }]}>{label}</Text>
    </View>
  );
}

function Control({ icon, label, onPress, disabled, big }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; big?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.control, big && styles.controlBig, disabled && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={big ? 30 : 24} color={big ? '#FFFFFF' : C.outfield} />
    </Pressable>
  );
}

const mix = (a: number, b: number, e: number) => a + (b - a) * e;

/**
 * Moves a set of numbers (how far into each part of a movement) and the viewing angle smoothly
 * from where they are to a new target.
 */
function useTween<T extends Record<string, number>>(target: T, targetYaw: number): { p: T; yaw: number } {
  const [now, setNow] = useState({ p: target, yaw: targetYaw });
  const current = useRef(now);

  useEffect(() => {
    const from = current.current;
    // Turn the short way round.
    let turn = (targetYaw - from.yaw) % (Math.PI * 2);
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const started = Date.now();
    let raf = 0;
    let lastDraw = 0;
    const tick = () => {
      const time = Date.now();
      const x = Math.min(1, (time - started) / MOVE_MS);
      if (x >= 1 || time - lastDraw >= 33) {
        lastDraw = time;
        const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        const p = {} as Record<string, number>;
        for (const k of Object.keys(target)) p[k] = mix(from.p[k] ?? target[k], target[k], e);
        current.current = { p: p as T, yaw: from.yaw + turn * e };
        setNow(current.current);
      }
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, targetYaw]);

  return now;
}

/** The 3D batter, moving smoothly from one step of the stance to the next. */
function StanceDemo({ hand, progress, view, highlight, bat, kneeAngles }: { hand: Hand; progress: StanceProgress; view: FigureView; highlight?: number[]; bat: boolean; kneeAngles?: boolean }) {
  const now = useTween(progress, viewYaw(hand, view));
  const pose = buildStance(hand, now.p);
  // The bat appears once the hands have reached it.
  const holding = bat && now.p.hands > 0.97;
  // The angle at the knees, so the learner sees the bend grow from straight (180°).
  // Both knees bend the same way; seen from the side they overlap, so one label is shown.
  const knee = hand === 'right' ? LM.L_KNEE : LM.R_KNEE;
  const hip = hand === 'right' ? LM.L_HIP : LM.R_HIP;
  const ankle = hand === 'right' ? LM.L_ANKLE : LM.R_ANKLE;
  const labels = kneeAngles ? [{ joint: knee, text: `Knees ${Math.round(jointAngle(pose[hip], pose[knee], pose[ankle]))}°` }] : undefined;
  return <StanceFigure hand={hand} pose={pose} yaw={now.yaw} bat={holding ? idealBat(hand) : null} highlight={highlight} labels={labels} height={FIGURE_HEIGHT} interactive={false} autoRotate={false} />;
}

/** The 3D batter, moving from the stance into the forward defence one part at a time. */
function DefenceDemo({ hand, progress, view, highlight }: { hand: Hand; progress: DefenceProgress; view: FigureView; highlight?: number[] }) {
  const now = useTween(progress, viewYaw(hand, view));
  const pose: Vec3[] = buildDefence(hand, now.p);
  return <StanceFigure hand={hand} pose={pose} yaw={now.yaw} bat={batBetween(hand, now.p.bat)} highlight={highlight} height={FIGURE_HEIGHT} interactive={false} autoRotate={false} />;
}

/** The 3D batter, moving from the stance through the drive to a high finish. */
function DriveDemo({ hand, progress, view, highlight }: { hand: Hand; progress: DriveProgress; view: FigureView; highlight?: number[] }) {
  const now = useTween(progress, viewYaw(hand, view));
  const pose: Vec3[] = buildDrive(hand, now.p);
  return <StanceFigure hand={hand} pose={pose} yaw={now.yaw} bat={driveBatAt(hand, now.p.swing)} highlight={highlight} height={FIGURE_HEIGHT} interactive={false} autoRotate={false} />;
}

/** The 3D batter, moving from the stance into back-foot defence, pull, cut or sweep. */
function ShotDemo({ shot, hand, progress, view, highlight }: { shot: ShotId; hand: Hand; progress: ShotProgress; view: FigureView; highlight?: number[] }) {
  const now = useTween(progress, viewYaw(hand, view));
  const pose: Vec3[] = buildShot(shot, hand, now.p);
  return <StanceFigure hand={hand} pose={pose} yaw={now.yaw} bat={shotBatAt(shot, hand, now.p.swing)} highlight={highlight} height={FIGURE_HEIGHT} interactive={false} autoRotate={false} />;
}

const styles = StyleSheet.create({
  stages: { flexDirection: 'row', gap: sp(2) },
  stage: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(1.5), minHeight: 40, borderRadius: R.pill, backgroundColor: C.outfieldTint },
  stageOn: { backgroundColor: C.outfield },
  stageNumber: { fontFamily: F.displayBold, fontSize: 18, color: C.outfield },
  stageLabel: { fontSize: 14, fontWeight: '600', color: C.outfield },
  loading: { borderRadius: 22, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 19, lineHeight: 28, color: C.ink },
  why: { flexDirection: 'row', gap: sp(2), backgroundColor: '#FBF3E2', borderRadius: R.md, padding: sp(3) },
  whyText: { flex: 1, fontSize: 16, lineHeight: 23, color: C.ink },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(6) },
  control: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: C.outfieldTint },
  controlBig: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.outfield },
});
