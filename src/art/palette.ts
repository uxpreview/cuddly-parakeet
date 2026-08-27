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
  /** Sand at the swimming hole: `path` warmed a step toward limestone. */
  sand: c('ch1.sand', '#EBD9B6'),
  /** Wet stone in the ford and under the fallen pine. */
  wetStone: c('ch1.wetstone', '#B9AE96'),
  /** The fallen pine's dead trunk: pine drained of green, not a new hue. */
  deadwood: c('ch1.deadwood', '#8A7C64'),
  /** River shallows over gravel: `river` lifted toward the path value. */
  riverShallow: c('ch1.river.shallow', '#7BAA9A'),
  /** Deep channel under the log crossing: `river` dropped in value. */
  riverDeep: c('ch1.river.deep', '#3B6E68'),
  /** Scree and talus at the wall feet. */
  scree: c('ch1.scree', '#CDB593'),
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
 * color, AFTER the value drop the ramp applies first. Limestone is 1.0 because
 * art-direction.md names its shadow exactly; everything else is low, because a
 * shade that is mostly a lerp toward the shadow key stops being that material.
 * The boy's shirt has to still be a faded blue shirt with his back to the sun.
 * See docs/decisions.md D16.
 */
export const SHADOW_MIX = {
  limestone: 1.0,
  ground: 0.32,
  foliage: 0.24,
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
   * The azimuth is -15, and it is arithmetic rather than taste. The tall wall
   * carries its rim about ten metres out and twenty-three metres up, so the sun
   * grazes that rim when its horizontal component across the canyon is
   * `10 * tan(30 deg) / 23`, which is fifteen degrees off the canyon's axis.
   * At exactly that angle the wall's shadow edge falls along the middle of the
   * floor: the wall side of the path is in cool shade, the river side is in
   * sun, and the edge between them runs the long way down the canyon.
   *
   * Wider than this and the whole floor is in shade all morning, so the
   * documented path value never once appears on screen. Narrower, or over the
   * far bank instead, and nothing casts at all — the floor becomes one
   * uniform sheet of pale gravel with no dark anywhere for the dog or the
   * trail to read against.
   */
  sunDir: [-15, 30] as [number, number],
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
