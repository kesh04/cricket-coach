import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AuthUser, Backend, CollectionName, Collections, UserProfile } from './types';
import { newId } from './types';

// Local backend: keeps everything on the phone with AsyncStorage.
// It lets the app run before Firebase is set up. It is for development and demos only:
// data does not sync between phones and the sign-in is not secure.

const USERS = 'cc:users';
const SESSION = 'cc:session';
const profileKey = (uid: string) => `cc:profile:${uid}`;
const colKey = (uid: string, c: CollectionName) => `cc:${uid}:${c}`;

type StoredUser = { uid: string; email: string; pass: string };

function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function createLocalBackend(): Backend {
  const listeners = new Set<(u: AuthUser | null) => void>();
  let current: AuthUser | null = null;
  let loaded = false;

  const emit = () => listeners.forEach((l) => l(current));

  const load = (async () => {
    current = await readJson<AuthUser | null>(SESSION, null);
    loaded = true;
    emit();
  })();

  const setSession = async (user: AuthUser | null) => {
    current = user;
    if (user) await AsyncStorage.setItem(SESSION, JSON.stringify(user));
    else await AsyncStorage.removeItem(SESSION);
    emit();
  };

  return {
    mode: 'local',

    onAuthChange(listener) {
      listeners.add(listener);
      if (loaded) listener(current);
      else void load;
      return () => listeners.delete(listener);
    },

    async signUp(email, password) {
      const key = email.trim().toLowerCase();
      const users = await readJson<Record<string, StoredUser>>(USERS, {});
      if (users[key]) throw new Error('An account with this email already exists. Sign in instead.');
      const user: StoredUser = { uid: newId(), email: key, pass: fingerprint(password) };
      users[key] = user;
      await AsyncStorage.setItem(USERS, JSON.stringify(users));
      const auth = { uid: user.uid, email: key };
      await setSession(auth);
      return auth;
    },

    async signIn(email, password) {
      const key = email.trim().toLowerCase();
      const users = await readJson<Record<string, StoredUser>>(USERS, {});
      const user = users[key];
      if (!user || user.pass !== fingerprint(password)) throw new Error('Email or password is not correct.');
      const auth = { uid: user.uid, email: key };
      await setSession(auth);
      return auth;
    },

    async signOut() {
      await setSession(null);
    },

    getProfile(uid) {
      return readJson<UserProfile | null>(profileKey(uid), null);
    },

    async saveProfile(profile) {
      await AsyncStorage.setItem(profileKey(profile.uid), JSON.stringify(profile));
    },

    async add(uid, collection, record) {
      const key = colKey(uid, collection);
      // Saving a record again (an edit) replaces the old copy.
      const items = (await readJson<Collections[typeof collection][]>(key, [])).filter((r) => r.id !== record.id);
      items.unshift(record);
      await AsyncStorage.setItem(key, JSON.stringify(items.slice(0, 300)));
    },

    async list(uid, collection, max = 100) {
      const items = await readJson<Collections[typeof collection][]>(colKey(uid, collection), []);
      return items.sort((a, b) => b.at - a.at).slice(0, max);
    },

    async clear(uid, collection) {
      await AsyncStorage.removeItem(colKey(uid, collection));
    },

    async remove(uid, collection, id) {
      const key = colKey(uid, collection);
      const items = await readJson<Collections[typeof collection][]>(key, []);
      await AsyncStorage.setItem(key, JSON.stringify(items.filter((r) => r.id !== id)));
    },
  };
}
