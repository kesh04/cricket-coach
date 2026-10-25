import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { GripDiagram } from '@/components/GripDiagram';
import { Button, Card, H2, H3, Notice, P, Screen, Small, TopBar } from '@/components/ui';
import { backend, newId, type CoachMessage } from '@/services/backend';
import { askGripCoach, coachConfigured } from '@/services/coach';
import { useAuth, useProfile } from '@/state/AuthContext';
import { C, R, sp } from '@/theme';

/** Photos are made this wide before they are sent, so they are small and quick to send. */
const PHOTO_WIDTH = 1000;

/**
 * Grip check with a photo.
 *
 * The pose camera cannot see fingers, so it cannot tell a good grip from a bad one. Here the
 * learner takes or picks one photo of their hands on the bat and the AI coach looks at it.
 */
export default function GripCheck() {
  const profile = useProfile();
  const { user } = useAuth();
  const hand = profile.battingHand;
  const top = hand === 'right' ? 'left' : 'right';
  const [photo, setPhoto] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const pick = async (from: 'camera' | 'library') => {
    setError(null);
    try {
      const allowed = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!allowed.granted) {
        setError(from === 'camera' ? 'The camera is needed to take the photo. Allow it in the phone settings.' : 'The photos are needed to pick one. Allow them in the phone settings.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.9 };
      const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Make it smaller before it is sent.
      const context = ImageManipulator.manipulate(asset.uri);
      if ((asset.width ?? PHOTO_WIDTH) > PHOTO_WIDTH) context.resize({ width: PHOTO_WIDTH });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
      if (!saved.base64) throw new Error('no picture');
      setPhoto(`data:image/jpeg;base64,${saved.base64}`);
      setAnswer('');
      setOffline(false);
    } catch {
      setError('The photo could not be opened. Try again.');
    }
  };

  const check = async () => {
    if (!photo || busy) return;
    setBusy(true);
    setAnswer('');
    abort.current = new AbortController();
    try {
      const reply = await askGripCoach({ image: photo, hand, onText: setAnswer, signal: abort.current.signal });
      setOffline(reply.offline);
      // Keep the answer in the coach conversation. The photo itself is not saved.
      if (user && !reply.offline) {
        const at = Date.now();
        const mine: CoachMessage = { id: newId(), role: 'user', text: '[Grip photo] Please check my grip.', at };
        const theirs: CoachMessage = { id: newId(), role: 'coach', text: reply.text, at: at + 1 };
        void backend.add(user.uid, 'coachMessages', mine).catch(() => {});
        void backend.add(user.uid, 'coachMessages', theirs).catch(() => {});
      }
    } catch {
      setAnswer('The coach could not answer just now. Check your connection and try again.');
      setOffline(true);
    } finally {
      setBusy(false);
    }
  };

  const verdict = /Good grip\./.test(answer) ? 'good' : /Needs fixing\./.test(answer) ? 'poor' : /Nearly there\./.test(answer) ? 'fair' : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <TopBar title="Check my grip" />

      <Card>
        <H3>Why a photo?</H3>
        <P soft>
          The practice camera follows your body, but it cannot see your fingers, so it cannot tell if your grip is right. Take one close photo of your hands on the bat and the coach will check it for you.
        </P>
      </Card>

      <View style={{ gap: sp(1) }}>
        <H2>How to take the photo</H2>
        {[
          'Hold the bat upright in front of you, the toe of the bat on the ground.',
          `Take your grip: ${top} hand on top, the other hand just below it.`,
          'Ask someone to take the photo from in front of you, or put the phone on a chair.',
          'Get close: your two hands and the handle should fill most of the picture.',
          'Good light, and no gloves.',
        ].map((line, i) => (
          <View key={line} style={styles.row}>
            <Text style={styles.number}>{i + 1}</Text>
            <Text style={styles.text}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pair}>
        <View style={styles.model}>
          <GripDiagram hand={hand} stage="vs" height={200} />
          <Small style={{ textAlign: 'center' }}>The model grip</Small>
        </View>
        <View style={styles.model}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel="Your grip photo" />
          ) : (
            <View style={[styles.photo, styles.empty]}>
              <Ionicons name="hand-left" size={40} color={C.inkMute} />
            </View>
          )}
          <Small style={{ textAlign: 'center' }}>{photo ? 'Your photo' : 'No photo yet'}</Small>
        </View>
      </View>

      {error ? <Notice tone="warn" icon="alert-circle">{error}</Notice> : null}

      <View style={{ flexDirection: 'row', gap: sp(2) }}>
        <Button title="Take photo" icon="camera" kind={photo ? 'secondary' : 'primary'} onPress={() => void pick('camera')} style={{ flex: 1 }} />
        <Button title="Upload photo" icon="images" kind="secondary" onPress={() => void pick('library')} style={{ flex: 1 }} />
      </View>

      {photo ? <Button title={busy ? 'The coach is looking…' : 'Ask the coach to check it'} icon="chatbubbles" loading={busy} onPress={() => void check()} /> : null}

      {answer || busy ? (
        <Card style={verdict === 'good' ? { borderColor: C.good } : verdict === 'poor' ? { borderColor: C.ball } : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(2) }}>
            <Ionicons name={verdict === 'good' ? 'checkmark-circle' : verdict === 'poor' ? 'alert-circle' : 'chatbubbles'} size={22} color={verdict === 'good' ? C.good : verdict === 'poor' ? C.ball : C.outfield} />
            <H3>The coach says</H3>
          </View>
          {answer ? <Text style={styles.answer}>{answer}</Text> : <ActivityIndicator color={C.outfield} />}
          {offline && coachConfigured ? <Small>The AI coach could not be reached, so this is the list to check yourself.</Small> : null}
        </Card>
      ) : null}

      <Small>
        {coachConfigured
          ? 'The photo is sent to the coach server only when you press the button, and it is not kept there. Do not include your face.'
          : 'The AI coach is not connected, so you will get a checklist to compare with your photo. The photo stays on this phone.'}
      </Small>

      <Button title="Watch the grip lesson again" icon="play" kind="ghost" onPress={() => router.push('/demo/grip')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sp(3), alignItems: 'flex-start' },
  number: { fontSize: 18, fontWeight: '700', color: C.outfield, width: 18, lineHeight: 24 },
  text: { flex: 1, fontSize: 16, lineHeight: 23, color: C.ink },
  pair: { flexDirection: 'row', gap: sp(3) },
  model: { flex: 1, gap: sp(1.5) },
  photo: { width: '100%', height: 200, borderRadius: R.lg, backgroundColor: C.night },
  empty: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  answer: { fontSize: 16, lineHeight: 24, color: C.ink },
});
