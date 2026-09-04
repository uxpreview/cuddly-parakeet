// The print trail's spawn queue.
//
// Prints are not sampled off a moving position every so many metres. They are
// spawned BY footfalls: the gait solver plants a foot at a world position and
// pushes one print there, facing the way that foot was pointing. That is what
// makes "footprints land in step and alternate correctly, pawprints match his
// gait" a property of the animation rather than a coincidence between two
// independent counters.
//
// The renderer (src/components/Prints.tsx) drains this each frame. Lifetimes
// are game-design.md's per D6: the dog's hold about 40 seconds, twice the
// boy's.

export type PrintKind = 'dog' | 'boy'

export interface PrintSpawn {
  kind: PrintKind
  x: number
  y: number
  z: number
  heading: number
}

const queue: PrintSpawn[] = []

/** Something that wants to hear a footfall as it happens (the audio). */
let listener: ((p: PrintSpawn) => void) | null = null
export function setPrintListener(fn: ((p: PrintSpawn) => void) | null): void {
  listener = fn
}

/**
 * A second copy of every spawn, for the recording harness only. The gait
 * measurements in tools/dev/gait.mjs are checked against the prints the game
 * actually laid down, not against a reconstruction of where it should have.
 */
const log: PrintSpawn[] = []

export function pushPrint(
  kind: PrintKind,
  x: number,
  y: number,
  z: number,
  heading: number,
): void {
  // A bounded queue: if the renderer is not mounted, prints must not pile up
  // forever. Anything past this is older than the oldest print's lifetime.
  if (queue.length > 64) queue.shift()
  const p = { kind, x, y, z, heading }
  queue.push(p)
  if (log.length > 32) log.shift()
  log.push(p)
  if (listener) listener(p)
}

/** Drains the harness log. Called only from the record probe. */
export function drainPrintLog(): PrintSpawn[] {
  const out = log.slice()
  log.length = 0
  return out
}

export function drainPrints(out: PrintSpawn[]): void {
  for (const p of queue) out.push(p)
  queue.length = 0
}

export function clearPrints(): void {
  queue.length = 0
}
