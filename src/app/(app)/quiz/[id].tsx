import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, H2, H3, Notice, P, Screen, Seam, Small, TopBar } from '@/components/ui';
import { LESSONS, LESSON_BY_ID, PASS_MARK, correctIndex, passesQuiz, personalise, sentence } from '@/data/curriculum';
import { useProfile } from '@/state/AuthContext';
import { useData } from '@/state/DataContext';
import { C, F, R, sp } from '@/theme';

type Stage = 'questions' | 'passed' | 'remedial';

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const { recordQuiz } = useData();
  const lesson = LESSON_BY_ID[id];

  const [stage, setStage] = useState<Stage>('questions');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  if (!lesson) {
    return (
      <Screen>
        <TopBar title="Quiz" />
        <P>This quiz could not be found.</P>
      </Screen>
    );
  }

  const hand = profile.battingHand;
  const t = (text: string) => personalise(text, hand);
  const total = lesson.quiz.length;
  const question = lesson.quiz[index];
  const right = correctIndex(question, hand);
  const answered = picked !== null;
  const needed = Math.ceil(total * PASS_MARK);

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (i === right) setScore((s) => s + 1);
  };

  const next = () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    // `score` already includes this question because choose() ran first.
    recordQuiz(lesson.id, score, total);
    setStage(passesQuiz(score, total) ? 'passed' : 'remedial');
  };

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setStage('questions');
  };

  if (stage === 'passed') {
    const position = LESSONS.findIndex((l) => l.id === lesson.id);
    const following = LESSONS[position + 1];
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title={lesson.title} onBack={() => router.replace('/learn')} />
        <View style={styles.result}>
          <Ionicons name="checkmark-circle" size={64} color={C.good} />
          <Text style={styles.resultScore}>
            {score} of {total}
          </Text>
          <H2>Lesson passed</H2>
          <P soft style={{ textAlign: 'center' }}>
            {following ? `"${following.title}" is now open.` : 'That was the last lesson. Well played.'}
          </P>
        </View>
        {lesson.practice ? <Button title={lesson.practice === 'grip' ? 'Now learn it on the Practise tab' : 'Now practise it with the camera'} icon={lesson.practice === 'grip' ? 'play' : 'camera'} kind="secondary" onPress={() => router.replace('/practice')} /> : null}
        {following ? <Button title="Next lesson" onPress={() => router.replace(`/lesson/${following.id}`)} /> : null}
        <Button title="Back to lessons" kind="ghost" onPress={() => router.replace('/learn')} />
      </Screen>
    );
  }

  if (stage === 'remedial') {
    return (
      <Screen edges={['top', 'bottom']}>
        <TopBar title={lesson.title} onBack={() => router.replace('/learn')} />
        <View style={styles.result}>
          <Text style={styles.resultScore}>
            {score} of {total}
          </Text>
          <H2>Not yet</H2>
          <P soft style={{ textAlign: 'center' }}>
            You need {needed} of {total} to pass. Read this, then try again.
          </P>
        </View>
        <Card>
          <H3>{lesson.remedial.heading}</H3>
          {lesson.remedial.points.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: sp(2.5), alignItems: 'flex-start' }}>
              <Ionicons name="ellipse" size={8} color={C.ball} style={{ marginTop: 8 }} />
              <Text style={{ flex: 1, fontSize: 16, lineHeight: 23, color: C.ink }}>{sentence(t(p))}</Text>
            </View>
          ))}
        </Card>
        <Button title="Try the quiz again" onPress={restart} />
        <Button title="Read the lesson again" kind="ghost" onPress={() => router.replace(`/lesson/${lesson.id}`)} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title={lesson.title} />
      <View style={{ gap: sp(1.5) }}>
        <Small>
          Question {index + 1} of {total}
        </Small>
        <Seam value={(index + (answered ? 1 : 0)) / total} total={total * 3} />
      </View>
      <H2>{t(question.q)}</H2>

      <View style={{ gap: sp(2.5) }} accessibilityRole="radiogroup">
        {question.options.map((option, i) => {
          const isRight = answered && i === right;
          const isWrongPick = answered && i === picked && i !== right;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked === i, disabled: answered }}
              onPress={() => choose(i)}
              style={[styles.option, isRight && styles.optionRight, isWrongPick && styles.optionWrong]}>
              <Text style={styles.optionText}>{t(option)}</Text>
              {isRight ? <Ionicons name="checkmark-circle" size={24} color={C.good} /> : null}
              {isWrongPick ? <Ionicons name="close-circle" size={24} color={C.bad} /> : null}
            </Pressable>
          );
        })}
      </View>

      {answered ? (
        <>
          <Notice icon={picked === right ? 'checkmark-circle' : 'information-circle'} tone={picked === right ? 'info' : 'warn'}>
            {picked === right ? 'Correct. ' : 'Not quite. '}
            {t(question.why)}
          </Notice>
          <Button title={index + 1 < total ? 'Next question' : 'See my result'} onPress={next} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 58,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.surface,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
  },
  optionRight: { borderColor: C.good, backgroundColor: C.outfieldTint },
  optionWrong: { borderColor: C.bad, backgroundColor: C.ballTint },
  optionText: { flex: 1, fontSize: 17, lineHeight: 23, color: C.ink },
  result: { alignItems: 'center', gap: sp(2), paddingVertical: sp(4) },
  resultScore: { fontFamily: F.displayBold, fontSize: 64, color: C.ink },
});
