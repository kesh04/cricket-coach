import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Photos of practice attempts.
 *
 * When an attempt is saved, the camera page hands over one still picture with the skeleton
 * drawn on it. It is kept here, on the phone only, so the learner can see how they stood on
 * the result screen. It is never sent to Firebase or anywhere else, and only the most recent
 * few are kept.
 */
const KEEP = 12;
const INDEX = 'cc:snapshots';
const key = (sessionId: string) => `cc:snapshot:${sessionId}`;

export async function saveSnapshot(sessionId: string, image: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(sessionId), image);
    const raw = await AsyncStorage.getItem(INDEX);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const next = [sessionId, ...ids.filter((id) => id !== sessionId)];
    const drop = next.slice(KEEP);
    await AsyncStorage.setItem(INDEX, JSON.stringify(next.slice(0, KEEP)));
    await Promise.all(drop.map((id) => AsyncStorage.removeItem(key(id))));
  } catch {
    // Storage is full or unavailable: the result screen falls back to the 3D figure.
  }
}

export async function loadSnapshot(sessionId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key(sessionId));
  } catch {
    return null;
  }
}

/** Removes every saved photo, for example when the learner signs out. */
export async function clearSnapshots(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    await Promise.all(ids.map((id) => AsyncStorage.removeItem(key(id))));
    await AsyncStorage.removeItem(INDEX);
  } catch {
    // Nothing to clear.
  }
}
