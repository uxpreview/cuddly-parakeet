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
    // The reel Gate 3 asks for, staged on the open bank below the first bend —
    // river on one side, wall on the other, and enough room that the dog is at
    // reading size for the whole take. He walks, stops dead and settles,
    // whistles, the answer arrives at the dog, and the dog trots on.
    setup: [
      ['dogTo', 1, 52],
      ['placeAtNode', 1, 40],
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
    label: 'The near-miss: the approach, the play-bow, the break away',
    seconds: 16,
    fps: 30,
    // The near-miss node sits INSIDE the town-reveal camera's trigger volume,
    // which is right for the chapter — the reveal and the near-miss are the
    // same beat — and makes the dog unwatchable in a recording that is about
    // the dog. The framed moment is off for this take only.
    setup: [
      ['framed', false],
      ['dogTo', 12],
      ['placeAtNode', 12, -15],
    ],
    at: [[0.0, 'steer', 'dog']],
  },
  {
    id: 'lookbacks',
    label: 'The three look-back variants, back to back',
    seconds: 13,
    fps: 30,
    // The chapter stages one look-back node, on the gravel bar; the variants
    // cycle. Re-entering the node is how all three get into one frame-comparable
    // take.
    // The dog enters the node at t=0, not in the setup: the harness settles for
    // three quarters of a second before the clock starts, and variant A only
    // lasts 0.85, so a look-back staged in the setup is over before frame 0.
    setup: [['placeAtNode', 4, -11]],
    // The BOY goes back with him. Re-entering the node alone leaves the dog
    // standing where the boy has since walked to — a metre away by the third
    // variant, which is both unreadable and a breach of story rule 4. Resetting
    // the pair makes the take three clean repetitions of the same geometry,
    // which is what "visibly different" has to be judged against.
    at: [
      [0.0, 'steer', 'route', 5],
      [0.0, 'dogTo', 4],
      [4.3, 'dogTo', 4],
      [4.3, 'placeAtNode', 4, -11],
      [8.6, 'dogTo', 4],
      [8.6, 'placeAtNode', 4, -11],
    ],
  },
  {
    id: 'ford',
    label: 'The hazard-wait: he is sitting at the water when the boy arrives',
    seconds: 15,
    fps: 30,
    setup: [
      ['dogTo', 2],
      ['placeAtNode', 2, -19],
    ],
    at: [
      [0.0, 'steer', 'route', 5],
      [9.5, 'whistle'],
    ],
  },
]

// The recording viewport. 960x540 for the critic loop, because the whole canyon
// is 355k triangles through a software rasteriser and the frame cost is
// fill-rate bound: at 1280x720 a fifteen-second take was ten minutes, which is
// an hour a critic iteration and would have set the cap rather than the work
// doing it. `WIDE=1` shoots the delivery set at 1280x720.
export const VIEWPORTS = {
  desktop: process.env.WIDE
    ? { width: 1280, height: 720, dsf: 1 }
    : { width: 960, height: 540, dsf: 1 },
  portrait: process.env.WIDE
    ? { width: 390, height: 844, dsf: 2 }
    : { width: 390, height: 844, dsf: 1 },
}
