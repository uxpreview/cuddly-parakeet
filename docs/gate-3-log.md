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

*(iteration 2, below)*
