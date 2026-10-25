/**
 * TEST DATA ONLY. Adds test learners to Firebase so the app can be tried with many accounts.
 * Every account is marked `seed: true` and uses a test01@example.com style email, so it can never
 * be mistaken for a real participant. Do not use these accounts in the user evaluation.
 *
 * Each test learner gets:
 *   - a sign-in account (Firebase Authentication), password TestPass123
 *   - a profile in users/{uid}
 *   - one stance set in users/{uid}/practiceSessions with 10 good repetitions,
 *     so the stance-first rule is met and the shots are open
 *
 * Setup (once):
 *   1. Firebase console → Project settings → Service accounts → Generate new private key.
 *      Save the file as serviceAccount.json in the project folder. Never commit or share it.
 *   2. npm install --save-dev firebase-admin
 *
 * Run:
 *   node scripts/seed-test-users.mjs            # adds 18 test learners
 *   node scripts/seed-test-users.mjs 5          # adds 5
 *   node scripts/seed-test-users.mjs --delete   # removes every seed account and its data
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const KEY_FILE = process.env.SERVICE_ACCOUNT ?? 'serviceAccount.json';
const PASSWORD = 'TestPass123';
const STANCE_REPS = 50; // the shots open at 50 good stances

// firebase-admin v12+ is used through its sub-modules when the script is an ES module.
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_FILE, 'utf8'))) });
const auth = getAuth();
const db = getFirestore();

const NAMES = [
  'Test Kasun', 'Test Nimal', 'Test Sahan', 'Test Dilshan', 'Test Isuru', 'Test Pathum',
  'Test Ravindu', 'Test Chamod', 'Test Tharindu', 'Test Lahiru', 'Test Hasitha', 'Test Dinuka',
  'Test Sanuka', 'Test Yasiru', 'Test Malith', 'Test Janith', 'Test Akila', 'Test Venura',
  'Test Sithum', 'Test Oshada',
];
const AGES = ['14-17', '18-25', '18-25'];
const EXPERIENCE = ['new', 'some', 'club'];

const CHECKS = [
  ['feet', 'Feet'], ['feetLine', 'Feet in line'], ['toesSide', 'Toes'], ['knees', 'Knees'],
  ['lean', 'Lean'], ['shoulders', 'Shoulders'], ['head', 'Head'], ['hands', 'Hands'],
];

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pad = (n) => String(n).padStart(2, '0');

async function addOne(i) {
  const email = `test${pad(i)}@example.com`;
  let user;
  try {
    user = await auth.createUser({ email, password: PASSWORD, displayName: NAMES[(i - 1) % NAMES.length] });
  } catch (e) {
    if (e.code !== 'auth/email-already-exists') throw e;
    user = await auth.getUserByEmail(email);
  }
  const uid = user.uid;
  const hand = i % 4 === 0 ? 'left' : 'right';
  const createdAt = Date.now() - Math.round(rand(1, 7) * 86400000);
  const ageGroup = AGES[i % AGES.length];

  const profile = {
    uid,
    name: NAMES[(i - 1) % NAMES.length],
    email,
    ageGroup,
    experience: EXPERIENCE[i % EXPERIENCE.length],
    battingHand: hand,
    goal: '',
    createdAt,
    seed: true,
  };
  // The app asks for a guardian's consent for learners under 18.
  if (ageGroup !== '18-25') Object.assign(profile, { guardianName: 'Test Guardian', guardianConsent: true });
  await db.doc(`users/${uid}`).set(profile, { merge: true });

  const at = createdAt + 3600000;
  const reps = Array.from({ length: STANCE_REPS }, (_, k) => ({ score: Math.round(rand(78, 95)), at: at + k * 8000 }));
  const score = Math.round(reps.reduce((s, r) => s + r.score, 0) / reps.length);
  const checks = CHECKS.map(([id, label]) => ({ id, label, value: null, score: Math.round(rand(75, 98)), status: 'good', message: null }));
  const id = `seed-stance-${uid}`;
  await db.doc(`users/${uid}/practiceSessions/${id}`).set({
    id, kind: 'stance', hand, score, checks, reps, target: STANCE_REPS, at: at + STANCE_REPS * 8000, seed: true,
  });
  console.log(`added  ${email}  (${hand}-handed, ${STANCE_REPS} stance reps)`);
}

async function deleteAll() {
  const snap = await db.collection('users').where('seed', '==', true).get();
  for (const d of snap.docs) {
    await db.recursiveDelete(d.ref); // the profile and everything under it
    await auth.deleteUser(d.id).catch(() => {});
    console.log(`deleted ${d.get('email')}`);
  }
  console.log(`${snap.size} test learner(s) removed`);
}

const arg = process.argv[2];
if (arg === '--delete') {
  await deleteAll();
} else {
  const count = Math.min(Number(arg ?? 18) || 18, 99);
  for (let i = 1; i <= count; i++) await addOne(i);
  console.log(`\nDone. Sign in with test01@example.com … test${pad(count)}@example.com, password ${PASSWORD}`);
}
process.exit(0);
