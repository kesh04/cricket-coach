import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import type { ComponentRef } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { H1, Small } from '@/components/ui';
import { backend, newId, type CoachMessage } from '@/services/backend';
import { askCoach, coachConfigured, parseCoachReply, summariseLearner } from '@/services/coach';
import { SPEECH_RATE } from '@/lib/voice';
import { useMatches } from '@/state/useMatches';
import { useAuth, useProfile } from '@/state/AuthContext';
import { useData } from '@/state/DataContext';
import { C, R, sp } from '@/theme';

const STARTERS = ['What should I practise today?', 'How do I fix my stance?', 'How do I hold the bat?', 'Quiz me on the 11 ways to be out', 'How does a powerplay work?'];

export default function Coach() {
  const { user } = useAuth();
  const profile = useProfile();
  const { passed, sessions, quizAttempts, programme } = useData();
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  useEffect(() => () => void Speech.stop(), []);
  const { matches } = useMatches();
  const learner = useMemo(() => summariseLearner(profile, passed, sessions, quizAttempts, Date.now(), matches), [profile, passed, sessions, quizAttempts, matches]);
  // Starters that fit this learner: their most common fault and their next lesson first.
  const starters = useMemo(() => {
    const own: string[] = [];
    if (learner.commonFaults[0]) own.push(`How do I fix my ${learner.commonFaults[0]}?`);
    if (learner.nextLesson) own.push(`Explain ${learner.nextLesson.toLowerCase()}`);
    return [...new Set([...own, ...STARTERS])].slice(0, 6);
  }, [learner]);
  const readAloud = (m: CoachMessage) => {
    void Speech.stop();
    if (speakingId === m.id) {
      setSpeakingId(null);
      return;
    }
    setSpeakingId(m.id);
    const body = parseCoachReply(m.text).body.replace(/^- /gm, '');
    // Sinhala answers are read with a Sinhala voice where the phone has one.
    const language = /[\u0D80-\u0DFF]/.test(body) ? 'si-LK' : /[\u0B80-\u0BFF]/.test(body) ? 'ta-LK' : 'en';
    Speech.speak(body, { language, rate: SPEECH_RATE, onDone: () => setSpeakingId(null), onStopped: () => setSpeakingId(null), onError: () => setSpeakingId(null) });
  };
  const { ask } = useLocalSearchParams<{ ask?: string }>();

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    let alive = true;
    if (!user) return;
    backend
      .list(user.uid, 'coachMessages', 40)
      .then((items) => alive && setMessages(items.slice().reverse()))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [user]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy || !user) return;
      setDraft('');
      setBusy(true);

      const history = messagesRef.current;
      const mine: CoachMessage = { id: newId(), role: 'user', text: question, at: Date.now() };
      const reply: CoachMessage = { id: newId(), role: 'coach', text: '', at: Date.now() + 1 };
      setMessages([...history, mine, reply]);

      try {
        const result = await askCoach({
          question,
          history,
          profile,
          learner,
          onText: (soFar) => setMessages((all) => all.map((m) => (m.id === reply.id ? { ...m, text: soFar } : m))),
        });
        const finished: CoachMessage = { ...reply, text: result.text, offline: result.offline, at: Date.now() };
        setMessages((all) => all.map((m) => (m.id === reply.id ? finished : m)));
        void backend.add(user.uid, 'coachMessages', mine).catch(() => {});
        void backend.add(user.uid, 'coachMessages', finished).catch(() => {});
      } catch {
        setMessages((all) => all.map((m) => (m.id === reply.id ? { ...m, text: 'The coach could not answer just now. Check your connection and ask again.', offline: true } : m)));
      } finally {
        setBusy(false);
      }
    },
    [busy, learner, profile, user],
  );

  // A question handed over from another screen, such as a stance result.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (loaded && ask && handled.current !== ask) {
      handled.current = ask;
      router.setParams({ ask: undefined });
      void send(ask);
    }
  }, [ask, loaded, send]);

  const clear = async () => {
    if (!user || busy) return;
    setMessages([]);
    await backend.clear(user.uid, 'coachMessages').catch(() => {});
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <H1>Coach</H1>
            <Small>{coachConfigured ? 'Answers use your lessons and stance checks.' : 'Coach tips stored in the app. Connect the AI coach for full answers.'}</Small>
          </View>
          {messages.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear the conversation" hitSlop={10} onPress={clear}>
              <Ionicons name="trash-outline" size={22} color={C.inkSoft} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          ref={scroller}
          style={{ flex: 1 }}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
          {loaded && messages.length === 0 ? (
            <View style={{ gap: sp(2.5) }}>
              {/* What the coach knows about today, before anything is asked. */}
              <View style={styles.today}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
                  <Ionicons name="today" size={20} color={C.outfield} />
                  <Text style={styles.todayTitle}>Today</Text>
                </View>
                <Text style={styles.todayText}>
                  {programme.todayDone ? 'Today\'s practice is done. Well played.' : `Your plan: stage ${programme.today.stage}, ${programme.today.title.toLowerCase()}, day ${programme.today.day} of ${programme.today.days}.`}
                </Text>
                {learner.commonFaults[0] ? <Text style={styles.todayText}>To work on: your {learner.commonFaults[0]}.</Text> : null}
                {learner.quizzesToRetry?.[0] ? <Text style={styles.todayText}>Quiz to try again: {learner.quizzesToRetry[0]}.</Text> : null}
                <Text style={styles.todaySmall}>Last practice: {learner.lastPractice}. Days practised in the last two weeks: {learner.daysPractisedLast14}.</Text>
              </View>
              <Text style={styles.empty}>Ask anything about batting, the rules or your practice. Try one of these.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/grip-check')} style={({ pressed }) => [styles.starter, { flexDirection: 'row', alignItems: 'center', gap: sp(2) }, pressed && { opacity: 0.7 }]}>
                <Ionicons name="camera" size={20} color={C.outfield} />
                <Text style={styles.starterText}>Check my grip from a photo</Text>
              </Pressable>
              {starters.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => send(s)} style={({ pressed }) => [styles.starter, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.starterText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {messages.map((m, i) => {
            const parsed = m.role === 'coach' ? parseCoachReply(m.text) : null;
            const last = i === messages.length - 1;
            return (
              <View key={m.id} style={{ gap: sp(2) }}>
                <View style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}>
                  {m.role === 'coach' && (parsed?.body ?? '') === '' ? (
                    <ActivityIndicator color={C.outfield} />
                  ) : (
                    <Text style={[styles.bubbleText, m.role === 'user' && { color: '#FFFFFF' }]}>{parsed ? parsed.body : m.text}</Text>
                  )}
                  {m.role === 'coach' && parsed?.body && !(last && busy) ? (
                    <View style={styles.bubbleFoot}>
                      {m.offline ? <Text style={styles.tag}>Stored tip</Text> : <View />}
                      <Pressable accessibilityRole="button" accessibilityLabel={speakingId === m.id ? 'Stop reading' : 'Read this answer aloud'} hitSlop={8} onPress={() => readAloud(m)}>
                        <Ionicons name={speakingId === m.id ? 'stop-circle' : 'volume-medium'} size={22} color={C.outfield} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                {parsed?.open && !(last && busy) ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push(parsed.open!.route as never)} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="arrow-forward-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.actionText}>{parsed.open.label}</Text>
                  </Pressable>
                ) : null}
                {parsed && last && !busy && parsed.next.length ? (
                  <View style={styles.nextRow}>
                    {parsed.next.map((q) => (
                      <Pressable key={q} accessibilityRole="button" onPress={() => send(q)} style={({ pressed }) => [styles.nextChip, pressed && { opacity: 0.7 }]}>
                        <Text style={styles.nextText}>{q}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Send a photo of your grip" hitSlop={6} onPress={() => router.push('/grip-check')} style={styles.photoButton}>
            <Ionicons name="camera" size={22} color={C.outfield} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask the coach"
            placeholderTextColor={C.inkMute}
            accessibilityLabel="Your question"
            style={styles.input}
            multiline
            onSubmitEditing={() => send(draft)}
            blurOnSubmit
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={busy || !draft.trim()}
            onPress={() => send(draft)}
            style={[styles.send, (busy || !draft.trim()) && { opacity: 0.4 }]}>
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(5), paddingTop: sp(5), paddingBottom: sp(2), width: '100%', maxWidth: 560, alignSelf: 'center' },
  thread: { padding: sp(5), gap: sp(2.5), width: '100%', maxWidth: 560, alignSelf: 'center' },
  empty: { fontSize: 16, color: C.inkSoft, marginBottom: sp(1) },
  starter: { borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surface, borderRadius: R.md, padding: sp(3.5), minHeight: 50, justifyContent: 'center' },
  starterText: { fontSize: 16, color: C.ink },
  bubble: { maxWidth: '88%', borderRadius: R.lg, paddingHorizontal: sp(4), paddingVertical: sp(3), gap: sp(1.5) },
  mine: { alignSelf: 'flex-end', backgroundColor: C.outfield, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 16, lineHeight: 23, color: C.ink },
  tag: { fontSize: 12, color: C.inkMute },
  bubbleFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: sp(2), alignSelf: 'flex-start', backgroundColor: C.outfield, borderRadius: R.pill, paddingHorizontal: sp(3.5), paddingVertical: sp(2.5) },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  nextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  nextChip: { borderWidth: 1.5, borderColor: C.outfield, backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: sp(3), paddingVertical: sp(2) },
  nextText: { fontSize: 14, color: C.outfield, fontWeight: '600' },
  today: { backgroundColor: C.outfieldTint, borderRadius: R.lg, padding: sp(4), gap: sp(1.5) },
  todayTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  todayText: { fontSize: 15, lineHeight: 21, color: C.ink },
  todaySmall: { fontSize: 13, color: C.inkSoft },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: sp(2.5),
    paddingHorizontal: sp(4),
    paddingVertical: sp(2.5),
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.surface,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: sp(3.5), paddingVertical: sp(2.5), fontSize: 16, color: C.ink, backgroundColor: C.bg },
  photoButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.outfieldTint, alignItems: 'center', justifyContent: 'center' },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.outfield, alignItems: 'center', justifyContent: 'center' },
});
