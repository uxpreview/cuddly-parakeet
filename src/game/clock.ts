// Time and randomness, in one place, so a run can be made repeatable.
//
// Gate 3 is judged from a RECORDING, and a recording only means anything if two
// iterations of the critic loop are comparable frame for frame. Everything that
// makes a run differ from the last one lives here: the wall clock the whistle
// times its answer against, and the random stream the dog schedules his glances
// and look-backs from.
//
// In play both are what they always were — `performance.now()` and
// `Math.random()`. `tools/record.mjs` switches them for a virtual clock stepped
// by a fixed timestep and a seeded stream, and nothing else in the codebase
// knows the difference. A shipped build never enters this mode: it is reached
// only from `?rec=`, which is dev-only, like `?dev`.

let virtual = false
let vnow = 0
let rngState = 0

/** Milliseconds. The wall clock in play; the virtual clock while recording. */
export function now(): number {
  return virtual ? vnow : performance.now()
}

/** 0..1. Math.random in play; a seeded stream while recording. */
export function rand(): number {
  if (!virtual) return Math.random()
  // mulberry32: small, fast, and good enough for scheduling glances.
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function isRecording(): boolean {
  return virtual
}

/** Enter deterministic mode. Called only by the record harness. */
export function beginRecording(seed: number): void {
  virtual = true
  vnow = 0
  rngState = seed | 0
}

/** Advance the virtual clock by `ms`. Returns the new time in milliseconds. */
export function tickVirtualClock(ms: number): number {
  vnow += ms
  return vnow
}
