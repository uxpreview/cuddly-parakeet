# Gate 2 — critic verdict at the iteration cap

Eight iterations, cap reached, **FAIL**. Three of the seven Gate 2 failure-list
items in `docs/quality-bar.md` still fail. The renders judged are
`renders/iter-07/` (six shots x two aspect ratios).

This file is the record of what the human is being handed. It is the critic's
verdict, not a plan; nothing in it has been acted on.

## Failure list, item by item

| Gate 2 failure-list item | Result |
|---|---|
| Any red outside the collar | PASS |
| Toon outlines or cel-shading grammar | PASS |
| An object not identifiable by silhouette alone | **FAIL** |
| Colours that drift from the documented palette hexes | **FAIL** |
| Photo-real water, PBR surfaces, or visible image textures | **FAIL** |
| Grain strong enough to consciously notice | PASS |
| The dog unreadable against the ground at a glance | PASS, thin |

## The three failures

**The dog reads as a cat.** Slender tubular body, arched back, thin high-set
S-hooked tail, four spindly legs of uniform diameter with no elbow or hock, a
small wedge head with tall ears set high and wide, no muzzle mass, no chest
depth, no shoulder. `art-direction.md` asks for "compact, pointed ears"; the
model is elongated and fine-boned. Worst at `dog-read-desktop.png` x650-960,
y320-570, where the resolution is highest. For a game about a boy following his
dog, the actor reading as the wrong species is the most expensive possible place
to fail the silhouette test. It is also the clearest single item of work left.

**The canyon floor never got the flat-shading fix.** It landed on the walls, the
props and both characters — `vista-desktop.png` y=300 crosses faces of 299, 44,
38 and 62 px with internal luminance ranges of 1.7 to 3.5 L, which is right. The
floor did not: `prints-desktop.png` y=600 runs **850 px with no face boundary at
all**, climbing smoothly 194.1 to 229.3. Longest plateau 2 px; flat fraction
7.5% against the wall's 16.4%. Not fog — `hero-desktop.png` y=360 ramps +22.0,
then -10.9, then +10.7 across adjacent faces at near-equal depth, and fog is
monotone with depth. This is the largest surface in every frame and the one the
dog and the prints have to read against.

**The wall mottle draws the shadow hex onto lit faces, in rectangles.** Share of
the near wall in the desaturated family (mean `#A4A89B`, the documented shade)
versus the warm limestone family: `hero-desktop` left wall **77.2% vs 9.4%**,
`vista-desktop` right wall **82.6% vs 0.1%**, `vista-desktop` left wall 49.1% vs
36.9%. Where the sun cleanly hits, the hex is exact — `vista-desktop.png`
(1450,470) measures `#E4C18C` against `#E3C08C`. The problem is distribution.
And the blocks are axis-aligned rectangles whose screen size barely changes with
distance (`vista-portrait` left wall: 25 px median near, 33 px mid, 22 px far),
so they read as an applied tiling pattern rather than as strata. That is what
trips the "visible image textures" item.

Also drifting: pine renders `#44584B` against the documented `#4E6E58`, dE about
27, present in 0.0-1.8% of every frame — the hex is effectively absent. The
close-up dog coat overshoots the other way, `#F8F3E9` at L=243 against the
spec's L=214.6, so at `dog-read` range he is white rather than warm cream. In
`hero-desktop.png` the same material measures L=214.0, exact.

## What is banked

- **The red rule is airtight.** Independent scan of all twelve frames, hue
  350-15 with sat >= 25% and val >= 20%: exactly one cluster per frame, every
  one on the dog's neck, 8 to 5387 px. Zero red anywhere else. The town survived
  — its roofs measure hue 26.1 and 26.8 at 31-32% saturation, clearly orange.
- **No outlines, no cel grammar.** Edge profile across the boy's shorts:
  96, 96, 97, 98, 97, 96, 95, 98, 96, 96, 97, 100, 165, 226, 227, 230 — one
  antialias pixel, no dark rim. Same at both of the dog's body edges.
- **The grain is right.** SD 2.17-2.53 L (0.85-0.99% of range), p99 residual 5
  levels, lag-1 spatial autocorrelation -0.04 to +0.20 — per-pixel white noise,
  not a structured pattern. Do not increase it.
- **The prints are a readable trail.** 30.4% contrast at the near end, still
  13-17% at the far end of the visible track. This is the navigation system and
  it now works.
- **The collar is found at every range.** Never smaller than 5x5 px, never below
  21% saturation after a 3 px blur, and always the only saturated warm object in
  a frame whose median saturation is 11-21%.
- **The shadow-staging catastrophe is gone.** Both actors now stand on ground at
  94-99% of their frame's lit-floor value in most shots. Residual: in `hero` the
  boy is at 99% and the dog at 91%, in the frame named for him.
- **Documented hexes land exactly** where the light is clean: river `#4E8F86`
  measured `#4E8F86`, sky `#CFE3E0` measured `#CEE2DF`, limestone `#E3C08C`
  measured `#E4C18C`, the boy's shirt and shorts both exact.
- **Portrait is composed, not cropped.** `vista-portrait.png` and
  `town-reveal-portrait.png` are the strongest frames in the set, and the town
  reveal does its narrative job — which was the Gate 1 carry-over.

## What needs the human, not another iteration

**The coat and the gravel.** With the staging bug removed, the honest
coat-to-ground luminance delta is 5.2% to 11.8%, up from about 3%. The collar
demonstrably compensates. But at mid-range the dog's body is still a pale smudge
on pale gravel — in `vista-desktop.png` he is 34x24 px at 5.7% contrast and the
only thing that finds him is a five-pixel red dot. The question is whether
`#E5D5BC` and `#EFE3C8` stay as documented, accepting that the collar alone
carries him at range. The critic leans yes, because the design intent is
explicit and it works. It should be decided deliberately rather than by default.

**Derived hexes that are not in `art-direction.md`** and want blessing or
replacement: the town roof `#C79877` (Chapter 2's documented `#C4763F` was a
palette borrow that beat the collar 616:1 on saturated area, so it had to go,
but the replacement is invented), deadwood, scrub, the two river depths, town
stone, the sea, and the print colour `#959780` — which is not derivable from any
documented hex and should either enter the palette or be derived from the path.

**Chapter 2's roof hex, seen early.** It passes the audit with margin and is not
a violation. But it is the only thing in the game that competes chromatically
with the collar, and raising the town's saturation or lowering the fog later
would bring it closer to the band.

## Geometry, which belongs to Gate 1

- The ford's water surface is an ill-fitted polygon: straight cuts, sawtooth
  notches at the bank, exposed pale wetstone shelves, and in `ford-desktop.png`
  the boy stands dry on top of the water plane mid-channel at (1075,510),
  casting a contact shadow onto it. This is the water fitting in
  `tools/build-ch01.mjs`.
- The whole ford reach — 24 m of canyon — is genuinely wall-shadowed at the
  documented key light. Measured across the entire channel, not assumed. It
  reads as underexposure rather than as shade because there is no shadow EDGE
  anywhere in the frame.
- A floating trapezoid with a hard lower edge sits in the haze above the sea in
  `town-reveal-portrait.png` at about (60,280)-(200,340).
