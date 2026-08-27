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
  /** Burnt-orange roofs, kept clearly orange. Never terracotta-red. */
  townRoof: c('ch1.town.roof', '#C4763F'),
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
  hair: c('boy.hair', '#3E332C'),
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
 * color. Limestone is 1.0 because art-direction.md names its shadow exactly;
 * everything else keeps most of its own hue so the chapter reads as one light,
 * not as two palettes. See docs/decisions.md D16.
 */
export const SHADOW_MIX = {
  limestone: 1.0,
  ground: 0.62,
  foliage: 0.45,
  water: 0.34,
  character: 0.5,
  distant: 0.3,
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
   * The azimuth is +40, over the low terraced bank rather than over the tall
   * wall. From the other side nothing on the floor is ever lit, because a 23 m
   * cliff four metres away blocks any morning sun there is. From this side the
   * tall wall's inward face takes the light, the terrace and the river sit in
   * cool shade, and the wall throws its shadow the long way down the floor.
   */
  sunDir: [40, 30] as [number, number],
  sun: CH1.skyRim.hex, // the warm rim value is the sun's own color
  ambient: CH1.skyZenith.hex,
  /**
   * Fog is the sky: distance melts into whatever sky is behind it. Held far
   * back so the canyon stays crisp for the first seventy metres — the trail is
   * the navigation system and haze must never be what hides it.
   */
  fogNear: 72,
  fogFar: 430,
}
