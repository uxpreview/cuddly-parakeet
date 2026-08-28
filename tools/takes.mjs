// The Gate 3 takes. One place, so the recording harness and any analysis tool
// are looking at the same runs.
//
// A take is a deterministic script: a seed, a staging setup, and a timeline of
// commands in seconds. Nothing in it is improvised at record time, which is the
// whole point — two iterations of the critic loop differ only where the code
// differs.
//
// Route node indices for ch01-canyon (13 nodes):
//   0 wait/sniff (the swimming hole)      7 trot d
//   1 trot a                              8 hazard-wait (the fallen pine)
//   2 hazard-wait (the ford)              9 trot e
//   3 trot b                             10 wait/stand
//   4 look-back                          11 trot f
//   5 trot c                             12 near-miss
//   6 wait/stand

export const SEED = 20260828

/**
 * `at` entries are [seconds, method, ...args] against the page's `__rec` hook.
 * `setup` runs once before the clock starts, so a take opens on its beat rather
 * than on thirty seconds of walking to reach it.
 */
export const TAKES = [
  {
    id: 'walk',
    label: 'Walking, stopping, the whistle and its answer, trotting, look-backs',
    seconds: 15,
    fps: 30,
    // The reel Gate 3 asks for. He walks, stops dead and settles, whistles, the
    // answer arrives at the dog, and the dog trots on through a look-back node.
    // He opens CLOSE — inside the catch distance — so the take gets the gait,
    // the tail and the collar at reading size before the dog moves on ahead and
    // the whistle has something to answer from a distance.
    setup: [
      ['dogTo', 3],
      ['placeAtNode', 3, -9],
    ],
    at: [
      [0.0, 'steer', 'route', 5],
      [4.6, 'steer', 'stop'],
      [5.4, 'whistle'],
      [8.2, 'steer', 'route', 5],
    ],
  },
  {
    id: 'nearmiss',
    label: 'The near-miss: the approach, the held beat, the break away',
    seconds: 13,
    fps: 30,
    setup: [
      ['dogTo', 12],
      ['placeAtNode', 12, -22],
    ],
    at: [[0.0, 'steer', 'dog']],
  },
  {
    id: 'lookbacks',
    label: 'The three look-back variants, back to back',
    seconds: 12,
    fps: 30,
    // The chapter stages one look-back node; the variants cycle. Re-entering
    // the node is how all three get into one frame-comparable take.
    setup: [
      ['dogTo', 4],
      ['placeAtNode', 4, -14],
    ],
    at: [
      [0.0, 'steer', 'route', 5],
      [4.0, 'dogTo', 4],
      [8.0, 'dogTo', 4],
    ],
  },
  {
    id: 'ford',
    label: 'The hazard-wait at the ford: he is sitting there when the boy arrives',
    seconds: 14,
    fps: 30,
    setup: [
      ['dogTo', 2],
      ['placeAtNode', 2, -17],
    ],
    at: [
      [0.0, 'steer', 'route', 5],
      [9.0, 'whistle'],
    ],
  },
]

export const VIEWPORTS = {
  desktop: { width: 1280, height: 720, dsf: 1 },
  portrait: { width: 390, height: 844, dsf: 2 },
}
