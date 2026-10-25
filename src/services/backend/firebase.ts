import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  // @ts-ignore: exported by the React Native build of firebase/auth
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import type { Backend, Collections, UserProfile } from './types';

// Firebase backend: Authentication (email and password) and Cloud Firestore.
// Both are on the no-cost Spark plan. Cloud Storage is not used: video never leaves the phone.
//
// Data layout in Firestore:
//   users/{uid}                      the learner's profile
//   users/{uid}/quizAttempts/{id}
//   users/{uid}/practiceSessions/{id}
//   users/{uid}/coachMessages/{id}
//   users/{uid}/scorebook/{id}

function friendly(error: unknown): Error {
  const code = (error as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/invalid-credential': 'Email or password is not correct.',
    'auth/user-not-found': 'Email or password is not correct.',
    'auth/wrong-password': 'Email or password is not correct.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'permission-denied': 'The database refused this request. Check the Firestore rules in the README.',
    unavailable: 'No connection. Your work will be saved when you are back online.',
  };
  return new Error(map[code] ?? (error as Error)?.message ?? 'Something went wrong. Try again.');
}

export function createFirebaseBackend(config: FirebaseOptions): Backend {
  const app = initializeApp(config);

  let auth: Auth;
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    // Keeps the learner signed in between app launches.
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  }

  const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    // React Native has no WebSocket-based stream that Firestore likes; this lets it fall back cleanly.
    experimentalAutoDetectLongPolling: true,
  });

  return {
    mode: 'firebase',

    onAuthChange(listener) {
      return onAuthStateChanged(auth, (u) => listener(u ? { uid: u.uid, email: u.email ?? '' } : null));
    },

    async signUp(email, password) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        return { uid: cred.user.uid, email: cred.user.email ?? email };
      } catch (e) {
        throw friendly(e);
      }
    },

    async signIn(email, password) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return { uid: cred.user.uid, email: cred.user.email ?? email };
      } catch (e) {
        throw friendly(e);
      }
    },

    async signOut() {
      await fbSignOut(auth);
    },

    async getProfile(uid) {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? (snap.data() as UserProfile) : null;
      } catch (e) {
        throw friendly(e);
      }
    },

    async saveProfile(profile) {
      try {
        await setDoc(doc(db, 'users', profile.uid), profile, { merge: true });
      } catch (e) {
        throw friendly(e);
      }
    },

    async add(uid, name, record) {
      try {
        await setDoc(doc(db, 'users', uid, name, record.id), record);
      } catch (e) {
        throw friendly(e);
      }
    },

    async list(uid, name, max = 100) {
      try {
        const q = query(collection(db, 'users', uid, name), orderBy('at', 'desc'), limit(max));
        const snap = await getDocs(q);
        return snap.docs.map((d) => d.data() as Collections[typeof name]);
      } catch (e) {
        throw friendly(e);
      }
    },

    async clear(uid, name) {
      const snap = await getDocs(collection(db, 'users', uid, name));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    },

    async remove(uid, name, id) {
      try {
        await deleteDoc(doc(db, 'users', uid, name, id));
      } catch (e) {
        throw friendly(e);
      }
    },
  };
}
