import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Ellipse, Rect, Text as SvgText } from 'react-native-svg';

import { Button, Card, Choice, H3, P, Screen, Small, TopBar } from '@/components/ui';
import { BOWLER_Y, STRIKER_Y, fieldPositions, type FieldPosition } from '@/data/fieldPositions';
import { makeFieldQuestions, type FieldQuestion } from '@/data/fieldQuestions';
import { judgePlacement, makeSetTasks, type Placement, type SetTask } from '@/data/fieldTasks';
import type { Hand } from '@/lib/pose/landmarks';
import { useProfile } from '@/state/AuthContext';
import { C, F, sp } from '@/theme';

type Mode = 'learn' | 'quiz' | 'set' | 'read';
const MODES: Mode[] = ['learn', 'quiz', 'set', 'read'];
const QUIZ_LENGTH = 12;

function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FieldTrainer() {
  const profile = useProfile();
  const hand = profile.battingHand;
  const positions = useMemo(() => fieldPositions(hand), [hand]);

  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(() => (MODES.includes(params.mode as Mode) ? (params.mode as Mode) : 'learn'));
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<FieldPosition | null>(null);

  // Quiz state
  const [order, setOrder] = useState<FieldPosition[]>(() => shuffled(positions).slice(0, QUIZ_LENGTH));
  const [turn, setTurn] = useState(0);
  const [tapped, setTapped] = useState<FieldPosition | null>(null);
  const [right, setRight] = useState(0);

  const target = order[turn];
  const finished = mode === 'quiz' && turn >= order.length;

  const startQuiz = () => {
    setOrder(shuffled(positions).slice(0, QUIZ_LENGTH));
    setTurn(0);
    setTapped(null);
    setRight(0);
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    setSelected(null);
    if (m === 'quiz') startQuiz();
  };

  const tap = (p: FieldPosition) => {
    if (mode === 'learn') {
      setSelected(p.id === selected?.id ? null : p);
      return;
    }
    if (tapped || finished) return;
    setTapped(p);
    if (p.id === target.id) setRight((r) => r + 1);
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const height = width * 1.12;
  const rx = width / 2 - 6;
  const ry = height / 2 - 6;
  const px = (x: number) => width / 2 + x * rx;
  const py = (y: number) => height / 2 + y * ry;
  const offLeft = hand === 'right';

  const colourOf = (p: FieldPosition) => {
    if (mode === 'learn') return p.id === selected?.id ? C.ball : '#FFFFFF';
    if (!tapped) return '#FFFFFF';
    if (p.id === target.id) return '#5BE49B';
    if (p.id === tapped.id) return '#FF8A8D';
    return '#FFFFFF';
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Field trainer" />
      <Choice
        value={mode}
        onChange={changeMode}
        options={[
          { value: 'learn', label: 'Learn the positions' },
          { value: 'quiz', label: 'Test myself' },
          { value: 'set', label: 'Set the field' },
          { value: 'read', label: 'Read the field' },
        ]}
      />
      {mode === 'read' ? <ReadTheField /> : null}
      {mode === 'set' ? <SetTheField hand={hand} /> : null}

      {mode === 'quiz' && !finished ? (
        <View>
          <Small>
            Position {turn + 1} of {order.length}
          </Small>
          <Text style={styles.prompt}>Tap {target.name}</Text>
        </View>
      ) : null}

      {mode === 'learn' || mode === 'quiz' ? (
      <View onLayout={onLayout} style={{ width: '100%' }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Ellipse cx={width / 2} cy={height / 2} rx={rx} ry={ry} fill={C.outfield} />
            <Ellipse cx={width / 2} cy={height / 2} rx={rx * 0.5} ry={ry * 0.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="6 6" />
            <Rect x={width / 2 - 9} y={py(STRIKER_Y) - 4} width={18} height={py(BOWLER_Y) - py(STRIKER_Y) + 8} rx={2} fill={C.pitch} />
            <SvgText fontFamily="System" x={px(offLeft ? -0.62 : 0.62)} y={py(-0.42)} fill="#FFFFFF" fillOpacity={0.75} fontSize={13} textAnchor="middle">
              Off side
            </SvgText>
            <SvgText fontFamily="System" x={px(offLeft ? 0.62 : -0.62)} y={py(-0.42)} fill="#FFFFFF" fillOpacity={0.75} fontSize={13} textAnchor="middle">
              Leg side
            </SvgText>
            {/* Batter and bowler */}
            <Circle cx={width / 2} cy={py(STRIKER_Y)} r={6} fill={C.willow} stroke={C.ink} strokeWidth={1.5} />
            <SvgText fontFamily="System" x={width / 2 + 14} y={py(STRIKER_Y) + 4} fill="#FFFFFF" fontSize={12}>
              You
            </SvgText>
            <Circle cx={width / 2} cy={py(BOWLER_Y) + 10} r={5} fill={C.ball} stroke="#FFFFFF" strokeWidth={1.5} />
            <SvgText fontFamily="System" x={width / 2 + 14} y={py(BOWLER_Y) + 14} fill="#FFFFFF" fontSize={12}>
              Bowler
            </SvgText>
            {positions.map((p) => (
              <Circle key={p.id} cx={px(p.x)} cy={py(p.y)} r={9} fill={colourOf(p)} stroke={C.ink} strokeWidth={1.5} />
            ))}
            {/* Larger tap targets */}
            {positions.map((p) => (
              <Circle key={`t-${p.id}`} cx={px(p.x)} cy={py(p.y)} r={22} fill="transparent" onPress={() => tap(p)} />
            ))}
            {mode === 'learn' && selected ? (
              <SvgText fontFamily="System" x={px(selected.x)} y={py(selected.y) - 16} fill="#FFFFFF" fontSize={14} fontWeight="bold" textAnchor="middle">
                {selected.name}
              </SvgText>
            ) : null}
            {mode === 'quiz' && tapped && !finished ? (
              <SvgText fontFamily="System" x={px(target.x)} y={py(target.y) - 16} fill="#FFFFFF" fontSize={14} fontWeight="bold" textAnchor="middle">
                {target.name}
              </SvgText>
            ) : null}
          </Svg>
        ) : null}
      </View>
      ) : null}

      {mode === 'learn' ? (
        <Card>
          {selected ? (
            <>
              <H3>{selected.name}</H3>
              <P soft>{selected.about}</P>
            </>
          ) : (
            <P soft>
              Tap a fielder to see the name of the position. The field is drawn for a {hand}-handed batter, so your off side is on the {offLeft ? 'left' : 'right'} of the picture.
            </P>
          )}
        </Card>
      ) : null}

      {mode === 'quiz' && !finished && tapped ? (
        <Card>
          <H3>{tapped.id === target.id ? 'Correct' : `That is ${tapped.name}`}</H3>
          <P soft>{target.about}</P>
          <Button
            title={turn + 1 < order.length ? 'Next position' : 'See my result'}
            onPress={() => {
              setTapped(null);
              setTurn(turn + 1);
            }}
          />
        </Card>
      ) : null}

      {finished ? (
        <Card>
          <Text style={styles.result}>
            {right} of {order.length}
          </Text>
          <P soft>{right === order.length ? 'Every position right.' : 'Go through the positions again, then have another try.'}</P>
          <Button title="Test myself again" onPress={startQuiz} />
        </Card>
      ) : null}
    </Screen>
  );
}

/**
 * "Set the field": an empty field and one task at a time ("Place a gully"). The learner taps
 * where the fielder should stand; the tap counts when it is close to the real position.
 */
function SetTheField({ hand }: { hand: Hand }) {
  const [tasks, setTasks] = useState<SetTask[]>(() => makeSetTasks(hand));
  const [turn, setTurn] = useState(0);
  const [tap, setTap] = useState<{ x: number; y: number; result: Placement } | null>(null);
  const [right, setRight] = useState(0);
  const [width, setWidth] = useState(0);
  const box = useRef<ComponentRef<typeof View>>(null);
  const finished = turn >= tasks.length;
  const task = tasks[Math.min(turn, tasks.length - 1)];

  const restart = () => {
    setTasks(makeSetTasks(hand));
    setTurn(0);
    setTap(null);
    setRight(0);
  };

  if (finished) {
    return (
      <Card>
        <Text style={styles.result}>
          {right} of {tasks.length}
        </Text>
        <P soft>
          {right === tasks.length
            ? 'You can set a field for both a right-hander and a left-hander.'
            : 'Remember: slips and gully go next to the keeper on the off side, and everything swaps for a left-hander. Try again.'}
        </P>
        <Button title="Set another field" onPress={restart} />
      </Card>
    );
  }

  const height = width * 1.12;
  const rx = width / 2 - 6;
  const ry = height / 2 - 6;
  const px = (x: number) => width / 2 + x * rx;
  const py = (y: number) => height / 2 + y * ry;
  const offLeft = task.hand === 'right';
  const all = fieldPositions(task.hand);
  const target = all.find((p) => p.id === task.id)!;
  // Fielders already placed for this batter stay on the field.
  const placed = tasks
    .slice(0, turn)
    .filter((t) => t.hand === task.hand)
    .map((t) => all.find((p) => p.id === t.id)!);

  const onPress = (e: GestureResponderEvent) => {
    if (tap || width === 0 || !box.current) return;
    // Page coordinates work the same on phones and on the web; locationX can be measured from an
    // inner shape on the web.
    const { pageX, pageY } = e.nativeEvent;
    box.current.measure((_x, _y, _w, _h, left, top) => {
      const x = (pageX - left - width / 2) / rx;
      const y = (pageY - top - height / 2) / ry;
      if (Math.hypot(x, y) > 1) return; // outside the field
      const result = judgePlacement(task.hand, task.id, x, y);
      setTap({ x, y, result });
      if (result.ok) setRight((r) => r + 1);
    });
  };

  let feedback = '';
  if (tap) {
    if (tap.result.ok) feedback = task.why;
    else if (!tap.result.sideOk) feedback = `That is on the wrong side. ${task.why}`;
    else feedback = `That is nearer ${tap.result.nearest.toLowerCase()}. ${task.why}`;
  }

  return (
    <View style={{ gap: sp(3) }}>
      <View>
        <Small>
          Task {turn + 1} of {tasks.length} · {task.hand}-handed batter
        </Small>
        <Text style={styles.question}>{task.say}</Text>
        <Small>Tap the field where the fielder should stand. The white circle behind the stumps is the wicketkeeper.</Small>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {width > 0 ? (
          <Pressable ref={box} onPress={onPress} accessibilityLabel={`Field. ${task.say}`}>
            <View pointerEvents="none">
              <Svg width={width} height={height}>
                <Ellipse cx={width / 2} cy={height / 2} rx={rx} ry={ry} fill={C.outfield} />
                <Ellipse cx={width / 2} cy={height / 2} rx={rx * 0.5} ry={ry * 0.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="6 6" />
                <Rect x={width / 2 - 9} y={py(STRIKER_Y) - 4} width={18} height={py(BOWLER_Y) - py(STRIKER_Y) + 8} rx={2} fill={C.pitch} />
                <SvgText fontFamily="System" x={px(offLeft ? -0.62 : 0.62)} y={py(-0.42)} fill="#FFFFFF" fillOpacity={0.75} fontSize={13} textAnchor="middle">
                  Off side
                </SvgText>
                <SvgText fontFamily="System" x={px(offLeft ? 0.62 : -0.62)} y={py(-0.42)} fill="#FFFFFF" fillOpacity={0.75} fontSize={13} textAnchor="middle">
                  Leg side
                </SvgText>
                <Circle cx={width / 2} cy={py(STRIKER_Y)} r={6} fill={C.willow} stroke={C.ink} strokeWidth={1.5} />
                <SvgText fontFamily="System" x={width / 2} y={py(-0.9)} fill="#FFFFFF" fontSize={13} fontWeight="bold" textAnchor="middle">
                  {offLeft ? 'Right-handed batter' : 'Left-handed batter'}
                </SvgText>
                <Circle cx={width / 2} cy={py(BOWLER_Y) + 10} r={5} fill={C.ball} stroke="#FFFFFF" strokeWidth={1.5} />
                <Circle cx={width / 2} cy={py(-0.25)} r={8} fill="#FFFFFF" stroke={C.ink} strokeWidth={1.5} />
                {placed.map((p) => (
                  <Circle key={p.id} cx={px(p.x)} cy={py(p.y)} r={8} fill="#FFFFFF" stroke={C.ink} strokeWidth={1.5} />
                ))}
                {placed.map((p) => (
                  <SvgText key={`l-${p.id}`} fontFamily="System" x={px(p.x)} y={py(p.y) - 13} fill="#FFFFFF" fillOpacity={0.85} fontSize={11} textAnchor="middle">
                    {p.name}
                  </SvgText>
                ))}
                {tap ? (
                  <>
                    {!tap.result.ok ? (
                      <Circle cx={px(target.x)} cy={py(target.y)} r={10} fill="#5BE49B" stroke={C.ink} strokeWidth={1.5} />
                    ) : null}
                    <Circle cx={px(tap.x)} cy={py(tap.y)} r={10} fill={tap.result.ok ? '#5BE49B' : '#FF8A8D'} stroke={C.ink} strokeWidth={1.5} />
                    <SvgText fontFamily="System" x={px(target.x)} y={py(target.y) - 16} fill="#FFFFFF" fontSize={14} fontWeight="bold" textAnchor="middle">
                      {target.name}
                    </SvgText>
                  </>
                ) : null}
              </Svg>
            </View>
          </Pressable>
        ) : null}
      </View>
      {tap ? (
        <Card>
          <H3>{tap.result.ok ? 'Well placed' : 'Not quite'}</H3>
          <P soft>{feedback}</P>
          <Button
            title={turn + 1 < tasks.length ? 'Next task' : 'See my result'}
            onPress={() => {
              setTap(null);
              setTurn(turn + 1);
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}

/**
 * "Read the field": questions about a field drawn for a batter whose hand is not given, so the
 * learner has to work it out from where the fielders stand (for example the slips are always on
 * the batter's off side), and questions about which fielder is placed for which shot.
 */
function ReadTheField() {
  const [questions, setQuestions] = useState<FieldQuestion[]>(() => makeFieldQuestions());
  const [turn, setTurn] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [width, setWidth] = useState(0);
  const q = questions[turn];
  const finished = turn >= questions.length;

  const restart = () => {
    setQuestions(makeFieldQuestions());
    setTurn(0);
    setPicked(null);
    setRight(0);
  };

  if (finished) {
    return (
      <Card>
        <Text style={styles.result}>
          {right} of {questions.length}
        </Text>
        <P soft>{right === questions.length ? 'You can read a field. Well done.' : 'Look again at where the slips stand and which side is the off side, then try again.'}</P>
        <Button title="New questions" onPress={restart} />
      </Card>
    );
  }

  return (
    <View style={{ gap: sp(3) }}>
      <View>
        <Small>
          Question {turn + 1} of {questions.length}
        </Small>
        <Text style={styles.question}>{q.q}</Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {width > 0 ? <FieldPicture width={width} hand={q.hand} show={q.show} highlight={q.highlight} sides={q.sides} batterLabel={q.batterLabel} /> : null}
      </View>
      <View style={{ gap: sp(2) }}>
        {q.options.map((o, i) => {
          const kind = picked === null ? 'secondary' : i === q.answer ? 'primary' : i === picked ? 'danger' : 'ghost';
          return (
            <Button
              key={o}
              title={picked !== null && i === q.answer ? `✓ ${o}` : o}
              kind={kind}
              onPress={() => {
                if (picked !== null) return;
                setPicked(i);
                if (i === q.answer) setRight((r) => r + 1);
              }}
            />
          );
        })}
      </View>
      {picked !== null ? (
        <Card>
          <H3>{picked === q.answer ? 'Correct' : 'Not quite'}</H3>
          <P soft>{q.why}</P>
          <Button
            title={turn + 1 < questions.length ? 'Next question' : 'See my result'}
            onPress={() => {
              setPicked(null);
              setTurn(turn + 1);
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}

/** A field seen from behind the bowler, for a batter of the given hand. */
function FieldPicture({
  width,
  hand,
  show,
  highlight,
  sides,
  batterLabel,
}: {
  width: number;
  hand: Hand;
  show: string[];
  highlight: string[];
  sides: boolean;
  batterLabel: string;
}) {
  const positions = fieldPositions(hand).filter((p) => show.includes(p.id));
  const height = width * 1.12;
  const rx = width / 2 - 6;
  const ry = height / 2 - 6;
  const px = (x: number) => width / 2 + x * rx;
  const py = (y: number) => height / 2 + y * ry;
  const offLeft = hand === 'right';
  return (
    <Svg width={width} height={height}>
      <Ellipse cx={width / 2} cy={height / 2} rx={rx} ry={ry} fill={C.outfield} />
      <Ellipse cx={width / 2} cy={height / 2} rx={rx * 0.5} ry={ry * 0.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="6 6" />
      <Rect x={width / 2 - 9} y={py(STRIKER_Y) - 4} width={18} height={py(BOWLER_Y) - py(STRIKER_Y) + 8} rx={2} fill={C.pitch} />
      {sides ? (
        <>
          <SvgText fontFamily="System" x={px(offLeft ? -0.62 : 0.62)} y={py(-0.42)} fill="#FFFFFF" fillOpacity={0.75} fontSize={13} textAnchor="middle">
            Off side
          </SvgText>
          <SvgText fontFamily="System" x={px(offLeft ? 0.62 : -0.62)} y={py(-0.42)} fill="#FFFFFF" fillOpacity={0.75} fontSize={13} textAnchor="middle">
            Leg side
          </SvgText>
        </>
      ) : null}
      <Circle cx={width / 2} cy={py(STRIKER_Y)} r={6} fill={C.willow} stroke={C.ink} strokeWidth={1.5} />
      <SvgText fontFamily="System" x={width / 2} y={py(-0.9)} fill="#FFFFFF" fontSize={13} fontWeight="bold" textAnchor="middle">
        {batterLabel}
      </SvgText>
      <Circle cx={width / 2} cy={py(BOWLER_Y) + 10} r={5} fill={C.ball} stroke="#FFFFFF" strokeWidth={1.5} />
      <SvgText fontFamily="System" x={width / 2 + 14} y={py(BOWLER_Y) + 14} fill="#FFFFFF" fontSize={12}>
        Bowler
      </SvgText>
      {positions.map((p) => (
        <Circle key={p.id} cx={px(p.x)} cy={py(p.y)} r={9} fill={highlight.includes(p.id) ? C.ball : '#FFFFFF'} stroke={C.ink} strokeWidth={1.5} />
      ))}
      {positions
        .filter((p) => highlight.includes(p.id))
        .map((p) => (
          <SvgText key={`l-${p.id}`} fontFamily="System" x={px(p.x)} y={py(p.y) - 14} fill="#FFFFFF" fontSize={12} fontWeight="bold" textAnchor="middle">
            {p.name}
          </SvgText>
        ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: F.display, fontSize: 24, lineHeight: 28, color: C.ink, marginTop: sp(0.5) },
  prompt: { fontFamily: F.display, fontSize: 30, color: C.ink, marginTop: sp(0.5) },
  result: { fontFamily: F.displayBold, fontSize: 56, color: C.ink },
});
