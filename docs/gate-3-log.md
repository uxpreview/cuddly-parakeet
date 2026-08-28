# Gate 3 — the critic loop

One entry per iteration: what the critic failed, and what changed in response.
The brief is `docs/gate-3-critic-brief.md`. Cap is six iterations.

---

## Iteration 1 — `renders/g3-01/` — **FAILS** (4 of 6 must-confirms)

| # | Must-confirm | Verdict |
|---|---|---|
| 1 | Boy has weight, stopping settles, no foot sliding | **FAIL** |
| 2 | Footprints alternate; pawprints match his gait | PASS |
| 3 | Three visibly different look-back variants | **FAIL** |
| 4 | Near-miss reads as staged, not rubber-banded | **FAIL** |
| 5 | Whistle answer has a visual correlate, legible muted | **FAIL** |
| 6 | Tail language at trot and at wait | PASS (thin) |

### What failed

**1. Weight.** The sole telemetry is fine (0.1 mm p50 planted, 0.27 s / 14 cm
stop, legs close). Three things break the read anyway:
- The boy has **no blob shadow and no contact darkening**. The art bible added
  them by hand in `ArtBible.tsx`; the gameplay boy never got them. The dog has
  one. `art-direction.md` requires both.
- The **arm swing is invisible from the game's own camera**: 0.62 rad about X,
  swung toward and away from a camera sitting directly behind. One to two pixels
  across a full stride.
- An **8 px single-frame camera jolt** at `walk` f153→f154, at speed 0.00 —
  inside the one beat that exists to prove he settles.

**3. Look-backs.** C reads. A and B are the same picture at play size: B's whole
differentiation is 0.34 rad of hip yaw and a 5.5 cm paw lift on a dog 25 px
tall. In the `walk` reel B plays at **11 px**.

**4. Near-miss.** The play-bow tucks the collar under the dog's own back: the
red-audit predicate finds **0 red pixels for 0.93 s** (f124–f152) across the
payoff beat. The escape is `sp = 2.8` hard-held to three digits for **10.2 s**
in a dead-straight corridor with no occluder — `game-design.md` says the fix for
"looks like the game cheating" is staging, not speed. The 3.6 s hold before it
is frozen to three decimals: no weight shift, no head drift. And he runs six
seconds without one look-back.

**5. Whistle correlate.** All three channels are engineered invisible: the birds
are `CH1.pine` fired at a pine treeline (+45 px of the same hex on a frame that
already holds 87); the dust is `CH1.path` on the path; the dog's own reaction is
a `flick` — 0.45 s of head yaw on a 15 px dog.

**6. Tail.** Passes, but amplitude is identical (0.42) at trot and at wait, so
only lift and rate carry it, and 1.6 rad/s is one sweep per four seconds.

### Broken beyond the six

1. **Banked regression — the collar dies at range.** Gate 2 banked a 5x5 px /
   21 % floor. In the `walk` reel the cluster falls to 4 px at f265, 3 px at
   f270, **0 px from f275**, then strobes on and off to the end.
2. **Banked regression — dog/ground separation.** Median luminance of dog
   against local ground: 3.7 L (`lookbacks` 9.20 s), 5.9 L (`ford` 13.60 s), on
   a grain floor of SD 2.1 L.
3. The dog's blob shadow is a hard near-black ellipse — the darkest mark in a
   pale palette. Reads as a puncture.
4. **The Gate 2 carried fusion item, reproduced**: `ford` f449 has the dog's
   paws at y≈270 and the boy's crown at y≈269.
5. The dog's pawprint trail is a continuous serrated ribbon (212 prints in
   15.8 s at 26.9 cm) — waypoint grammar, which the standing prohibitions ban.
6. **The reel never stages the dog large enough to perform**: 11–24 px in a
   540 px frame, 2–4.4 % of frame height, across `walk`, `nearmiss` and
   `lookbacks`. Gate 3 is the gate that proves his vocabulary reads.
7. In the whole `walk` reel the gap only ever opens: 11.1 → 29.2 m,
   monotonically, including the 3.2 s the boy stands still. No bend, no wait.
8. The ford water does not break where he wades it.
9. The whistle press does not read from behind: the hand-to-mouth rotates on the
   camera's depth axis.

### What changed in response

See iteration 2.

---

## Iteration 2 — `renders/g3-02/`

Every number below is measured through the game's own camera at 960x540.

### Must-confirm 5 — the whistle correlate

| | before | after |
|---|---|---|
| bird colour | `CH1.pine`, fired at a pine treeline | `BOY.hair` |
| dust colour | `CH1.path`, lifted off the path | `CH1.limestoneShadow` |
| bird span at 20 m | ~6 px | **21.0 px** (11 px floor, same argument as D21) |
| bird rise | 7-14 m, into the canopy | 11-19 m, clear into sky |
| dog's own answer at trot | `flick`, 0.45 s of head yaw | full bark-bounce, and he **stops** |

`story.md` gives Chapter 1 answers that are "clean, close and honest", so a
canyon answer that cannot be seen is not a small miss.

### Must-confirm 1 — weight and the settle

The boy's **standing slack is 0.0000 m**: his legs are exactly as long as his
hip is high (`tools/dev/legroom.mjs`). That is correct anatomy, and it means the
support solve is always working against full extension, so every stance width
asks the body down. With `maxDip` at 0.12 he spent the whole 0.8 s of his
closing step 120 mm *into the ground* and then popped back out in one frame.

|  | before | after |
|---|---|---|
| worst single-frame support step, at rest | 120.1 mm | **14.2 mm** |
| at-rest support range | 120.1 mm | **55.1 mm** |

Four changes: a landing foot ramps into the constraint; a foot that would pull
the body past the dip budget stops voting instead of being clamped (a walker
lets the heel lift, he does not squat); the height is rate-limited before the
solve, never after it; and the boy's `maxDip` drops to 0.055.

Both actors also now have the blob shadow and contact darkening
`art-direction.md` has always required. **Neither gameplay actor had ever had
one** — the art bible placed them by hand in `ArtBible.tsx` and the game never
did. And the arm swing, 0.62 rad about the camera's own depth axis, now carries
a lateral component.

### Must-confirm 3 — the look-backs

Separated by what the LEGS do, which survives at any size, rather than by
degrees of hip yaw which do not:

| | A, the glance | B, the check | C, the stop |
|---|---|---|---|
| speed cap | 1.2 m/s, keeps trotting | **0.18 m/s, pulls up** | 0.15 m/s, stops |
| body yaw | 0 | 0.62 | 0.95 |
| forepaw | — | held up, 0.13 | — |
| duration | 0.85 s | 1.15 s | 1.6 s |

### Must-confirm 4 — the near-miss

- The escape was `sp = 2.8`, flat to three digits, for 10.2 s. It has a shape
  now — hard off the mark, easing as the gap opens, given back at every
  look-back. Peak unchanged; average lower. `game-design.md` is explicit that
  the fix for "looks like the game cheating" is staging and timing, not speed.
- He looked back **once** in six seconds of escape. Now every 2.2-3.6 s.
- The 3.6 s hold was pinned to three decimals. He has a weight shift, carried on
  the body over his planted feet rather than on the root, so the idle is not
  bought back in foot-slide.
- The play-bow no longer tucks the collar under his own back: the neck comes
  back up out of the bow, further than the body went down.

### The banked collar

Floors raised to 4.0 px radius and 4.4 px stroke. The short axis is the one that
fails, and it fails at every range, not only far away. `tools/dev/collarrange.mjs`:

| range | bbox | sat | | range | bbox | sat |
|---|---|---|---|---|---|---|
| 3.1 m | 12x10 | 68% | | 21.6 m | 5x4 | 67% |
| 5.1 m | 10x8 | 66% | | 26.6 m | 5x5 | 63% |
| 8.4 m | 7x5 | 69% | | 31.6 m | 5x6 | 66% |
| 13.5 m | 6x5 | 65% | | 35.9 m | 6x7 | 65% |
| 17.6 m | 5x4 | 67% | | | | |

Never under five pixels wide, never zero, never fewer than sixteen red pixels,
against iteration 1's 1 px and 0 px.

### Staging

- A waiting dog sits **beside** the route, not on it. The ford had his paws at
  y=270 and the boy's crown at y=269 — the Gate 2 hero-shot fusion, reproduced
  by the actor rather than by a camera. Derived from the route, so chapters 2 to
  4 inherit it without engine work.
- The dog lays prints from his **fore feet only**. A trotting dog direct-registers
  — the hind foot lands in the fore print. 212 prints in 15.8 s at a 26.9 cm gap
  was an unbroken serrated ribbon, which is waypoint grammar.
- The takes open closer and whistle earlier so the beats play where they read.
  The 20-45 m lead discipline (`game-design.md`) is untouched.

### Not addressed in this iteration, and why

- **Dog-against-ground value separation.** The palette is settled and I was told
  not to re-open it. The two changes that bear on findability were made instead:
  the collar floor, and a contact shadow that had never existed. Re-measured
  below.
- **The ford water does not break where he wades it.** Real, and out of scope
  for a gate about the two characters. Carried forward.
- **The boy has no hands.** Modelling, not animation. Carried forward.

### Measured after re-recording — `renders/g3-03/`

`renders/g3-02` was discarded: source changed while its last take was recording,
so it was a mixed build. `g3-03` is a clean one.

| | iteration 1 | `g3-03` |
|---|---|---|
| collar, `walk` f275 | **1 px, 1x1** | **19 px, 5x4 @ 63%** |
| collar across the `walk` take | 1-7 px, strobing to zero | 16-39 px, 4x4 to 10x5, 56-73% |
| collar through the play-bow | **0 red px for 0.93 s** | 27-35 px, 6x7 to 7x5, 59-75% |
| worst support step at rest | 120.1 mm | 16.7 mm (`walk`), 0.0 elsewhere |
| dog prints, `walk` | 212 in 15.8 s | 97 |
| boy's arm, lateral excursion | fore-aft only | 62 mm peak to peak |
| whistle correlate, peak bird span | ~6 px of hairline | 36.9 px, plus dust at his feet |
| dog on screen, `lookbacks` | 25 px | 28-40 px |
| dog on screen, `ford` | — | 16-40 px |
| dog range, `walk` | 11.1 -> 29.2 m, monotonic | 5.0-20.1 m |

The whistle answer as a body event, measured across `walk` t=4.6 to 6.6 s: dog
speed 2.40 -> 0.23 m/s, `look` 0.00 -> 1.00, and the gap stops opening (7.4 ->
7.1 m) instead of widening. The play-bow reads in profile — chest down, rear up,
collar bright — where iteration 1 had a featureless pale lozenge with the red
switched off.

### Gate 2 has not regressed

A pixel diff against `renders/gate2b-06` is the wrong test: the ford was rebuilt
and the dog's staging yaw was fixed in earlier Gate 3 commits, both deliberately,
so 60-89% of every frame differs by design. The Gate 2 *measurements* are the
test, and all six shots were re-shot at both aspect ratios into
`renders/g3-gate2check/`:

- **Red audit: PASS.** No red outside the collar.
- **Seams: 0 px in all six shots.** The carried Gate 2 item — hairline sky-cracks
  through the cliff mesh, 11 to 134 px a frame, worst in `ford-desktop` — is paid.
- **The collar clears the banked floor everywhere.** Smallest coherent cluster in
  the set is now 9x6 px at 54% saturation, against Gate 2's banked smallest of
  6x4 at 55% and the floor of 5x5 at 21%.
- **The documented hexes still land**: limestone 18.2% within dE 10, path 24.2%,
  limestone shadow 8.3%, river 4.7%, pine 1.6%, sky zenith 1.6%.
- **The hero shot's fusion is gone.** The dog and the boy are separated in both
  axes; he is no longer standing on the boy's head.


---

## Iteration 2 — `renders/g3-04/` — **FAILS** (4 of 6 must-confirms)

| # | Must-confirm | Iter 1 | Iter 2 |
|---|---|---|---|
| 1 | Boy has weight, stopping settles, no foot sliding | FAIL | **PASS** (thin) |
| 2 | Footprints alternate; pawprints match his gait | PASS | **PASS** |
| 3 | Three visibly different look-back variants | FAIL | **FAIL** |
| 4 | Near-miss reads as staged, not rubber-banded | FAIL | **FAIL** |
| 5 | Whistle answer has a visual correlate, legible muted | FAIL | **FAIL** |
| 6 | Tail language at trot and at wait | PASS | **FAIL** |

Must-confirm 6 regressed on the critic's own iteration-1 reservation, which I
recorded and did not act on: the tail amplitude is identical at trot and at wait.
That is my omission, not a change in the code.

### What failed

**3. Look-backs.** `dogAnim.look` never drops below **0.122 in the whole 13 s
`lookbacks` take** and sits at or above 0.9 on 80% of frames — his head is welded
backwards, so there is no event to be a variant OF. The variants are separated
almost entirely by speed cap, and ordinary `trot` in the same take runs at
0.15 m/s (f27–f74), which is variant C's cap. `nearmiss` plays variant 0 five
times at exactly 0.80 s and exactly 1.45 m/s — a metronome.

**4. Near-miss.** There is no approach: the take opens at a 10.96 m gap with the
bow already rising, and the closest approach in the whole take is **8.62 m**.
The payoff plays at 22–24 px on a dead-straight open plateau with the horizon
visible for all 16 s — no occluder, no bend, so `game-design.md`'s prescribed
fix (staging, not speed) has not been applied; only the speed profile changed.
The escape then holds station at 15.2–16.7 m, inside his ordinary trot lead.

**5. Whistle correlate.** Legibility is fixed — 7 birds, 28–40 px, 0.95 opacity,
and the dog's own body event (2.39 → 0.17 m/s, `look` 0 → 1). What is drawn
fails: the birds are wingless dark crescents (one measures 26x5 px), they are
**the darkest marks in the frame** (cluster mean 71–80 L against a ground median
of ~225, tied with the boy's hair), and at 28–40 px they are **bigger than the
26–28 px dog**, hovering dead centre above his exact position. "The answer gives
a direction, never a marker" — that is a marker.

**6. Tail.** `tailAmp` is exactly 0.420 at trot and exactly 0.420 at the ford
hazard-wait; only rate carries, and 1.60 rad/s is one sweep per 3.9 s. Worse,
the tail cannot be located on screen at all, even at the largest staging in the
set (35 px), in a fresh PNG re-render.

### Broken beyond the six

1. **The dog teleports 0.95 m on screen — a regression iteration 2 introduced.**
   `ford` f381→f382, one frame: 44 px sideways on a dog 34 px tall, in the open,
   with a simultaneous pose change. `game-design.md`: "He only teleports while
   fully occluded, never on screen." Cause is my own beside-the-route fix: he
   waits at `waitOffset(...)` and `advance()` snaps him back to `route.pointAt`.
2. **The Gate 2 fusion item is back and is now the reel's dominant composition.**
   `ford` f434: dog's feet at y=274, boy's crown at y=274 — **zero clearance**.
   In `lookbacks` the dog's screen x stays inside 475–482 for the entire take
   while the boy is drawn at 467–494: one vertical column for 13 s.
3. **The dog does not separate from the ground.** `lookbacks` f282: dog median
   194.7 L against local ground 194.7 L — **0.0 L**, on a grain SD of 2.1.
   Iteration 1 raised this at 3.7 L and I declined it as palette. The critic's
   answer: the palette is closed, the *staging* is not, and he is on the pale
   path in every frame of every take.
4. **The hazard-wait is a statue.** The dog's world position is a single value to
   four decimals across all 382 frames of the ford wait. The near-miss hold got
   an authored weight shift in iteration 2; the node carrying story rule 2 got
   nothing.
5. **The whistle press is unreadable**: a skin-coloured stump swells out of the
   shoulder, has no hand, never reaches his face.
6. The collar has become a **bib** — 41% of dog height at `ford` f60. The raised
   floors only bite because the reel stages him at 15–24 px.

### What held

Collar at range, collar through the play-bow, the settle jolt, the boy's contact
shadow, the arm swing mechanically, the escape's speed shaping, and the print
density numerically (212 → 98, 26.9 → 34.0 cm).

### What changed in response

*(iteration 3, below)*
