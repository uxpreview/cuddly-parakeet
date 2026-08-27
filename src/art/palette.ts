// The one place colors are declared. Every material in the game reads from
// here; no component may write a hex literal. `tools/red-audit.mjs` enforces
// both halves of that: it scans this file against the red thresholds and it
// scans every other source file for stray literals.
//
// Hexes marked [DOC] are quoted verbatim from docs/art-direction.md and may
// not be edited without editing that document first. Hexes marked [DERIVED]
// are values this document does not specify, chosen here and recorded in
// docs/decisions.md.

export interface AssetColor {
  /** Stable asset id. The red audit whitelist is keyed on these. */
  id: string
  hex: string
}

const c = (id: string, hex: string): AssetColor => ({ id, hex })

// --- Chapter 1, The Canyon. Morning. --------------------------------------
// Cool, clean, hopeful. Long soft shadows.

export const CH1 = {
  /** [DOC] Sky `#CFE3E0` warming toward `#F2DFAE` at the rim. */
  skyZenith: c('ch1.sky.zenith', '#CFE3E0'),
  skyRim: c('ch1.sky.rim', '#F2DFAE'),

  /** [DOC] Limestone `#E3C08C`, shadow side `#9DA9A2`. */
  limestone: c('ch1.limestone', '#E3C08C'),
  limestoneShadow: c('ch1.limestone.shadow', '#9DA9A2'),

  /** [DOC] River `#4E8F86`. */
  river: c('ch1.river', '#4E8F86'),

  /** [DOC] Pine `#4E6E58`. */
  pine: c('ch1.pine', '#4E6E58'),

  /** [DOC] Path and gravel `#EFE3C8`. */
  path: c('ch1.path', '#EFE3C8'),

  // [DERIVED] Values art-direction.md does not name. Each is a documented
  // palette hex moved along one axis only, so nothing new enters the chapter.
  /** Wet stone in the ford and under the fallen pine. */
  wetStone: c('ch1.wetstone', '#B9AE96'),
  /** The fallen pine's dead trunk: pine drained of green, not a new hue. */
  deadwood: c('ch1.deadwood', '#8A7C64'),
  /** River shallows over gravel: `river` lifted toward the path value. */
  riverShallow: c('ch1.river.shallow', '#7BAA9A'),
  /** Deep channel under the log crossing: `river` dropped in value. */
  riverDeep: c('ch1.river.deep', '#3B6E68'),
  /** Sparse canyon scrub. Chapter 1 has no flowers. */
  scrub: c('ch1.scrub', '#7E8A63'),
  /** The town below the rim, seen through haze: limestone gone cool and pale. */
  townStone: c('ch1.town.stone', '#D6CDBB'),
  /**
   * The roofs of the town, AS SEEN FROM CHAPTER 1.
   *
   * The first pass used `#C4763F`, which is Chapter 2's documented roof colour
   * arriving half an hour early. art-direction.md's second rule is that no
   * palette borrows from another chapter, and the cost here was not abstract:
   * the roofs measured six hundred times the collar's screen area at nearly its
   * saturation, so in the chapter's own hero reveal the eye went to the town and
   * stayed there. Rule one's payoff — the eye goes to the collar first,
   * involuntarily — stopped working.
   *
   * So this is a Chapter 1 value: the limestone hex pushed a little warm and
   * dropped, a pale warm suggestion of roofs at three kilometres. The saturated
   * `#C4763F` arrives when the player is standing in Chapter 2 and has earned it.
   */
  townRoof: c('ch1.town.roof', '#C79877'),
  /** The sea past the town, at morning. */
  sea: c('ch1.sea', '#6E9AA0'),
} as const

// --- The two characters, chapter-neutral across all four palettes ---------

export const BOY = {
  /** [DOC] faded blue shirt `#3E6E8E`. */
  shirt: c('boy.shirt', '#3E6E8E'),
  /** [DOC] earth shorts `#8A5A3B`. */
  shorts: c('boy.shorts', '#8A5A3B'),
  // [DERIVED] Not named in art-direction.md; see docs/decisions.md D15.
  skin: c('boy.skin', '#D6A57A'),
  // warm and a shade up from black: at the gameplay camera a near-neutral dark
  // cap on a round head reads as a helmet
  hair: c('boy.hair', '#4E3D30'),
  eyes: c('boy.eyes', '#2E2A26'),
  shoes: c('boy.shoes', '#6B5B4A'),
} as const

export const DOG = {
  /** [DOC] Coat `#E5D5BC` with white points. */
  coat: c('dog.coat', '#E5D5BC'),
  points: c('dog.points', '#F7F2E8'),
  // [DERIVED] Nose, eye and pad darks. Neutral brown-black, no hue band.
  nose: c('dog.nose', '#332D28'),
  eyes: c('dog.eyes', '#241F1B'),
  /**
   * [DOC] Collar red `#D0342C`. THE ONLY RED IN THE GAME.
   * Red-audit whitelist entry 1 of 2. Do not reference this constant from any
   * material other than the collar.
   */
  collar: c('dog.collar', '#D0342C'),
} as const

export const MAP = {
  /**
   * [DOC] The dotted route line, drawn in the collar's color: the route is him.
   * Red-audit whitelist entry 2 of 2.
   */
  routeLine: c('map.routeLine', '#D0342C'),
} as const

/** Asset ids the red audit permits inside the red band. Exactly two. */
export const RED_WHITELIST = [DOG.collar.id, MAP.routeLine.id] as const

// --- Shading ---------------------------------------------------------------

/**
 * How far a surface's shade slides toward the chapter's documented shadow-side
 * color, AFTER the value drop the ramp applies first. All of them are low,
 * because a shade that is mostly a lerp toward the shadow key stops being that
 * material: the boy's shirt has to still be a faded blue shirt with his back to
 * the sun. See docs/decisions.md D16.
 *
 * Limestone was 1.0, on the reading that art-direction.md naming `#9DA9A2` as
 * limestone's shadow side meant every shaded limestone face should measure it
 * exactly. That is the wrong reading and it cost the chapter its identity: rock
 * is three quarters of every frame, so a full slide put the shadow hex on
 * roughly half the picture while `#E3C08C` — the colour the chapter is named
 * by — appeared on under two percent of it. The document gives two hexes to
 * name a material's ENDPOINTS. `#9DA9A2` is Chapter 1's coolest value, not its
 * most common one.
 */
export const SHADOW_MIX = {
  limestone: 0.82,
  // Ground goes further toward the shadow key than anything else except
  // limestone itself. Pale limestone dust in shade really does go cool grey,
  // and the canyon floor is the largest surface in every frame: if its shade
  // value is close to its lit value there is no shadow in the picture at all.
  ground: 0.44,
  // Pine is one of only five hexes Chapter 1 owns and it was measuring five
  // times too desaturated. Foliage keeps nearly all of its own colour in shade.
  foliage: 0.12,
  water: 0.2,
  character: 0.18,
  distant: 0.26,
} as const

/** Chapter 1's key light and ambient, matching the manifest lighting state. */
export const CH1_LIGHT = {
  /**
   * Azimuth/elevation in degrees.
   *
   * 30 degrees of elevation is where light clears the far terrace and reaches
   * the canyon floor at this canyon's proportions. Below it the whole chapter
   * plays in shade and the documented path value never once appears on screen;
   * well above it the shadows stop being long.
   *
   * The azimuth is +15: fifteen degrees off the canyon's axis, over the low
   * terraced bank rather than over the tall wall.
   *
   * That is the side the chapter's own colours require. The sun has to fall on
   * the inward face of the TALL wall, because that face is the only large
   * surface of documented limestone the camera ever sees; put the sun on the
   * other side and `#E3C08C` occupies zero percent of the frame the game is
   * played in while every stone surface in the chapter lands on the shadow hex
   * instead. Fifteen degrees is also shallow enough that light still clears the
   * far terrace and reaches the floor, so the documented path value appears too.
   *
   * The trade is that the tall wall throws its shadow behind itself rather than
   * across the floor. The floor's darks come from the far bank and the terraces
   * instead, and from baked sky-visibility at the wall feet.
   */
  sunDir: [15, 30] as [number, number],
  sun: CH1.skyRim.hex, // the warm rim value is the sun's own color
  ambient: CH1.skyZenith.hex,
  /**
   * Fog is the sky: distance melts into whatever sky is behind it. Held far
   * back so the canyon stays crisp for the first seventy metres — the trail is
   * the navigation system and haze must never be what hides it.
   */
  fogNear: 95,
  fogFar: 470,
}
