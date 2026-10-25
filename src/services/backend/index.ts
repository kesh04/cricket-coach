import { createFirebaseBackend } from './firebase';
import { createLocalBackend } from './local';
import type { Backend } from './types';

export * from './types';

// Expo only exposes variables that start with EXPO_PUBLIC_ and are written out in full like this.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

/**
 * The backend in use. With Firebase keys in `.env` it is Firebase.
 * Without them the app runs in local mode so that it can be tried straight away.
 */
export const backend: Backend = firebaseConfigured ? createFirebaseBackend(firebaseConfig) : createLocalBackend();
