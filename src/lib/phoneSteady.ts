import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { SteadinessMeter, type PhoneState } from './steadiness';

export { SteadinessMeter, STEADY, type PhoneState } from './steadiness';

/**
 * Watches the phone's motion sensors while `active` is true. Phones without the sensors (and the
 * web) always read 'steady'. The returned ref holds the latest state for code that runs every
 * frame; the state value re-renders the screen when it changes.
 */
export function usePhoneSteadiness(active: boolean): { state: PhoneState; ref: React.MutableRefObject<PhoneState> } {
  const [state, setState] = useState<PhoneState>('steady');
  const ref = useRef<PhoneState>('steady');

  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    let alive = true;
    const subs: { remove(): void }[] = [];
    const meter = new SteadinessMeter();
    const update = () => {
      if (meter.state !== ref.current) {
        ref.current = meter.state;
        setState(meter.state);
      }
    };
    (async () => {
      try {
        // Loaded here, so a phone or build without the sensor module still runs the app.
        const { Accelerometer, Gyroscope } = await import('expo-sensors');
        const [gyro, acc] = await Promise.all([Gyroscope.isAvailableAsync().catch(() => false), Accelerometer.isAvailableAsync().catch(() => false)]);
        if (!alive) return;
        if (gyro) {
          Gyroscope.setUpdateInterval(100);
          subs.push(Gyroscope.addListener(({ x, y, z }) => { meter.rotation(x, y, z, Date.now()); update(); }));
        }
        if (acc) {
          Accelerometer.setUpdateInterval(100);
          subs.push(Accelerometer.addListener(({ x, y, z }) => { meter.acceleration(x, y, z, Date.now()); update(); }));
        }
      } catch {
        // No sensors: treat the phone as steady.
      }
    })();
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
      ref.current = 'steady';
      setState('steady');
    };
  }, [active]);

  return { state, ref };
}

export const PHONE_MESSAGE: Record<Exclude<PhoneState, 'steady'>, { title: string; detail: string; say: string }> = {
  moving: {
    title: 'The phone is moving',
    detail: 'Rest it against something steady, like a bag, a wall or a chair, so it does not move. Nothing is counted while it moves.',
    say: 'The phone is moving. Rest it against something steady, so I can see you clearly.',
  },
  flat: {
    title: 'The phone is lying flat',
    detail: 'Stand the phone up on its side or end, so the camera looks at you, not at the floor or the ceiling.',
    say: 'The phone is lying flat. Stand it up so the camera can see you.',
  },
};
