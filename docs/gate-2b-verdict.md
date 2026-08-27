# Gate 2 — critic verdict, second loop

Four iterations, **PASS**. All seven items on the Gate 2 failure list in
`docs/quality-bar.md` pass. The renders judged are `renders/gate2b-06/` (six
shots x two aspect ratios), which are checked in beside `renders/iter-07/` so
every claim in either document is checkable.

`docs/gate-2-verdict.md` is the record of the first loop, which failed at its
cap with three items open. This file is the record of the loop that closed
them. Nothing in the first verdict's "What is banked" list regressed.

## Failure list, item by item

| Gate 2 failure-list item | Result |
|---|---|
| Any red outside the collar | PASS |
| Toon outlines or cel-shading grammar | PASS |
| An object not identifiable by silhouette alone | PASS |
| Colours that drift from the documented palette hexes | PASS |
| Photo-real water, PBR surfaces, or visible image textures | PASS |
| Grain strong enough to consciously notice | PASS |
| The dog unreadable against the ground at a glance | PASS, thin |

## The three that were failing, and what closed them

**The dog read as a cat.** He is a dog now, at every range: broad skull with
muzzle mass, chest depth, a visible hock, pointed ears, white points. The
remodel is described in `decisions.md` D27; what the loop added on top of it was
the head. The ears were 11-12% of head height as flat blades meeting in a V on
top of the skull, which is a cockerel's comb; they are 15-20% now, thicker in
section, and rooted on the temple. There was no stop, so the outline ran
crown-to-chin as one convex curve and the muzzle did not exist however much
geometry was in it. And a white blade survived on the face — the muzzle loft
split along its waist, which at reading distance resolved as a pale lens with a
point at each end where the mouth belongs, 21x8 px in `dog-read-desktop`. There
is no white anywhere on the head now.

**The canyon floor never got the flat-shading fix.** It has it: `prints` y=600
now gives four face boundaries and a longest monotone run of 38 px carrying
3.0 L, against 850 px carrying 35 L unbroken in `iter-07`. The cause and the
cure are D24. Two intermediate attempts at the material boundary failed in
opposite directions and both are worth remembering: a per-face 3-D noise turned
an unsubdivided quad's choice into a coin flip and produced a two-tone
checkerboard with clean four-cell X-junctions sitting exactly on the mesh grid,
which advertises the topology and is worse than the ruled stripe it replaced;
and an amplitude measured in rungs swung the edge by whatever that rung happened
to be wide. Keyed on the sample index alone, the boundary is one wandering line
that cannot dither across the rungs.

**The wall mottle drew the shadow hex onto lit faces, in rectangles.** It was
not the mottle. Both baked marches — sun occlusion and sky visibility — started
ON the surface, and a 2 m heightfield cell containing a near-vertical cliff is
as tall as the rim, so every wall face shadowed itself and starved itself of
sky. See D25. Near-wall limestone share: `hero` 26% to **89.4% at mean dE 3.4**,
`vista` left 21.5% to **92.2% at dE 3.4**. The rectangle lattice is gone from
every large wall, and it had a second cause worth recording: both mottle octaves
were a one-dimensional noise of a linear combination of x, y and z, which is a
plane wave, and two plane waves crossing is a lattice.

## What the loop cost, and it was worth stating

Removing the false shadow exposed the opposite failure. With D16's ramp as
narrow as it is, every lit face renders one identical colour, so the near cliffs
came out as flat sheets: `hero`'s near-left wall gave 0-1 face boundaries across
630 px where `iter-07` gave 4-7. Three things were wrong at once — steep rungs
were never subdivided so the bedding relief had no interior vertices to act on,
the relief amplitude scaled with rung width so a bank with metre rungs got six
centimetres, and the lit-side Lambert term was too shallow to turn normals into
values. Column scans of `hero`'s near wall at x=100/300/500 now give 10/14/19
boundaries with run-length medians of 26/23/16 px, against 3/3/12 and 143/121/12
in `iter-07`.

That costs some palette tightness on the lit wall — 98.5% limestone at dE 2.8
becomes 89.4% at dE 3.4 — and the critic weighed it deliberately rather than
finding it: the wall renders UNDER the documented hex without leaving it
(`#D3B382`, hue 36 against limestone's 34). That is D16 and D26 working as
ruled. Only a face square to the key light renders the hex exactly.

**A method note that cost an iteration.** Bedding is horizontal, so a horizontal
scanline runs ALONG one stratum and reports a bedded wall as perfectly flat. A
whole round was spent chasing a flatness that was partly the instrument.
`tools/dev/scan.mjs` takes `--column`; use it on cliffs.

## What is banked

- **The red rule is still airtight.** Exactly one red cluster per frame across
  all twelve, every one on the dog's neck, 12 to 4087 px, 52-76% saturation
  after a blur.
- **No outlines.** Boy's shirt edge at `dog-read` y=250: one antialias pixel, no
  dark rim. Same at the dog's coat edge.
- **The grain is unchanged and correct.** SD 2.08-2.15 L, p99 4.6-4.7, lag-1
  spatial autocorrelation -0.12 to -0.15. White noise under 1% of range.
- **The collar is a strap and it survives distance.** Smallest in the set is
  6x4 px at 55% saturation after a 3 px blur, one coherent cluster, against the
  banked floor of 5x5 at 21%. It holds a minimum radius (D21) and now a minimum
  stroke: narrowing the band to stop it reading as a kerchief had taken its
  stroke at the radius floor to 0.78 px, which antialiases below the audit's own
  threshold.
- **Pine exists.** 31.5% of the tree band within dE 5.0 of `#4E6E58`, sampling
  `#516959`, against dE 27 and effectively absent.
- **The documented hexes land.** Dog coat 99.4% at dE 0.7, river dE 1.0, sky
  `#CEE2DF` against `#CFE3E0`.

## Owed to Gate 3, not Gate 2

Ranked by the critic, and none of them is an art failure.

1. **The hero shot is mis-staged.** In both ratios the dog stands directly on
   the boy's head — `hero-portrait` has the dog at y 800-910 and the boy's crown
   at 915. The frame that has to sell the art bible has its two characters
   fused. This is staging, not art; it predates this loop.
2. **Hairline sky-cracks through the cliff mesh**, 11-134 px a frame, worst in
   `ford-desktop`. T-junctions between loft strips subdivided into different
   face counts. One count per rung fixed the along-the-run case; what is left is
   at leg boundaries.
3. **The mid-distance buttresses plaid.** Horizontal strata crossed by vertical
   joints every 13-15 px. At 1:1 it reads as columnar jointing; at 3x it is a
   woven check. Break the vertical joint spacing.
4. One conspicuous right-angle notch in the floor's material boundary in `hero`,
   which reads as a cut-out rather than a bank.

## Still owed to Gate 1

Unchanged from the first verdict: the ford's water polygon fitting, the boy
standing dry on the water plane mid-channel, and the whole ford reach reading as
underexposure rather than as shade because there is no shadow edge anywhere in
the frame. The floating trapezoid in `town-reveal-portrait` now resolves as a
distant headland behind a bluff and is no longer a fault, though its flat lower
cut is still arbitrary.
