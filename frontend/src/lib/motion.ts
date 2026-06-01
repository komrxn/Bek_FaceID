/**
 * Single source of truth for motion tokens.
 *
 * Never inline a magic duration or spring in a component — import from here.
 * Calm-authoritative feel: `spring.calm` for card entrances, `spring.snap`
 * for button presses, `spring.authority` for the success settle, `spring.whisper`
 * for ambient drift / pulses.
 */

export const duration = {
  fast: 0.15,
  base: 0.24,
  slow: 0.36,
  hero: 0.52,
} as const;

export const easing = {
  emphasized: [0.2, 0, 0, 1] as [number, number, number, number],
  standard: [0.4, 0, 0.2, 1] as [number, number, number, number],
  decelerated: [0, 0, 0.2, 1] as [number, number, number, number],
  accelerated: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

export const spring = {
  calm:      { type: "spring", stiffness: 170, damping: 26 },
  authority: { type: "spring", stiffness: 220, damping: 30 },
  snap:      { type: "spring", stiffness: 380, damping: 32 },
  whisper:   { type: "spring", stiffness: 90,  damping: 22 },
} as const;
