/** Shared constants and the day clock. */
export const LOGICAL_SIZE = 256;
/** One day and night in seconds of simulated time. */
export const DAY_SECONDS = 20 * 60;
/** Simulation ticks per second (Stick Ranger's native rate). */
export const TICK_HZ = 50;

export function dayNumber(elapsed: number): number {
  return Math.floor(elapsed / DAY_SECONDS) + 1;
}

export function dayFraction(elapsed: number): number {
  return (elapsed % DAY_SECONDS) / DAY_SECONDS;
}

/** 0 at night, up to 1 at noon. */
export function daylight(elapsed: number): number {
  return Math.max(0, Math.sin(dayFraction(elapsed) * Math.PI * 2));
}

/** Sleeping hours: the darkest part of the night. */
export function isNight(elapsed: number): boolean {
  const f = dayFraction(elapsed);
  return f > 0.6 && f < 0.9;
}
