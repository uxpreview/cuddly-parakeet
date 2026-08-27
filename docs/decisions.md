# Decision log: The Long Way Home

Rulings on contradictions and gaps found by the Session 0 comprehension check,
resolved 2026-08-27 with Ryan's authorization ("proceed with whatever you
recommend"). Each ruling has been edited into the governing doc; this file is
the record of what changed and why. Creative **[OPEN]** items in `story.md`
(boy's face, count of "town knows this dog" moments, narration, the dog's
name, the door at the end) remain open and are Ryan's to decide.

---

## D1 — The near-miss node is parameterized, not fixed at one meter

`story.md` staged near-miss #1 wide (the switchback sighting) while
`game-design.md` defined the node as closing to ~1 m with an almost-touch;
near-miss #2 involves an actual collar touch, which "almost-touch" could not
produce. **Ruling:** the node takes an authored `approach` distance and an
optional `contact` variant. Chapter 1: wide approach, no contact. Chapter 2:
contact, `collar-touch`. The Gate 1 "reads as almost, never as cheating" test
applies to the node as authored for chapter 1. Edited: `game-design.md` node
list and manifest schema.

## D2 — Chapter 3 light is driven by route progress, not clock time

`story.md` said "real time," `game-design.md` said route progress with an
explicit rationale (wanderers must not be punished with unchosen darkness).
**Ruling:** route progress wins; the rationale is design, "real time" was
prose. Edited: `story.md` chapter 3.

## D3 — The map line is the boy's walked path; the reveal still belongs to the dog

The engine logs the player's polyline, but the ending needs the line to read
as the dog's plan. **Ruling:** both are true and the docs now say so: the
required path is the dog's route, so the line's spine is his even with the
player's wandering drawn as texture on top. Edited: `story.md` route map
section.

## D4 — The red audit threshold is defined

"Meaningful saturation" is now: hue 350–15, saturation ≥ 25%, value ≥ 20%,
HSV, with a whitelist of exactly two asset ids (collar material, map route
line). Edited: `quality-bar.md`.

## D5 — The controls paragraph's drafting noise is removed

The "…no. Final:" self-argument in `game-design.md` is gone; only the final
mapping remains (arrows/WASD, F or Space whistle, Enter context, ESC menu).

## D6 — game-design.md owns gameplay constants

Print lifetimes appear in two docs. They agree today; to prevent drift,
`game-design.md` is the source of truth for durations and all gameplay
numbers, `art-direction.md` owns how things look. Edited: `art-direction.md`
prints section.

## D7 — False whistle sources mislead with sound off too

Chapter 2's false-direction answers get their own visual correlates (pigeons
off the wrong roofline, a gate swinging in the wrong lane), so the sound-off
game is the same game. Edited: `game-design.md` Old Town bullet.

## D8 — Chapter replay overwrites that chapter's logged line

One polyline per chapter per save; latest play wins; the final map is always
one coherent day. Edited: `game-design.md` save state.

## D9 — A landmark is a named trigger volume

Entering it marks it passed for the map. Edited: `game-design.md` route map
section.

## D10 — The eye-shine detail is pinned to the right time

"At night… chapter 3" is now "in the dark at the end of chapter 3, carrying
into chapter 4." Edited: `art-direction.md`.

## D11 — The manifest schema now sketches its missing shapes

`gait`, `blendBy` values, `environment.surfaces`, and commented example shapes
for `disturbances`, `witnesses`, `falseSources`, and near-miss parameters.
These are sketches to be firmed at first use, schema-wide per the no-one-offs
rule. Edited: `game-design.md` schema.

## D12 — The reference phone is named

iPhone 11 / Pixel 3a stand in for "mid-range 2019-class." Edited:
`quality-bar.md` budget table.

## D13 — Chapter timings are critical path

The ~36-minute chapter sum plus wandering is the 40–50 target. Edited:
`story.md`.

## D14 — Owed, not yet ruled (flagged for the human, no doc edits)

- **Colorblindness:** the collar-red search cue is hue-dependent. Mitigations
  already in the design: the dog's light coat with white points, motion, and
  eye-shine. Recommend an explicit colorblind playtest at Gate 5 before
  deciding whether anything more is needed.
- **Blob shadows / print art:** both reference the superseded ink-direction
  doc, which is not in this repo. Their visual spec gets defined at first
  implementation (Gates 2–3) and recorded here.
- **Audio direction:** no doc exists. Sound is half the navigation system;
  an audio page (bark sets, beds, spatialization, the 0.5–1.5 s answer
  timing) should be written before Gate 5.
