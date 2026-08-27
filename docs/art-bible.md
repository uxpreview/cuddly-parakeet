# The Chapter 1 art bible

Gate 2's deliverable: one static scene, canyon at morning, with the documented
Chapter 1 palette applied. Nothing here is gameplay. Nothing here moves.

## Running it

```
npm run dev
# then open http://localhost:5173/?scene=art-bible
```

The buttons along the bottom switch viewpoints. `?shot=<id>` picks one directly
and `&bare=1` hides the buttons.

| shot | what it is for |
|---|---|
| `hero` | The gameplay camera, parked: 18 degrees, 6.5 m, 1.0 m look height. The frame the game is actually played in, so it is the frame the look has to survive. |
| `vista` | The frame nominated to carry the whole palette: both limestone values, the river, the rim pines and the sky in one picture. |
| `dog-read` | The dog at trail distance from the boy's eye height, on a long lens. Answers one question: does the eye find him, and the collar, at a glance. |
| `ford` | The chapter's water beat. The boy is in the crossing; the dog waits on the far side, which is story rule 2. |
| `prints` | The trail at reading distance, looking along it. Also the closest range the grain pass is ever seen at. |
| `town-reveal` | The `ch01-canyon` manifest's own framed camera, verbatim, with the dog staged where the near-miss node puts him. Not a generic viewpoint. |

## Reproducing the renders

```
npm run dev &                       # dev server on 5173
BASE=http://localhost:5173 OUT=renders/x npm run art
```

Writes every shot at 1600x900 and at 390x844 (19.5:9, iPhone 11 class — the
reference device in `docs/quality-bar.md`).

## The checks

```
npm run red-audit       # the Gate 2/5/6/7 red audit. Exit 0 = pass
npm run palette-check   # what the frames actually measure against the doc hexes
npm run gate1-check     # the grey-box gameplay path still boots
```

`red-audit` runs two passes: every colour literal in `src/`, `tools/` and the
chapter data, and then every material colour and every vertex colour in the
live scene. Its whitelist is read out of `src/art/palette.ts` so the audit and
the game cannot disagree about which two assets are allowed to be red.

`palette-check` reports both a histogram and per-hex frame coverage. The second
number is the one that matters: "largest distance from a documented hex" can be
satisfied by collapsing the whole palette onto one entry, and at one point was.
It takes a SHOT NAME, not a file path, and renders that shot live. Hand it
anything else and it refuses rather than quietly measuring the default frame,
which is a mistake that was made and produced numbers that looked real.

There are also diagnostics under `tools/dev/`, none of which are part of the
gate:

| tool | question it answers |
|---|---|
| `dogread.mjs` | Where each actor is staged, and whether the key light reaches them. This is the one that found the dog standing in a terrain shadow in all six shots. |
| `sunsweep.mjs` | How much of the canyon floor is in full sun, penumbra and shadow, per sun angle. Measured at the documented light: 58% full sun, 11% penumbra, 32% shadow. |
| `floaters.mjs` | How far every scatter instance sits from the ground under it. |
| `loadtime.mjs` | Build time, draw calls and triangle count. |
| `perf.mjs`, `probe.mjs`, `occ.mjs`, `spot.mjs`, `dbg.mjs` | Renderer counters and pixel probes. |

The art bible also accepts `?sunAz=` and `?sunEl=`, which rebuild the chapter at
a different key light. The baked occlusion is computed at load, so the sun angle
cannot be tuned from a uniform and this is the only way to measure it.

## Where things live

| file | what it owns |
|---|---|
| `src/art/palette.ts` | Every colour in the game. No component may write a hex literal. |
| `src/art/RampMaterial.ts` | The one material everything is shaded by, the sky, and fog. |
| `src/art/artTerrain.ts` | Lofting a cross-section along a centerline, and the primitive library. Knows nothing about canyons. |
| `src/art/characters.ts` | The boy and the dog. |
| `src/art/decals.ts` | Blob shadows and the print trail. |
| `src/art/Grain.tsx` | The single grain pass. |
| `src/art/shots.ts` | The fixed viewpoints and the staging. |
| `tools/build-ch01.mjs` | Chapter DATA. Emits the grey box exactly as Gate 1 did, and now the art terrain beside it. |

The chapter's look is `environment.artTerrain` in the manifest, a sibling of
`environment.terrain`. Collision and staging stay what Gate 1 signed off; a
chapter without the field renders as a grey box.
