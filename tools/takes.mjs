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
    // river on one side, wall on the other. He walks, whistles, the answer
    // arrives at the dog, he stops dead and settles, whistles again, and walks
    // on while the dog draws back out to his lead.
    //
    // The pair open SIX metres apart, not twelve, and the first whistle is at
    // t=3 rather than t=5.4. game-design.md's distance discipline is 20 to 45 m
    // at trot and it is not negotiable, so the dog is going to draw away — the
    // first pass simply let him do it for the whole take and every beat played
    // at eleven to twenty-four pixels of dog, which is a reel that cannot show
    // what Gate 3 asks it to show. Opening close and answering early puts the
    // two answers, which are now body events, inside the range where they read;
    // the back half of the take is where the lead re-establishes itself, which
    // is worth seeing too.
    setup: [
      ['dogTo', 1, 46],
      ['placeAtNode', 1, 40],
    ],
    at: [
      [0.0, 'steer', 'route', 5],
      [3.0, 'whistle'],
      [6.4, 'steer', 'stop'],
      [9.5, 'whistle'],
      [11.5, 'steer', 'route', 5],
    ],
  },
  {
    id: 'nearmiss',
    label: 'The near-miss: the approach, the play-bow, the break away',
    // 27, not 20. The critic read the escape as "dead straight and
    // un-occluded" three iterations running -- 19.3 m of travel with 10 cm of
    // lateral change -- and the reason is not that the staging is missing. The
    // escape path is the descending switchbacks (tools/build-ch01.mjs: it runs
    // from the near-miss node to the end of the route) and the bend is real;
    // the take simply stopped before he reached it. game-design.md wants the
    // fix to be staging rather than speed, and the staging was already there
    // and off the end of the recording.
    seconds: 27,
    fps: 30,
    // The near-miss node sits INSIDE the town-reveal camera's trigger volume,
    // which is right for the chapter — the reveal and the near-miss are the
    // same beat — and makes the dog unwatchable in a recording that is about
    // the dog. The framed moment is off for this take only.
    setup: [
      ['framed', false],
      ['dogTo', 12],
      // Twenty metres back, not eleven. The manifest's `approach` for this node
      // is 11 m, so staging the boy AT eleven opened the take with the bow
      // already two frames in and the closest approach in the whole recording
      // was 8.62 m -- there was no approach to judge, which is half of what the
      // must-confirm asks. Twenty gives about eight seconds of closing before
      // the beat fires.
      ['placeAtNode', 12, -20],
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
    // Seven metres behind the node, not eleven: at eleven the dog came back
    // twenty-five pixels tall and variants A and B could not be told apart,
    // which is the whole thing this take exists to show. Seven is still well
    // outside arm's reach, which is what story rule 4 asks for.
    setup: [['placeAtNode', 4, -7]],
    // The BOY goes back with him. Re-entering the node alone leaves the dog
    // standing where the boy has since walked to — a metre away by the third
    // variant, which is both unreadable and a breach of story rule 4. Resetting
    // the pair makes the take three clean repetitions of the same geometry,
    // which is what "visibly different" has to be judged against.
    at: [
      [0.0, 'steer', 'route', 5],
      [0.0, 'dogTo', 4],
      [4.3, 'dogTo', 4],
      [4.3, 'placeAtNode', 4, -7],
      [8.6, 'dogTo', 4],
      [8.6, 'placeAtNode', 4, -7],
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
