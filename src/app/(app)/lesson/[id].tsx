import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card, H2, H3, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { LESSON_BY_ID, LEVELS, personalise, sentence } from '@/data/curriculum';
import { MoreVideos } from '@/components/MoreVideos';
import { SKILL_INFO } from '@/data/skills';
import { useProfile } from '@/state/AuthContext';
import { useData } from '@/state/DataContext';
import { C, sp } from '@/theme';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { passed, unlocked, skills } = useData();
  const lesson = LESSON_BY_ID[id];

  if (!lesson) {
    return (
      <Screen>
        <TopBar title="Lesson" />
        <P>This lesson could not be found.</P>
        <Button title="Back to lessons" onPress={() => router.replace('/learn')} />
      </Screen>
    );
  }

  const t = (text: string) => personalise(text, profile.battingHand);
  const level = LEVELS.find((l) => l.number === lesson.level);

  if (!unlocked(lesson.id)) {
    return (
      <Screen>
        <TopBar title="Locked" />
        <H2>{lesson.title}</H2>
        <Notice icon="lock-closed">Pass the quiz for the lesson before this one to open it.</Notice>
        <Button title="Back to lessons" onPress={() => router.replace('/learn')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar />
      <View style={{ gap: sp(1.5) }}>
        <Small>
          Level {lesson.level}: {level?.title}, about {lesson.minutes} minutes
        </Small>
        <H2>{lesson.title}</H2>
      </View>
      {passed.has(lesson.id) ? <Notice icon="checkmark-circle">You have passed this lesson. You can read it again any time.</Notice> : null}

      {lesson.sections.map((s) => (
        <View key={s.heading} style={{ gap: sp(1.5) }}>
          <H3>{s.heading}</H3>
          <P>{t(s.text)}</P>
        </View>
      ))}

      <Card>
        <H3>Remember</H3>
        {lesson.keyPoints.map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: sp(2.5), alignItems: 'flex-start' }}>
            <Ionicons name="checkmark" size={20} color={C.outfield} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: C.ink }}>{sentence(t(k))}</Text>
          </View>
        ))}
      </Card>

      {lesson.practice ? (
        <Card>
          <H3>Now do it yourself</H3>
          {skills[lesson.practice].unlocked ? (
            <>
              <P soft>Watch {SKILL_INFO[lesson.practice].name.toLowerCase()} being shown and explained, then let the camera check yours.</P>
              <Button title="Watch and practise" icon="play" kind="secondary" onPress={() => router.push(`/demo/${lesson.practice}`)} />
            </>
          ) : (
            <>
              <P soft>Practice goes in order. Pass the step before this one on the Practise tab, then the camera will check {SKILL_INFO[lesson.practice].name.toLowerCase()}.</P>
              <Button title="Open the Practise tab" icon="list" kind="secondary" onPress={() => router.push('/practice')} />
            </>
          )}
          {lesson.practice === 'stance' ? <Button title="Turn the 3D model stance" kind="ghost" onPress={() => router.push('/stance-guide')} /> : null}
        </Card>
      ) : null}

      {lesson.tool ? (
        <Card>
          <H3>{lesson.tool.title}</H3>
          <P soft>{lesson.tool.text}</P>
          <Button title="Open" icon="play" kind="secondary" onPress={() => router.push(lesson.tool!.route as never)} />
        </Card>
      ) : null}

      {lesson.practice ? <MoreVideos skill={lesson.practice} /> : null}

      <Button title={passed.has(lesson.id) ? 'Take the quiz again' : 'Take the quiz'} onPress={() => router.push(`/quiz/${lesson.id}`)} />
    </Screen>
  );
}
