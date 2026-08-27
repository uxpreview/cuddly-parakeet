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

---

Gate 2 rulings, 2026-08-27. D14 left the blob shadows and the print art without
a visual spec because the spec they referenced lived in the superseded ink
direction. Both are now defined, along with the character colours and the
shading model art-direction.md implies but does not pin down.

## D15 — The boy's palette outside the two documented garments

`art-direction.md` names the shirt (`#3E6E8E`) and the shorts (`#8A5A3B`) and
nothing else, but a boy needs skin, hair and shoes to exist. **Ruling:** skin
`#D6A57A`, hair `#3E332C`, eyes `#2E2A26`, shoes `#6B5B4A`. All four sit in the
warm-neutral band the two documented garments already imply, none is within
forty degrees of red's hue band, and each survives all four chapter palettes,
which is the stated test for his clothing. The face is built to the document's
own recommendation — eyes only, no mouth — and that item stays **[OPEN]** and
Ryan's to overrule. Recorded in `src/art/palette.ts`.

## D16 — Ramp shading, and what "the palette applied exactly" means

`art-direction.md` asks for "flat or gradient-ramp shading" and one directional
light plus ambient, but does not say what a surface's colour does as it turns
away from the sun. **Ruling:** every material in the game is shaded by one
two-stop ramp. A surface facing the key light renders its palette hex exactly;
a surface facing away renders that hex slid toward the chapter's documented
shadow-side colour by a per-material amount. Limestone slides the whole way,
because the document names its shadow (`#9DA9A2`) exactly; ground, foliage,
water and the characters keep most of their own hue so the chapter reads as one
light rather than as two palettes.

Nothing brightens past the documented value and nothing darkens past the
documented shade, which is what makes "the palette applied exactly as
documented" checkable rather than aspirational. Tone mapping is off and output
is sRGB for the same reason: a documented hex must survive to the pixel.

The ramp is continuous. No terminator step, no rim light, no cel band, no
outline pass anywhere in the codebase.

**Fog is the sky.** Each palette's fog colour is not a constant but the sky
gradient evaluated along the view ray, so anything that fades out fades into
precisely the sky behind it. Distance below the rim line gathers extra haze, so
the town reads as *below and far* rather than merely far.

**Terrain shadows are baked, not mapped.** The cross-sections are rasterised
into a coarse heightfield at load and each point is marched toward the sun;
three rays a few degrees apart give the soft edge. This is what makes "long
soft shadows" true of the world and not only of the characters, at no per-frame
cost and with no shadow map. A terrain shadow takes a surface most of the way
to its shade value, never all the way: canyon floor in shadow is still
limestone dust under a whole sky.

## D17 — Blob shadows (closes half of D14)

An ellipse on the ground under the character, and it is a *multiply*, not paint:
it darkens whatever surface it lands on and keeps that surface's hue.

- Painted in the chapter's documented shadow-side colour, never in black. A
  shadow belongs to the palette like everything else.
- Solid to 45% of the radius, then a smooth falloff to nothing at the rim.
- Sized to the character's ground footprint x 1.35.
- Stretched along the sun's ground bearing by `1 + 1.1 * cot(elevation)`, capped
  at 2.4x, and pushed away from the sun by exactly the length the stretch added,
  so the near end stays under the feet. A blob that translates as a whole reads
  as a second object lying on the ground.
- Core strength 0.55 for the boy, 0.50 for the dog.
- No blob at all where the terrain shadow already covers the character: there is
  no sun there to cast one.

The stretch is the point. At Chapter 1's morning sun this produces the long soft
shadows the palette section promises, from the ground up, with no shadow map
anywhere in the game.

## D18 — Print art (closes the other half of D14)

Hand-drawn alpha decals, which `art-direction.md` allows as one of its handful of
painted textures. Drawn procedurally so they are original to this game and so a
surface change is a parameter rather than a re-export. Like the blob shadows they
multiply, which is why a print on pale gravel and a print on wet stone are
recognisably the same print in two different materials.

- **Dog:** four toe ovals splayed around a larger heel pad, about 11 cm across,
  strength 0.42.
- **Boy:** a rounded sole — ball, heel, and a fainter waist between them, about
  15 cm long, strength 0.26.
- Both tinted with the chapter's shadow-side value. No outline, no second hue.
- The dog's are the darker of the two on purpose. They are the trail the game is
  asking the player to read, and the boy's must never compete with them.
- Prints fade by losing strength and shrinking, never by turning grey. Lifetimes
  stay owned by `game-design.md` per D6; this rules only on how they look.

## D19 — `environment.artTerrain`, a schema extension for all chapters

Gate 2 needs somewhere to put the look of a chapter without disturbing the
collision and staging Gate 1 signed off. **Ruling:** the manifest gains
`environment.artTerrain`, a sibling of `environment.terrain`. `terrain` stays
what it was — the block list the engine builds collision from. `artTerrain` is
the chapter's cross-sections, water reaches, scatter and what lies past the
horizon. A chapter without the field renders as a grey box, which is what keeps
the Gate 1 build alive as a debugging view (`?greybox` is not needed; simply
omitting the field is the switch). Per the no-one-offs rule this is a schema
change for all four chapters, edited into `game-design.md`.

The engine lofts a cross-section along a centerline and stamps a small library
of primitives. It knows nothing about canyons: where the canyon goes, how wide
it is, how deep, and what stands beside it are all chapter data, emitted by
`tools/build-ch01.mjs` from the same leg list the grey box came from.

## D20 — Chapter 1's key light is azimuth +40, elevation 30

`art-direction.md` specifies Chapter 1's palette and "long soft shadows" but no
sun position; Gate 1's manifest carried a placeholder. **Ruling:** azimuth +40,
elevation 30 degrees, and both numbers are load-bearing.

Elevation 30 is where light clears the far terrace and reaches the canyon floor
at this canyon's proportions. Below it the whole chapter plays in shade and the
documented path value `#EFE3C8` never once appears on screen; well above it the
shadows stop being long.

The azimuth puts the sun over the low terraced bank rather than over the tall
wall. From the other side nothing on the floor is ever lit, because a
twenty-three metre cliff four metres away blocks any morning sun there is. From
this side the tall wall's inward face takes the light, the terrace and the river
sit in cool shade, and the wall throws its shadow the long way down the floor.

The far bank is a terrace rather than a second cliff for the same reason, and
because a river canyon really does cut one bank lower than the other.
