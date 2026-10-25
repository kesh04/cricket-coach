import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { SPEECH_RATE } from '@/lib/voice';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, H2, H3, P, Screen, Small, TopBar, type IconName } from '@/components/ui';
import { C, F, sp } from '@/theme';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'map',
    title: 'Follow your plan, day by day',
    text: 'The plan has stages of 5 days. Each day adds 10 more: 10 on day 1, 20 on day 2, up to 50 on day 5. Stage 1: the stance. Stage 2: the forward defence in 2 parts (footwork, then the whole shot: eyes, bat and knee are checked inside it). Do them in any order. Your stance is only a quick check before each one: if it is good, you go straight on. Stage 3: the front-foot drive. A day counts when the whole day\'s plan is done.',
  },
  {
    icon: 'play-circle',
    title: 'Watch, and hear why',
    text: 'Before you practise a skill you watch it. For the stance there is a coaching video you watch to the end. Then a voice explains each part and why you do it that way.',
  },
  {
    icon: 'phone-portrait',
    title: 'Get ready',
    text: 'Before each practice the app tells you what you will do, what you need and how much space. Then you choose where the phone goes: in front of you, where the bowler would be, or at your side. Waist high, 3 to 4 metres away. While you practise, look at the bowler, not at the screen: the voice tells you what to fix.',
  },
  {
    icon: 'camera',
    title: 'Do your good ones',
    text: 'The app tells you out loud what to fix. Hold a good position and it counts: "One". If you hold the bat the other way round, the app tells you and waits until you turn round. In the defence and the drive your stance is checked first every time.',
  },
  {
    icon: 'image',
    title: 'See how you did',
    text: 'Watch your last one again straight away, or the video of your best one afterwards, slowed down if you like. You also get a score out of 100, the one thing to fix first, and what to do next in today\'s plan.',
  },
  {
    icon: 'hand-left',
    title: 'Check your grip with a photo',
    text: 'The camera cannot see your fingers. Take or upload a photo of your hands on the bat, and the AI coach checks your grip.',
  },
  {
    icon: 'calendar',
    title: 'Come back every day',
    text: 'The calendar on the Progress tab shows each day: green when the whole plan was done, yellow when you did some.',
  },
];

const NEED = ['A bat. A stick about as long as your leg also works.', 'A clear space about 4 metres by 3 metres, with good light, away from people and windows.', 'Something to lean the phone on, such as a chair or a wall.', 'The sound turned up, and silent mode off, so you can hear the voice.'];

/** A short guide to the app. Opens once after registering, and from the Practise tab and the profile. */
export default function HowTo() {
  const [reading, setReading] = useState(false);
  useEffect(() => () => void Speech.stop(), []);

  const read = () => {
    if (reading) {
      void Speech.stop();
      setReading(false);
      return;
    }
    setReading(true);
    const script = STEPS.map((s, i) => `Step ${i + 1}. ${s.title}. ${s.text}`).join(' ');
    Speech.speak(script, { language: 'en', rate: SPEECH_RATE, onDone: () => setReading(false), onStopped: () => setReading(false), onError: () => setReading(false) });
  };

  const close = () => {
    void Speech.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="How to use the app" onBack={close} />
      <View style={{ gap: sp(1) }}>
        <H2>How it works</H2>
        <P soft>The app teaches one skill at a time. You pass a step before the next one opens.</P>
      </View>

      <Button title={reading ? 'Stop reading' : 'Read this to me'} icon={reading ? 'stop' : 'volume-high'} kind="secondary" onPress={read} />

      <View style={{ gap: sp(4) }}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.row}>
            <View style={styles.badge}>
              <Ionicons name={s.icon} size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title}>
                {i + 1}. {s.title}
              </Text>
              <Text style={styles.text}>{s.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <Card>
        <H3>What you need</H3>
        {NEED.map((n) => (
          <View key={n} style={{ flexDirection: 'row', gap: sp(2.5), alignItems: 'flex-start' }}>
            <Ionicons name="checkmark" size={20} color={C.outfield} style={{ marginTop: 2 }} />
            <Text style={styles.text}>{n}</Text>
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', gap: sp(2), alignItems: 'flex-start' }}>
        <Ionicons name="lock-closed" size={16} color={C.inkSoft} style={{ marginTop: 2 }} />
        <Small style={{ flex: 1 }}>The camera video is checked on your phone and is never uploaded. One photo of each saved try is kept on your phone only. Scores are saved to your account.</Small>
      </View>

      <Button title="Start practising" icon="arrow-forward" onPress={() => router.replace('/practice')} />
      <Button title="Close" kind="ghost" onPress={close} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sp(3), alignItems: 'flex-start' },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.outfield, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.display, fontSize: 21, color: C.ink },
  text: { flex: 1, fontSize: 16, lineHeight: 23, color: C.ink },
});
