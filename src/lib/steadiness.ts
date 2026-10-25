/**
 * Is the phone standing still?
 *
 * The pose camera needs a still phone: when the phone moves, the whole picture moves, the joints
 * jump and the stance score with them (field test, 24 October 2026). The phone's motion sensors
 * tell us when that happens, so the app can say so and stop counting until the phone is still.
 *
 *  - 'moving': the phone is turning or shaking (held in a hand, knocked, or not resting firmly).
 *  - 'flat':   the phone is lying on its back or its face, so the camera sees the floor or ceiling.
 *  - 'steady': the phone is standing still.
 */
export type PhoneState = 'steady' | 'moving' | 'flat';

/** Thresholds. Rotation in radians per second, acceleration in g (1 g is gravity). */
export const STEADY = {
  /** Turning faster than this (smoothed) counts as moving. */
  turnMoving: 0.3,
  /** It counts as still again below this. */
  turnStill: 0.12,
  /** A shake: the pull on the phone differs from gravity by this much (smoothed). */
  shakeMoving: 0.1,
  shakeStill: 0.04,
  /** Moving for this long before it is reported, so a quick tap on the screen does not count. */
  movingMs: 800,
  /** Still for this long before moving is cleared. */
  stillMs: 1000,
  /** Gravity this much along the screen's face means the phone is lying flat. */
  flatShare: 0.9,
  flatMs: 1500,
};

/**
 * The decision, without the sensors, so it can be tested. Feed it rotation and acceleration
 * readings with a time in milliseconds; `state` is the current verdict.
 */
export class SteadinessMeter {
  state: PhoneState = 'steady';
  private turn = 0;
  private shake = 0;
  private flatShare = 0;
  private movingSince = 0;
  private stillSince = 0;
  private flatSince = 0;
  private notFlatSince = 0;

  rotation(x: number, y: number, z: number, t: number) {
    const m = Math.hypot(x, y, z);
    this.turn += 0.3 * (m - this.turn);
    this.decide(t);
  }

  acceleration(x: number, y: number, z: number, t: number) {
    const g = Math.hypot(x, y, z);
    this.shake += 0.3 * (Math.abs(g - 1) - this.shake);
    if (g > 0.5) this.flatShare += 0.3 * (Math.abs(z) / g - this.flatShare);
    this.decide(t);
  }

  private decide(t: number) {
    const moving = this.turn > STEADY.turnMoving || this.shake > STEADY.shakeMoving;
    const still = this.turn < STEADY.turnStill && this.shake < STEADY.shakeStill;
    const flat = this.flatShare > STEADY.flatShare;

    if (moving) {
      this.stillSince = 0;
      if (!this.movingSince) this.movingSince = t;
    } else if (still) {
      this.movingSince = 0;
      if (!this.stillSince) this.stillSince = t;
    }
    if (flat) {
      this.notFlatSince = 0;
      if (!this.flatSince) this.flatSince = t;
    } else {
      this.flatSince = 0;
      if (!this.notFlatSince) this.notFlatSince = t;
    }

    if (this.flatSince && t - this.flatSince >= STEADY.flatMs) this.state = 'flat';
    else if (this.movingSince && t - this.movingSince >= STEADY.movingMs) this.state = 'moving';
    else if (this.state === 'moving' && this.stillSince && t - this.stillSince >= STEADY.stillMs) this.state = 'steady';
    else if (this.state === 'flat' && this.notFlatSince && t - this.notFlatSince >= 500) this.state = this.movingSince ? 'moving' : 'steady';
  }
}

