import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Skill } from '@/lib/pose/benchmarks';

/**
 * Small things remembered on this phone for each learner: whether they have seen the guide
 * to the app, which demonstrations they have watched, and whether a coach has opened every
 * practice step for them.
 */
const introKey = (uid: string) => `cc:intro:${uid}`;
const watchedKey = (uid: string) => `cc:watched:${uid}`;
const openKey = (uid: string) => `cc:steps-open:${uid}`;

export async function introSeen(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(introKey(uid))) === '1';
  } catch {
    return true;
  }
}

export async function markIntroSeen(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(introKey(uid), '1');
  } catch {
    // Not remembered: the guide is shown again next time.
  }
}

export async function watchedDemos(uid: string): Promise<Skill[]> {
  try {
    const raw = await AsyncStorage.getItem(watchedKey(uid));
    return raw ? (JSON.parse(raw) as Skill[]) : [];
  } catch {
    return [];
  }
}

export async function markDemoWatched(uid: string, skill: Skill): Promise<void> {
  try {
    const seen = await watchedDemos(uid);
    if (!seen.includes(skill)) await AsyncStorage.setItem(watchedKey(uid), JSON.stringify([...seen, skill]));
  } catch {
    // Not remembered: the demonstration is offered again next time.
  }
}

export async function allStepsOpen(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(openKey(uid))) === '1';
  } catch {
    return false;
  }
}

export async function setAllStepsOpen(uid: string, open: boolean): Promise<void> {
  try {
    if (open) await AsyncStorage.setItem(openKey(uid), '1');
    else await AsyncStorage.removeItem(openKey(uid));
  } catch {
    // Not remembered: the steps go back to opening in order.
  }
}

const videoKey = (uid: string) => `cc:video:${uid}`;

/** The day (as a day key) each skill's must-watch video was last watched to the end. */
export async function videoDays(uid: string): Promise<Partial<Record<Skill, string>>> {
  try {
    const raw = await AsyncStorage.getItem(videoKey(uid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function markVideoDay(uid: string, skill: Skill, day: string): Promise<void> {
  try {
    const days = await videoDays(uid);
    await AsyncStorage.setItem(videoKey(uid), JSON.stringify({ ...days, [skill]: day }));
  } catch {
    // Not remembered: the video is asked for again next time.
  }
}

const BAT_KEY = 'cc:withBat';
/**
 * Whether the learner practises with a bat (default) or without one. With a bat, the bat must be
 * seen: a stance whose bat cannot be found does not count, and the learner is told so.
 */
export async function getWithBat(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BAT_KEY)) !== 'no';
  } catch {
    return true;
  }
}
export async function setWithBat(withBat: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BAT_KEY, withBat ? 'yes' : 'no');
  } catch {
    // Not remembered: the next practice asks again, starting with a bat.
  }
}

const VIEW_KEY = 'cc:cameraView';
/** Where the learner puts the phone for camera practice: at the side (default) or in front. */
export async function getCameraView(): Promise<'front' | 'side'> {
  try {
    return (await AsyncStorage.getItem(VIEW_KEY)) === 'front' ? 'front' : 'side';
  } catch {
    return 'side';
  }
}
export async function setCameraView(view: 'front' | 'side'): Promise<void> {
  try {
    await AsyncStorage.setItem(VIEW_KEY, view);
  } catch {
    // Not remembered: the next practice starts with the side view again.
  }
}
