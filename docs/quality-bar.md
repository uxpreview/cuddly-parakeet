# Quality bar: The Long Way Home

Draft 2. Gates are sequential. Do not advance until the current gate passes.
At each gate, report with a screenshot or recording and one paragraph, then
stop and wait for the human.

Every loop has an iteration cap. On hitting a cap, stop and report what is
still wrong rather than continuing silently. Open-ended loops drift and quietly
undo earlier work.

---

## Gate 1: Grey box, Chapter 1

Untextured geometry, no art, no audio. What must exist: walking with authored
pace, the dog actor running a real route with trot, hazard-wait, look-back and
one near-miss node, the whistle loop with a placeholder answer cue, pawprint
placeholders.

**Passes when:** the human plays Chapter 1 start to finish in grey boxes and
following the dog is compelling for the full eight minutes. Judged by the
human, not by an agent. If the chase is boring in grey boxes, art will not
save it, and this is the cheapest moment the project will ever have to find
that out.

Also verify here, because it is structural: the near-miss reads as *almost*
and never as the game cheating.

## Gate 2: Art bible

One static scene, canyon at morning: terrain, water, pines, both characters,
pawprints, the palette applied.

**Critic loop.** A separate critic sub-agent judges renders against
`docs/art-direction.md`. Harsh, no close enough. Fail on any of:

- Any red outside the collar (see the automated audit below, which also runs here)
- Toon outlines or cel-shading grammar
- An object not identifiable by silhouette alone
- Colors that drift from the documented palette hexes
- Photo-real water, PBR-looking surfaces, or visible image textures
- Grain strong enough to consciously notice
- The dog unreadable against the ground at a glance

**Cap: 8 iterations**, then report remaining gaps.

## Gate 3: The two characters

Movement, gait states, footprints, the dog's full node vocabulary, the camera.

**Critic loop.** Critic reviews a 15 second recording of walking, stopping,
whistling, and the dog answering, trotting, look-backs and one near-miss.
Must confirm:

- The boy has weight, stopping settles, no foot sliding
- Footprints land in step and alternate correctly, pawprints match his gait
- Three look-back variants visibly different in the recording
- The near-miss escape reads as staged, not rubber-banded
- Whistle answer arrives with its visual correlate, legible with audio muted
- Tail language present at trot and wait

**Cap: 8 iterations.**

## Gate 4: Chapter engine

Manifest schema, loader, menu, save, chapter select, route logging, map screen.

**Passes when:** a deliberately trivial test chapter, authored as a manifest
with zero engine changes, loads, plays, logs a route and renders its map.
Write that test chapter as the proof.

## Gate 5: Chapter 1 complete

Full art, audio, playable end to end.

**Passes when:** completed on a physical phone, portrait, one thumb, by someone
who has never seen it, with no instruction beyond the in-game legend, **and**
completed a second time with sound off. Both must succeed. The tester should be
able to say what the whistle does without being told.

## Gate 6: Chapters 2 to 4

**Passes when:** all three exist as manifests only and the engine diff for this
stage is zero. The Old Town's false-direction whistle zones, witnesses and
glimpses must all be data.

## Gate 7: Performance and polish

Measure and report actual numbers. Never assert.

| Budget | Target |
|---|---|
| Desktop framerate | Sustained 60fps |
| Mobile framerate | 30fps floor on a mid-range 2019-class phone (reference devices: iPhone 11, Pixel 3a) |
| Draw calls | Under 200 in the Old Town, under 150 elsewhere |
| Initial payload | Under 10 MB to first playable, chapters lazy-loaded |
| Time to first interactive | Under 4 seconds on 4G |

The Old Town is the stress case. Budget against it, not the canyon.

---

## The red audit

An automated script, run at Gates 2, 5, 6 and 7. It scans every material,
vertex color and palette constant in the build and **fails on any color with
hue 350 through 15, saturation at or above 25% and value at or above 20%
(HSV)** that is not on the whitelist. The whitelist is exactly two asset ids:
the collar material and the map route line. Anything under those thresholds is
grey or near-black, not red. The rule that red belongs to the dog dies at the prop level
if a human has to enforce it by eye, so a script enforces it instead.

---

## Definition of done, whole game

- Completable start to finish on a phone, one thumb, portrait
- Completable and comprehensible with sound off
- No text beyond four chapter place names, the legend, and menu labels
- The red audit passes on the shipping build
- The dog is never in peril and never reads as fleeing
- A first-time player, asked afterward when they realized the dog was leading,
  names a moment from the middle of the game, not the ending. If nobody
  realizes before the gate, the seeding is too subtle. If everyone knows by the
  canyon, it is too loud. Tune the hazard-waits and the old woman

---

## Standing prohibitions

Reject these even when they would improve a metric.

- Waypoints, compasses, minimaps, objective text, quest logs
- A run button or player-controlled pace
- Any peril, harm or threat to the dog
- Red anywhere but the collar and the map line
- Tutorial text beyond the one-time legend
- Fail states, timers, scores, collectibles, percentages
- Toon outlines
- Assets sourced or scraped from any existing site or store
