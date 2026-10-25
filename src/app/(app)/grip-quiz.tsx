import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GripDiagram } from '@/components/GripDiagram';
import { Button, Card, H3, P, Screen, Small, TopBar } from '@/components/ui';
import { makeGripQuestions } from '@/data/gripQuiz';
import { useProfile } from '@/state/AuthContext';
import { C, F, sp } from '@/theme';

/** "Spot the mistake": six grips, each with one mistake or none. */
export default function GripQuiz() {
  const hand = useProfile().battingHand;
  const [questions, setQuestions] = useState(() => makeGripQuestions());
  const [turn, setTurn] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const finished = turn >= questions.length;
  const q = questions[Math.min(turn, questions.length - 1)];

  const restart = () => {
    setQuestions(makeGripQuestions());
    setTurn(0);
    setPicked(null);
    setRight(0);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Spot the mistake" />
      {finished ? (
        <Card>
          <Text style={styles.result}>
            {right} of {questions.length}
          </Text>
          <P soft>{right === questions.length ? 'You know a good grip from a bad one. Now check your own with a photo.' : 'Watch the grip lesson again, then have another go.'}</P>
          <Button title="Check my grip with a photo" icon="camera" onPress={() => router.push('/grip-check')} />
          <Button title="Try again" kind="secondary" onPress={restart} />
        </Card>
      ) : (
        <>
          <View>
            <Small>
              Grip {turn + 1} of {questions.length} · {hand}-handed batter, seen from behind the bat
            </Small>
            <Text style={styles.question}>What is wrong with this grip?</Text>
          </View>
          <GripDiagram hand={hand} stage="vs" fault={q.fault} reveal={picked !== null} height={340} />
          <View style={{ gap: sp(2) }}>
            {q.options.map((o, i) => (
              <Button
                key={o}
                title={picked !== null && i === q.answer ? `✓ ${o}` : o}
                kind={picked === null ? 'secondary' : i === q.answer ? 'primary' : i === picked ? 'danger' : 'ghost'}
                onPress={() => {
                  if (picked !== null) return;
                  setPicked(i);
                  if (i === q.answer) setRight((r) => r + 1);
                }}
              />
            ))}
          </View>
          {picked !== null ? (
            <Card>
              <H3>{picked === q.answer ? 'Correct' : 'Not quite'}</H3>
              <P soft>{q.why}</P>
              <Button
                title={turn + 1 < questions.length ? 'Next grip' : 'See my result'}
                onPress={() => {
                  setPicked(null);
                  setTurn(turn + 1);
                }}
              />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: F.display, fontSize: 26, lineHeight: 30, color: C.ink, marginTop: sp(0.5) },
  result: { fontFamily: F.displayBold, fontSize: 56, color: C.ink },
});
