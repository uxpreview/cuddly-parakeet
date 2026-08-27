import * as THREE from 'three'
import { CH1, SHADOW_MIX } from './palette'
import { makeRamp, sunDirection } from './RampMaterial'

/**
 * Terrain and props get a narrow lit/shade band — about half the width the
 * characters use. See RampMaterial: a wide band on a gently curving loft is an
 * airbrush and the facets this whole mesh exists to show disappear under it,
 * while a fully closed one makes every facet a hard binary and the wall becomes
 * a two-tone mosaic. This is the width at which a face reads as a plane turned
 * toward the light rather than as a tile.
 */
const WORLD_RAMP: [number, number] = [-0.17, 0.06]

/**
 * How much value a LIT face loses as it rakes away from the key light.
 *
 * With the ramp this narrow every lit face renders one identical colour, and
 * once the baked shadow stopped falsely covering the near cliff that turned the
 * whole wall into a flat sheet. This is the term that puts the facets back; see
 * RampMaterial for the measurement.
 */
const WORLD_MODEL = 0.17

/**
 * Foliage gets a wider band than rock.
 *
 * A pine crown is four or five rounded lumps of a dozen facets each. Under the
 * terrain's nearly-closed ramp every one of those facets is either fully lit or
 * fully shaded, so a crown came out as a two-tone mosaic and most of it landed
 * on the shade side — which is half of why the documented pine hex was
 * effectively absent from the game.
 */
const FOLIAGE_RAMP: [number, number] = [-0.42, 0.18]

// Builds the chapter's look from `terrain/canyon-art.json`. The engine knows
// how to loft a cross-section along a centerline and how to stamp a small set
// of primitives; it knows nothing about canyons. Where the canyon goes, how
// wide it is and what stands beside it are all chapter data.
//
// Everything here is low-poly, non-indexed and flat-normalled: three.js gives
// a face its own normal when no vertex is shared, which is the whole shading
// model. No image textures, no PBR, no outline pass.

export interface ArtChainPoint {
  o: number // lateral offset from the centerline, meters (signed)
  y: number // height relative to the centerline
  m: string // palette material id
  j: number // how far this point may wander per sample
  t: string // tag the scatter placer looks up ('rim', 'plateau', 'talus', ...)
}

export interface ArtTerrain {
  step: number
  centerline: [number, number, number, number][] // x, y, z, heading
  legs: { name: string; range: [number, number]; surface: string; chain: ArtChainPoint[] }[]
  waters: {
    range: [number, number]
    /** Fractional cross-section rung indices, so the shoreline tracks the bank. */
    fromK: number
    toK: number
    /** Absolute world height per sample across range[0]..range[1]. */
    levels: number[]
    material: string
    opacity: number
  }[]
  scatter: { kind: string; i: number; k: number; t: number; scale: number; rot: number }[]
  fallenPine: { at: [number, number, number]; scale: number; rot: number }
  beyond: {
    houses: {
      at: [number, number, number]
      size: [number, number, number]
      rotY: number
      roof: number
      tower?: boolean
    }[]
    ridges: { at: [number, number, number]; size: [number, number, number]; rotY: number }[]
    sea: { at: [number, number, number]; size: [number, number]; rotY: number }
    highland: {
      at: [number, number, number]
      size: [number, number]
      rotY: number
      tilt: [number, number, number, number]
    }[]
    terraces: {
      at: [number, number, number]
      size: [number, number]
      rotY: number
      drop: number
    }[]
  }
  hazeFloor: number
  hazeDepth: number
}

// material id -> the palette entry it paints with, and how far that surface
// slides toward the chapter's documented shadow-side colour in shade
// `tint` is a flat multiplier on the documented hex, for surfaces that are the
// same material in a different state — wet stone is limestone that is wet, not
// a colour of its own — so the palette does not have to grow an entry for it.
const SURFACE: Record<
  string,
  { hex: string; shadow: number; grain?: number; tint?: number; bed?: number }
> = {
  // `grain` is now a PER-FACE tone break, not a per-vertex gradient, so it is
  // the only thing separating one facet of ground from the next: on a gently
  // curved sweep like the gravel bar the ramp gives almost no variation, and at
  // four percent the bar came out as one airbrushed cream field metres across.
  // Raised from the four percent they carried as a per-vertex gradient, but
  // only about a third: at eight percent, stacked on top of a per-face cast
  // shadow that also steps, the near bank came out as a patchwork quilt. The
  // facet normals and the shadow steps supply most of the variation now; the
  // mottle only has to stop two adjacent faces being bit-identical.
  path: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.055 },
  gravel: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.06 },
  dust: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.052 },
  // Scree and sand are not their own colours. art-direction.md gives Chapter 1
  // five ground-and-stone hexes and no more; a talus slope is broken limestone
  // and a sand bar is the same pale gravel the path is. Inventing a value for
  // each of them is how a documented palette quietly becomes a suggestion — and
  // between them they were occupying more of the frame than the two hexes the
  // document actually names.
  sand: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.052 },
  wetstone: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.04, tint: 0.78 },
  scree: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.04 , bed: 0.045 },
  limestone: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.032 , bed: 0.04 },
  rock: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.03 , bed: 0.032 },
  scrub: { hex: CH1.scrub.hex, shadow: SHADOW_MIX.foliage, grain: 0.042 },
  // A pine trunk that shares the wall's value and hue disappears into it and
  // the canopy floats. Deadwood is darker than limestone by design.
  deadwood: { hex: CH1.deadwood.hex, shadow: SHADOW_MIX.ground, tint: 0.82 },
  wood: { hex: CH1.deadwood.hex, shadow: SHADOW_MIX.ground },
  stone: { hex: CH1.townStone.hex, shadow: SHADOW_MIX.distant },
  water: { hex: CH1.river.hex, shadow: SHADOW_MIX.water },
  river: { hex: CH1.river.hex, shadow: SHADOW_MIX.water },
  riverShallow: { hex: CH1.riverShallow.hex, shadow: SHADOW_MIX.water },
  riverDeep: { hex: CH1.riverDeep.hex, shadow: SHADOW_MIX.water },
}

// smooth value noise along the centerline, so a lofted wall undulates instead
// of reading as an extrusion, and never as per-sample zigzag
function h1(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453
  return v - Math.floor(v)
}
/**
 * Trilinear value noise. Unit lattice; scale the inputs to choose a wavelength.
 * This exists because `vnoise` of a weighted sum of coordinates is not noise in
 * three dimensions, it is a plane wave — see `mottle`.
 */
function vnoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const at = (cx: number, cy: number, cz: number) =>
    h1(cx * 1.13 + cy * 7.31 + cz * 19.7 + seed * 57.7)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const x00 = lerp(at(ix, iy, iz), at(ix + 1, iy, iz), sx)
  const x10 = lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), sx)
  const x01 = lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), sx)
  const x11 = lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), sx)
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz) * 2 - 1
}

function vnoise(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  const a = h1(i * 1.13 + seed * 57.7)
  const b = h1((i + 1) * 1.13 + seed * 57.7)
  return (a + (b - a) * s) * 2 - 1
}

class MeshBuilder {
  pos: number[] = []
  col: number[] = []
  shadow: number[] = []
  occ: number[] = []
  ao: number[] = []
  private c = new THREE.Color()

  private push(p: THREE.Vector3, hex: string, shade: number, tone: number, o: number, ao = 1) {
    this.pos.push(p.x, p.y, p.z)
    this.c.set(hex)
    this.col.push(this.c.r * tone, this.c.g * tone, this.c.b * tone)
    this.shadow.push(shade)
    this.occ.push(o)
    this.ao.push(ao)
  }

  tri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    cc: THREE.Vector3,
    hex: string | [string, string, string],
    shade: number | [number, number, number],
    tone: number | [number, number, number] = 1,
    occ: [number, number, number] = [0, 0, 0],
    ao: [number, number, number] = [1, 1, 1],
  ) {
    const t = Array.isArray(tone) ? tone : ([tone, tone, tone] as const)
    const x = Array.isArray(hex) ? hex : ([hex, hex, hex] as const)
    const sh = Array.isArray(shade) ? shade : ([shade, shade, shade] as const)
    this.push(a, x[0], sh[0], t[0], occ[0], ao[0])
    this.push(b, x[1], sh[1], t[1], occ[1], ao[1])
    this.push(cc, x[2], sh[2], t[2], occ[2], ao[2])
  }

  /**
   * Colour is per VERTEX, not per face. A rung of gravel meeting a rung of
   * scree with one flat colour each paints a hard stripe down the canyon, and a
   * floor built of stripes reads as a road. Gradating the two across the quad
   * gives the soft material transitions ground actually has, everywhere at
   * once: track into shoulder, talus into cliff, bank into water.
   */
  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    cc: THREE.Vector3,
    d: THREE.Vector3,
    hex: string | [string, string, string, string],
    shade: number | [number, number, number, number],
    tone: number | [number, number, number, number] = 1,
    occ: [number, number, number, number] = [0, 0, 0, 0],
    ao: [number, number, number, number] = [1, 1, 1, 1],
  ) {
    const t = Array.isArray(tone) ? tone : ([tone, tone, tone, tone] as const)
    const x = Array.isArray(hex) ? hex : ([hex, hex, hex, hex] as const)
    const sh = Array.isArray(shade) ? shade : ([shade, shade, shade, shade] as const)
    this.tri(a, b, cc, [x[0], x[1], x[2]], [sh[0], sh[1], sh[2]], [t[0], t[1], t[2]], [occ[0], occ[1], occ[2]], [ao[0], ao[1], ao[2]])
    this.tri(a, cc, d, [x[0], x[2], x[3]], [sh[0], sh[2], sh[3]], [t[0], t[2], t[3]], [occ[0], occ[2], occ[3]], [ao[0], ao[2], ao[3]])
  }

  get empty() {
    return this.pos.length === 0
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aShadow', new THREE.Float32BufferAttribute(this.shadow, 1))
    g.setAttribute('aOcc', new THREE.Float32BufferAttribute(this.occ, 1))
    g.setAttribute('aAo', new THREE.Float32BufferAttribute(this.ao, 1))
    g.computeVertexNormals() // non-indexed: every face gets its own normal
    return g
  }
}

/**
 * Value mottling from world position, two octaves — evaluated ONCE PER FACE and
 * applied to all of that face's vertices, so the result is a flat tile of
 * colour with a hard break at every polygon edge.
 *
 * Per-VERTEX was the mistake, and it cost the bible its entire shading grammar.
 * A tone that differs at the three corners of a triangle is interpolated across
 * it, which is Gouraud shading by another name: measured over the render set
 * there were fifteen to twenty-one thousand unique colours per frame, and a
 * three-hundred-pixel square of the nearest canyon wall contained no seam
 * anywhere — an airbrushed blur where flat shading is supposed to expose form.
 * Per-face restores the break. The facets were always in the mesh; the vertex
 * gradient was painting over them.
 *
 * The other half of the same bug: neither octave sampled Y. On a vertical cliff
 * every point on a plumb line shares one (x, z), so the mottle was constant
 * down the full height of the wall and the walls ran with vertical streaks —
 * melted wax, the dominant material impression of the whole set. Both octaves
 * now take height, and the fast one takes it hardest, so the variation reads as
 * bedding across the face rather than as drips down it.
 */
function mottle(p: THREE.Vector3, amount: number, bed = 0): number {
  // ISOTROPIC, and that word is the whole fix.
  //
  // Both octaves used to be a one-dimensional noise of a LINEAR COMBINATION of
  // x, y and z. A 1-D noise of `ax + by + cz` is constant on every plane
  // perpendicular to (a, b, c) — it is a set of parallel bands, not a field —
  // and two of them crossed at an angle is a lattice of parallelograms. That
  // is exactly what the near walls rendered as: a quilt of axis-aligned blocks
  // whose screen size barely changed with distance, which is what tripped the
  // "visible image textures" item on the Gate 2 failure list. Real 3-D value
  // noise has no preferred direction and no lattice.
  const a = vnoise3(p.x * 1.9, p.y * 1.9, p.z * 1.9, 3) * 0.6
  const b = vnoise3(p.x * 0.42, p.y * 0.42, p.z * 0.42, 11) * 0.4
  // Stone also gets BEDDING: a slow band keyed on height alone, so the wall's
  // variation reads as strata rather than as a pattern applied to it. The band
  // boundary wanders along the run, so no ledge is a level ribbon.
  const s = bed
    ? vnoise(p.y * 0.62 + vnoise(p.x * 0.07 + p.z * 0.055, 23) * 0.4, 31)
    : 0
  return 1 + (a + b) * amount + s * bed
}

/** The centroid of a face, which is where its one tone is sampled. */
const _fc = new THREE.Vector3()
function faceTone(
  amount: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d?: THREE.Vector3,
  bed = 0,
): number {
  if (!amount && !bed) return 1
  _fc.copy(a).add(b).add(c)
  if (d) _fc.add(d).multiplyScalar(0.25)
  else _fc.multiplyScalar(1 / 3)
  return mottle(_fc, amount, bed)
}

export interface ArtScene {
  group: THREE.Group
  hazeFloor: number
  /** Every material built here, for the runtime half of the red audit. */
  materials: THREE.Material[]
  /** 0 = in full sun, 1 = fully in a terrain shadow, at any world point. */
  sunOcclusionAt: (x: number, y: number, z: number) => number
  /**
   * How much open sky a point sees: 1 in the open, low where the ground closes
   * in. This is the term the shader darkens ground with, so it is the other
   * half of "is this a lit place to stand" — a spot in full sun at the foot of
   * a wall still renders dark.
   */
  skyViewAt: (x: number, y: number, z: number) => number
  /**
   * Ground height of the ART surface at a point, or null where there is none.
   * Characters and prints stand on this, not on the grey box: the two agree
   * almost everywhere, and where they deliberately do not — the ford bed sits
   * half a metre lower than its collision slab so the crossing is under
   * water — standing on the collision height leaves the boy on top of the river.
   */
  groundAt: (x: number, z: number) => number | null
}

// Coarse heightfield + shadow march. Built once at load; the whole canyon
// costs a few tens of milliseconds, and nothing about it runs per frame.
class SunOcclusion {
  private cell = 2.0
  private minX = 0
  private minZ = 0
  private nx = 0
  private nz = 0
  private h: Float32Array
  private cache = new Map<string, number>()
  private sun: THREE.Vector3

  constructor(
    art: ArtTerrain,
    chainPoint: (leg: ArtTerrain['legs'][number], i: number, k: number) => THREE.Vector3,
    sun: THREE.Vector3,
  ) {
    this.sun = sun.clone().normalize()
    let maxX = -1e9
    let maxZ = -1e9
    this.minX = 1e9
    this.minZ = 1e9
    const stamps: [number, number, number][] = []
    const _a = new THREE.Vector3()
    const _b = new THREE.Vector3()
    for (const leg of art.legs) {
      for (let i = leg.range[0]; i <= leg.range[1]; i++) {
        for (let k = 0; k < leg.chain.length - 1; k++) {
          _a.copy(chainPoint(leg, i, k))
          _b.copy(chainPoint(leg, i, k + 1))
          // walk the rung so wide segments (a riverbed, a plateau) do not leave
          // unstamped holes the shadow ray could slip through
          const n = Math.max(1, Math.ceil(_a.distanceTo(_b) / this.cell))
          for (let t = 0; t <= n; t++) {
            const x = _a.x + (_b.x - _a.x) * (t / n)
            const y = _a.y + (_b.y - _a.y) * (t / n)
            const z = _a.z + (_b.z - _a.z) * (t / n)
            stamps.push([x, y, z])
            if (x < this.minX) this.minX = x
            if (x > maxX) maxX = x
            if (z < this.minZ) this.minZ = z
            if (z > maxZ) maxZ = z
          }
        }
      }
    }
    this.nx = Math.ceil((maxX - this.minX) / this.cell) + 2
    this.nz = Math.ceil((maxZ - this.minZ) / this.cell) + 2
    this.h = new Float32Array(this.nx * this.nz).fill(-1e9)
    for (const [x, y, z] of stamps) {
      const idx = this.index(x, z)
      if (idx >= 0 && y > this.h[idx]) this.h[idx] = y
    }

    // Fill the holes. The cross-sections are stamped every 1.5 m along the run
    // and every `cell` across it, so a cell can end up with no stamp in it at
    // all — and an empty cell is a hole a shadow ray marches straight through.
    // On a wall those holes are scattered, so the baked shadow came out NOISY
    // at face scale, and once the shading went flat-per-face that noise stopped
    // being invisible and became a chessboard of lit and shaded rectangles
    // across the nearest cliff. Only cells with nothing in them are filled, and
    // only from their neighbours: dilating the whole field would thicken every
    // obstacle by two metres and put the canyon floor in shade that nothing
    // casts.
    const filled = this.h.slice()
    for (let cz = 0; cz < this.nz; cz++) {
      for (let cx = 0; cx < this.nx; cx++) {
        const i = cz * this.nx + cx
        if (this.h[i] > -1e8) continue
        let best = -1e9
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx
            const nz = cz + dz
            if (nx < 0 || nz < 0 || nx >= this.nx || nz >= this.nz) continue
            const v = this.h[nz * this.nx + nx]
            if (v > best) best = v
          }
        }
        // a hole surrounded by nothing stays a hole
        if (best > -1e8) filled[i] = best
      }
    }
    this.h = filled
  }

  private index(x: number, z: number): number {
    const cx = Math.floor((x - this.minX) / this.cell)
    const cz = Math.floor((z - this.minZ) / this.cell)
    if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) return -1
    return cz * this.nx + cx
  }

  private height(x: number, z: number): number {
    const i = this.index(x, z)
    return i < 0 ? -1e9 : this.h[i]
  }

  /** Public ground height, for rejecting scatter that would hang in mid-air. */
  heightAt(x: number, z: number): number {
    return this.height(x, z)
  }

  /** One ray: is anything between this point and the sun? */
  private blocked(x: number, y: number, z: number, dx: number, dz: number, dy: number): boolean {
    const STEP = 1.6
    for (let t = STEP; t < 62; t += STEP) {
      const hy = this.height(x + dx * t, z + dz * t)
      if (hy > y + dy * t + 0.35) return true
    }
    return false
  }

  /**
   * Sky visibility at a point: 1 in the open, 0 down a hole. Eight rays around
   * the compass, each returning how high the horizon is in that direction.
   *
   * This is the "soft contact darkening where things meet ground" the art
   * direction asks for, and it is the only thing that puts a dark anywhere near
   * the bottom of this chapter's value range: the feet of the walls, the inside
   * of the narrows, the underside of the terraces.
   */
  /** skyView on a coarse world grid: the term is broad, the cache is cheap. */
  private skyCache = new Map<number, number>()
  skyViewCached(x: number, y: number, z: number): number {
    const gx = Math.round(x / 1.5)
    const gy = Math.round(y / 1.5)
    const gz = Math.round(z / 1.5)
    const key = (gx + 4096) * 16777216 + (gz + 4096) * 4096 + (gy + 2048)
    const hit = this.skyCache.get(key)
    if (hit !== undefined) return hit
    const v = this.skyView(x, y, z)
    this.skyCache.set(key, v)
    return v
  }

  skyView(x: number, y: number, z: number): number {
    const N = 8
    let sum = 0
    for (let a = 0; a < N; a++) {
      const ang = (a / N) * Math.PI * 2
      const dx = Math.cos(ang)
      const dz = Math.sin(ang)
      let maxSlope = 0
      for (let t = 1.2; t < 22; t += 1.6) {
        const hy = this.height(x + dx * t, z + dz * t)
        if (hy < -1e8) continue
        const slope = (hy - y) / t
        if (slope > maxSlope) maxSlope = slope
      }
      // horizon elevation as a fraction of the hemisphere
      sum += 1 - Math.atan(maxSlope) / (Math.PI / 2)
    }
    return sum / N
  }

  aoAt(leg: ArtTerrain['legs'][number], i: number, k: number): number {
    const key = 'ao|' + leg.name + '|' + i + '|' + k
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    const p = this.point(leg, i, k)
    const v = this.skyView(p.x, p.y + 0.25, p.z)
    this.cache.set(key, v)
    return v
  }

  /**
   * How much of the sun a point cannot see. Takes the surface's own normal,
   * and it is not optional on anything vertical.
   *
   * The heightfield is 2 m cells and a cliff is near-vertical, so every point
   * on a wall face lives inside the very column that represents that wall — and
   * that column is as tall as the rim. Marching from the surface itself, the
   * first sample 1.6 m along the sun's bearing was still inside the wall's own
   * footprint, so the wall reported itself as blocking itself. Measured on the
   * judged set: over the near wall in `vista`, 95.5% of faces were turned
   * TOWARD the sun by the ramp's own test and not one was on its shade side,
   * yet mean baked occlusion was 0.87. That is what put the documented shadow
   * hex on 77-82% of a sunlit wall, and because whether a given face's centroid
   * landed inside or outside its own column was essentially random, it is also
   * what made the wall a chessboard.
   *
   * So the march starts clear of the surface: pushed out along the HORIZONTAL
   * part of the normal, by an amount that is a full cell on a vertical face and
   * exactly zero on a floor. The canyon floor's shadows are cast by the walls
   * and terraces around it and are unaffected.
   */
  sample(x: number, y: number, z: number, nx = 0, nz = 0): number {
    const s = this.sun
    const flat = Math.hypot(s.x, s.z) || 1
    const dx = s.x / flat
    const dz = s.z / flat
    const dy = s.y / flat
    // nx, nz are the horizontal components of a UNIT normal, so this is a full
    // cell out from a vertical face and exactly nothing from a level one.
    x += nx * this.cell * 1.05
    z += nz * this.cell * 1.05
    // three rays fanned +/- 5 degrees: a soft edge instead of a hard cut
    let hit = 0
    for (const a of [-0.087, 0, 0.087]) {
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      if (this.blocked(x, y, z, dx * ca - dz * sa, dx * sa + dz * ca, dy)) hit++
    }
    return hit / 3
  }

  at(leg: ArtTerrain['legs'][number], i: number, k: number): number {
    const key = leg.name + '|' + i + '|' + k
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    const p = this.point(leg, i, k)
    const v = this.sample(p.x, p.y, p.z)
    this.cache.set(key, v)
    return v
  }

  point!: (leg: ArtTerrain['legs'][number], i: number, k: number) => THREE.Vector3
}

export function buildArtTerrain(art: ArtTerrain): ArtScene {
  const group = new THREE.Group()
  const materials: THREE.Material[] = []
  const C = art.centerline
  const centerAt = (i: number) => C[Math.max(0, Math.min(C.length - 1, i))]

  // Which leg owns each sample, and its neighbours. Legs share their boundary
  // sample, so every sample has a leg and at most one neighbour to blend with.
  const legIndexAt = new Int16Array(C.length).fill(-1)
  art.legs.forEach((leg, li) => {
    for (let i = leg.range[0]; i <= leg.range[1]; i++) {
      if (legIndexAt[i] < 0) legIndexAt[i] = li
    }
  })
  for (let i = 0; i < C.length; i++) {
    if (legIndexAt[i] < 0) legIndexAt[i] = i === 0 ? 0 : legIndexAt[i - 1]
  }

  /**
   * A cross-section point in world space, blended across leg boundaries.
   *
   * Every chain has the same thirteen rungs in the same order, so a boundary
   * between (say) a leg with a cliff on the right and a leg with a river there
   * is a lerp of two positions rather than two different shapes overlapping.
   * Without this the world tears open at every boundary — most visibly where
   * the river crosses the path — and you can see sky through the rim.
   *
   * The jitter is a deterministic function of (sample, rung), so anything that
   * needs to sit exactly on this surface later asks for the same point and gets
   * the same answer.
   */
  const TRANS = 3 // samples either side of a boundary
  const chainPointAt = (i: number, k: number, out = new THREE.Vector3()) => {
    const idx = Math.max(0, Math.min(C.length - 1, i))
    const li = legIndexAt[idx]
    const leg = art.legs[li]
    const kk = Math.max(0, Math.min(leg.chain.length - 1, k))
    const p = leg.chain[kk]

    let o = p.o
    let y = p.y
    let j = p.j
    let other: (typeof art.legs)[number] | null = null
    let w = 0
    if (idx - leg.range[0] < TRANS && li > 0) {
      other = art.legs[li - 1]
      w = 0.5 * (1 - (idx - leg.range[0]) / TRANS)
    } else if (leg.range[1] - idx < TRANS && li < art.legs.length - 1) {
      other = art.legs[li + 1]
      w = 0.5 * (1 - (leg.range[1] - idx) / TRANS)
    }
    if (other && w > 0) {
      const q = other.chain[kk]
      o += (q.o - o) * w
      y += (q.y - y) * w
      j += (q.j - j) * w
    }

    const [cx, cy, cz, h] = centerAt(idx)
    const lx = Math.sin(h)
    const lz = -Math.cos(h)
    const sign = o < 0 ? -1 : 1
    // The wall's variation is BEDDED, not fluted. A high-frequency octave on
    // the lateral offset runs vertical folds down the full height of a cliff,
    // and a lofted wall covered in even vertical folds reads as a hanging
    // curtain — which is exactly what it did. Limestone strata are horizontal,
    // so the fast octave belongs on the height axis and is quantised into
    // steps: hard ledges with a slight outward batter, wandering along the
    // wall's run so no ledge is a continuous ribbon.
    const n1 = vnoise(idx / 3.4, kk * 3 + 1)
    const bedRaw = vnoise(idx / 6.5, kk * 11 + 41)
    const bed = Math.round(bedRaw * 3) / 3 // stepped, not smooth
    const n2 = vnoise(idx / 5.1, kk * 3 + 2) * 0.55 + bed * 0.45
    // Lateral wander is kept small on purpose. A cliff that wobbles a metre in
    // and out between rungs stops standing up: its faces tilt back, catch the
    // sun on their tops, and the whole wall reads as a pale drape. Most of the
    // variation belongs on the height axis, as bedding.
    const oo = o + (n1 * 0.78 + bed * 0.22) * j * 0.42 * sign
    const yy = y + n2 * j * 0.85
    return out.set(cx + lx * oo, cy + yy, cz + lz * oo)
  }

  const chainPoint = (
    leg: (typeof art.legs)[number],
    i: number,
    k: number,
  ): THREE.Vector3 => {
    void leg
    return chainPointAt(i, k)
  }

  // --- baked sun occlusion --------------------------------------------------
  // "One directional light plus ambient, per chapter state. Baked or cheap."
  // At a 22-degree morning sun a canyon wall throws its shadow most of the way
  // across the floor, and without that shadow the floor is one flat sheet of
  // its own albedo. So: rasterise the cross-sections into a coarse heightfield,
  // then march each cross-section point toward the sun and record what is in
  // the way. Three rays fanned a few degrees apart give the soft edge the
  // palette section asks for.
  const shadow = new SunOcclusion(art, chainPoint, sunDirection())
  shadow.point = chainPoint

  // --- the canyon itself ---------------------------------------------------
  const land = new MeshBuilder()

  // How wide a face is allowed to be, across the cross-section.
  //
  // The loft's rungs are placed where the canyon's SHAPE changes, so the gap
  // between two of them is whatever the terrain data says — and some of them
  // are eighteen metres apart. Along the run the samples are 1.5 m, so the near
  // canyon wall was being built out of faces 1.5 m by 18 m. At the camera
  // height this game is played at, one of those faces fills a third of the
  // screen, and everything carried per-vertex — the baked sun shadow, the sky
  // visibility, the mottle — is then interpolated across that third of the
  // screen. That is Gouraud shading, and it is why a three-hundred-pixel sample
  // of the nearest wall contained no seam anywhere and the whole cliff read as
  // melted wax rather than as rock.
  //
  // Flat shading only exposes form if there are faces to expose it with. So the
  // wide gaps are split until no face is wider than this, and the split is not
  // merely a subdivision: each interior vertex is pushed along the local face
  // normal by the same bedded noise the rungs use, so the sub-faces get their
  // own normals and the wall gets ledges instead of a gradient.
  const MAX_SPAN = 1.2

  /** Where a fractional rung lands: the two rungs lerped, plus bedding. */
  const _u0 = new THREE.Vector3()
  const _u1 = new THREE.Vector3()
  const _un = new THREE.Vector3()
  const subPoint = (i: number, k: number, u: number, out: THREE.Vector3) => {
    _u0.copy(chainPointAt(i, k))
    if (u <= 0) return out.copy(_u0)
    _u1.copy(chainPointAt(i, k + 1))
    if (u >= 1) return out.copy(_u1)
    out.copy(_u0).lerp(_u1, u)
    // the normal of the rung span, in the vertical plane it lies in
    _un.copy(_u1).sub(_u0)
    const spanLen = _un.length()
    if (spanLen < 1e-4) return out
    // perpendicular to the span, inside the cross-section plane
    const px = -_un.y / spanLen
    const py = Math.hypot(_un.x, _un.z) / spanLen
    // Bedding: quantised, so the relief is ledges rather than a ripple, and
    // keyed on the sub-vertex's own place so no two are alike.
    const n = Math.round(vnoise(i / 5.2 + k * 3.7 + u * 6.1, k * 17 + 5) * 2.5) / 2.5
    // Kept small. Under a nearly-closed terminator every extra degree of tilt
    // flips a whole face between the lit hex and the shade hex, so a bedding
    // amplitude that looked like relief under a soft ramp came out as a
    // two-tone mosaic under a hard one — pixel-art camouflage, not limestone.
    const amp = Math.min(spanLen * 0.011, 0.1)
    const horiz = Math.hypot(_un.x, _un.z) || 1
    out.x += (_un.x / horiz) * px * n * amp
    out.z += (_un.z / horiz) * px * n * amp
    out.y += py * n * amp
    return out
  }

  const _cen = new THREE.Vector3()
  const _oc = new THREE.Vector3()
  const centroid = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) =>
    _cen.copy(a).add(b).add(c).add(d).multiplyScalar(0.25)

  const _mc = new THREE.Vector3()
  const _n0 = new THREE.Vector3()
  const _n1 = new THREE.Vector3()
  const _sa = new THREE.Vector3()
  const _sb = new THREE.Vector3()
  const _sc = new THREE.Vector3()
  const _sd = new THREE.Vector3()

  for (const leg of art.legs) {
    const a = leg.range[0]
    const b = leg.range[1]
    for (let i = a; i < b; i++) {
      for (let k = 0; k < leg.chain.length - 1; k++) {
        const span = chainPoint(leg, i, k).distanceTo(chainPoint(leg, i, k + 1))
        const sub = Math.max(1, Math.min(12, Math.ceil(span / MAX_SPAN)))
        for (let sIdx = 0; sIdx < sub; sIdx++) {
          const u0 = sIdx / sub
          const u1 = (sIdx + 1) / sub
          const A = subPoint(i, k, u0, _sa).clone()
          const B = subPoint(i + 1, k, u0, _sb).clone()
          const Cc = subPoint(i + 1, k, u1, _sc).clone()
          const D = subPoint(i, k, u1, _sd).clone()
          emit(leg, i, k, u0, u1, A, B, Cc, D)
        }
      }
    }
  }

  function faceOcc(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
  ): [number, number, number, number] {
    // Averaged over the face's own footprint, not taken at a point.
    //
    // A single three-ray sample per face returns one of four values, and the
    // heightfield it marches is 2 m cells while the faces are ~1.3 m: the field
    // is therefore NOISY at face scale, and one sample per face turned that
    // noise into a chessboard of fully-lit and fully-shaded rectangles across
    // the near wall. Five samples over the face is a box filter — the value
    // becomes continuous, adjacent faces differ by a step instead of flipping,
    // and a shadow edge crosses several faces as a stepped ramp. That is what
    // "long soft shadows" looks like when every polygon is one flat colour.
    const p = centroid(a, b, c, d)
    // the face's own normal, so the march can start clear of the surface it is
    // standing on — see SunOcclusion.sample
    _n0.copy(b).sub(a)
    _n1.copy(d).sub(a)
    _n0.cross(_n1).normalize()
    const nx = _n0.x
    const nz = _n0.z
    let sum = shadow.sample(p.x, p.y, p.z, nx, nz)
    for (const q of [a, b, c, d]) {
      _oc.copy(q).lerp(p, 0.35)
      sum += shadow.sample(_oc.x, _oc.y, _oc.z, nx, nz)
    }
    const v = sum / 5
    return [v, v, v, v]
  }

  function faceAo(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
  ): [number, number, number, number] {
    const p = centroid(a, b, c, d)
    const v = shadow.skyViewCached(p.x, p.y + 0.25, p.z)
    return [v, v, v, v]
  }

  function emit(
    leg: (typeof art.legs)[number],
    i: number,
    k: number,
    u0: number,
    u1: number,
    A: THREE.Vector3,
    B: THREE.Vector3,
    Cc: THREE.Vector3,
    D: THREE.Vector3,
  ) {
    void i
    {
      {
        // Each rung carries its own material and they gradate across the face.
        // A sub-face takes whichever rung's material its own midpoint is nearer,
        // so the material boundary lands on a polygon edge rather than being
        // smeared across the widest face in the picture.
        // ONE material for the whole face, chosen by the face's own midpoint.
        //
        // This was the last interpolated channel and it was the biggest one.
        // The corners took [kA, kA, kB, kB], so any quad spanning a material
        // change carried a GRADIENT across itself — and on the canyon floor the
        // rungs are close enough together that they are never subdivided, so
        // almost every floor face was such a quad. Measured on the judged set:
        // `prints-desktop.png` y=600 ran 880 px of floor whose luminance walked
        // 224 -> 193 -> 230 with no break anywhere in it, and the four faces
        // under the near half of that row each held two different vertex
        // colours (limestone at one corner, path at the others). That is
        // Gouraud shading, it is what the soft light streaks down the floor
        // were, and it is why the fix that landed on the walls never landed
        // here: the walls' rungs are metres apart, so they subdivide, and a
        // sub-face away from the boundary happened to come out flat.
        //
        // The price is that a material boundary is now a polygon edge. That is
        // the idiom, and it is nearly invisible in practice: path, gravel,
        // dust and sand are all `#EFE3C8`, so the only real boundary on the
        // floor is where pale gravel meets limestone at the wall feet, which is
        // a hard edge in the world too.
        //
        // The boundary WANDERS. A material change that lands exactly at the
        // half-way point of every rung, on every sample down the canyon, is a
        // ruled line a hundred metres long — the floor became a set of parallel
        // ribbons and read as a road, which is precisely what the interpolated
        // colour had been hiding. Offsetting the decision by a smooth 3-D noise
        // at about two metres lets the two materials interlock along a ragged
        // edge instead, which is what gravel giving way to stone looks like.
        //
        // The boundary wanders by a fixed distance in METRES, not by a fraction
        // of a rung, and the noise driving it is about seven metres long.
        //
        // Both halves of that matter. A rung pair narrow enough not to be
        // subdivided has a midpoint of exactly 0.5, so a noise short enough to
        // differ between neighbouring faces turns the choice into a coin flip
        // per face — and pale gravel against warm limestone is thirty levels
        // and a hue apart, so the floor came out a chessboard. And an amplitude
        // measured in rungs swings the edge by whatever this rung happens to be
        // wide, which here is metres: the margin came out as chevrons, a
        // pattern rather than a place. Under a metre of wander, smooth along
        // the run, is a gravel bar meeting a talus foot.
        _mc.copy(A).add(B).add(Cc).add(D).multiplyScalar(0.25)
        const rungWidth = A.distanceTo(D) / Math.max(u1 - u0, 1e-4)
        const um =
          (u0 + u1) * 0.5 +
          (vnoise3(_mc.x * 0.14, _mc.y * 0.14, _mc.z * 0.14, 71) * 0.9) /
            Math.max(rungWidth, 0.6)
        const kMid = SURFACE[leg.chain[um < 0.5 ? k : k + 1].m] ?? SURFACE.limestone
        const s0 = kMid
        const s1 = kMid
        // Mottling, computed PER VERTEX from world position rather than per
        // face. Flat colour across a 1.5 m face is what makes low-poly ground
        // read as paper; a soft gradient across it is what stops that, and it
        // has to be a gradient or the ground becomes a patchwork of tiles.
        const g0 = s0.grain ?? 0
        const g1 = s1.grain ?? 0
        const k0 = s0.tint ?? 1
        const k1 = s1.tint ?? 1
        const bed = s0.bed ?? 0
        // One tone for the whole face. See `mottle`: sampling it at the corners
        // interpolates it, and an interpolated tone is a gradient painted over
        // the facet the flat shading exists to show.
        const ft = faceTone((g0 + g1) * 0.5, A, B, Cc, D, bed)
        const tone: [number, number, number, number] = [ft * k0, ft * k0, ft * k1, ft * k1]
        const hexes: [string, string, string, string] = [s0.hex, s0.hex, s1.hex, s1.hex]
        const shades: [number, number, number, number] = [s0.shadow, s0.shadow, s1.shadow, s1.shadow]
        land.quad(
          A,
          B,
          Cc,
          D,
          hexes,
          shades,
          tone,
          // ONE value for the whole face, like the tone and like the normal.
          //
          // This is the last of the interpolated channels, and it was the one
          // doing the most damage. A cast shadow sampled at the corners is a
          // gradient across the face, and at the camera height this game is
          // played at a single face is a couple of hundred pixels: the near
          // wall came out as soft grey bruises with no boundary anywhere, which
          // reads as dirt on the lens, not as a canyon casting a shadow. With
          // every channel flat, a polygon is one colour — which is what "flat
          // shading exposes bad forms" actually means, and the price is that a
          // shadow edge steps at the size of the mesh. That is the idiom.
          faceOcc(A, B, Cc, D),
          // Sky visibility, also flat per face. It is eight rays a sample, so
          // it is cached on a metre-and-a-half world grid.
          faceAo(A, B, Cc, D),
        )
      }
    }
  }


  const landMat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    occlusionAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    ramp: WORLD_RAMP,
    // What gives a lit cliff its facets back. See RampMaterial.
    model: WORLD_MODEL,
    hazeFloor: art.hazeFloor,
    hazeDepth: art.hazeDepth,
  })
  landMat.name = 'land'
  materials.push(landMat)
  group.add(new THREE.Mesh(land.geometry(), landMat))

  // --- the river ------------------------------------------------------------
  // Flat colour, faint still riffle banding, no reflection, no specular, no
  // normal map. Depth is told by hue alone, which is the only thing water is
  // allowed to do here. The surface follows the floor it cut rather than
  // stepping between legs, so it reads as one reach.
  const byWater = new Map<string, MeshBuilder>()
  const _wa = new THREE.Vector3()
  const _wb = new THREE.Vector3()
  /** Lateral world position at a fractional rung index, at the given height. */
  const waterPoint = (i: number, kf: number, y: number) => {
    const k0 = Math.floor(kf)
    chainPointAt(i, k0, _wa)
    chainPointAt(i, k0 + 1, _wb)
    const t = kf - k0
    return new THREE.Vector3(_wa.x + (_wb.x - _wa.x) * t, y, _wa.z + (_wb.z - _wa.z) * t)
  }
  for (const w of art.waters) {
    let mb = byWater.get(w.material)
    if (!mb) {
      mb = new MeshBuilder()
      byWater.set(w.material, mb)
    }
    const src = SURFACE[w.material] ?? SURFACE.river
    // One sample of overlap into each neighbour. A reach that stops exactly at
    // its own range boundary leaves the water plane's straight edge hanging in
    // mid-air, which at the ford read as a torn sticker across the sand.
    const a = Math.max(0, w.range[0] - 1)
    const b = Math.min(C.length - 1, w.range[1] + 1)
    const span = w.toK - w.fromK
    const SEG = Math.max(1, Math.min(6, Math.round(span * 1.5)))
    for (let i = a; i < b; i++) {
      const li = i - w.range[0]
      const y0 = w.levels[Math.max(0, Math.min(w.levels.length - 1, li))]
      const y1 = w.levels[Math.max(0, Math.min(w.levels.length - 1, li + 1))]
      for (let k = 0; k < SEG; k++) {
        const kf0 = w.fromK + (span * k) / SEG
        const kf1 = w.fromK + (span * (k + 1)) / SEG
        const tone = 1 + Math.max(0, vnoise(i / 2.6, k * 11 + 3)) * 0.05
        mb.quad(
          waterPoint(i, kf0, y0),
          waterPoint(i + 1, kf0, y1),
          waterPoint(i + 1, kf1, y1),
          waterPoint(i, kf1, y0),
          src.hex,
          src.shadow,
          tone,
        )
      }
    }
  }
  for (const [id, mb] of byWater) {
    if (mb.empty) continue
    const src = art.waters.find((w) => w.material === id)
    const mat = makeRamp({
      vertexColors: true,
      shadowAttribute: true,
      shadowKey: CH1.limestoneShadow.hex,
    ramp: WORLD_RAMP,
      hazeFloor: art.hazeFloor,
      hazeDepth: art.hazeDepth,
      transparent: (src?.opacity ?? 1) < 1,
      opacity: src?.opacity ?? 1,
      depthWrite: (src?.opacity ?? 1) >= 1,
      side: THREE.DoubleSide,
    })
    mat.name = 'water:' + id
    materials.push(mat)
    group.add(new THREE.Mesh(mb.geometry(), mat))
  }

  // --- scatter: pines, boulders, scrub -------------------------------------
  // Each entry names a segment of a cross-section and how far along it to
  // stand, so everything is planted on the surface the loft actually built.
  const kinds = new Map<string, THREE.Matrix4[]>()
  const legForSample = (i: number) => {
    for (const l of art.legs) if (i >= l.range[0] && i <= l.range[1]) return l
    return art.legs[0]
  }
  const _a = new THREE.Vector3()
  const _b = new THREE.Vector3()
  for (const s of art.scatter) {
    const leg = legForSample(s.i)
    _a.copy(chainPoint(leg, s.i, s.k))
    _b.copy(chainPoint(leg, s.i, s.k + 1))
    // A rung too steep to hold a boulder does not get one: half a sphere
    // hanging off a cliff face is the clearest way to lose the low-poly read.
    const run = Math.hypot(_b.x - _a.x, _b.z - _a.z)
    const slope = run < 0.001 ? 9 : Math.abs(_b.y - _a.y) / run
    if (slope > 0.85 && s.kind !== 'pine') continue
    if (slope > 1.0) continue // nothing roots on a cliff face
    // Placed with the SAME function that generated the surface, and jittered
    // off the rung grid.
    //
    // Two bugs in one line before this. The instance was placed on the straight
    // line between two rungs, but the built surface is that line plus bedding,
    // so props sat above or inside it — pale shards hanging in the air over the
    // far bank and boulders floating in the river. And every instance landed
    // exactly on a rung at exactly a sample, so the pines came out in rows: the
    // rim terrace read as an orchard, which is a plantation, not a hillside.
    const js = h1(s.i * 7.1 + s.k * 3.3 + s.t * 19)
    const jt = h1(s.i * 2.9 + s.k * 13.7 + s.t * 5)
    const ii = s.i + (jt - 0.5) * 1.6
    const uu = Math.max(0, Math.min(1, s.t + (js - 0.5) * 0.5))
    const i0 = Math.floor(ii)
    const fr = ii - i0
    const p = subPoint(i0, s.k, uu, new THREE.Vector3()).clone()
    if (fr > 0.001) p.lerp(subPoint(i0 + 1, s.k, uu, new THREE.Vector3()), fr)
    // And nothing floats. If the heightfield disagrees with this instance's
    // base by more than a metre, the ground it was placed on is not the ground
    // that got built, and a pine hanging in open sky is the loudest possible
    // authoring error in a wide shot.
    const ground = shadow.heightAt(p.x, p.z)
    if (ground < -1e8 || Math.abs(ground - p.y) > 1.0) continue
    const variant =
      s.kind === 'pine' ? 'pine' + (Math.floor(h1(s.i * 3.7 + s.k * 11 + s.t * 13) * 3) % 3) : s.kind
    let list = kinds.get(variant)
    if (!list) {
      list = []
      kinds.set(variant, list)
    }
    // Bed it in. A boulder resting exactly on the surface shows its underside to
    // any camera below its horizon, and an underside is a flat plate: from the
    // walking camera the far bank was littered with pale wedges that read as
    // hovering paper. A quarter of its own size under the surface is what makes
    // it a rock that fell off the wall rather than one placed on it.
    if (s.kind === 'rock') p.y -= s.scale * 0.1
    else if (s.kind === 'scrub') p.y -= s.scale * 0.06
    const m = new THREE.Matrix4()
    m.compose(
      p,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot),
      new THREE.Vector3(s.scale, s.scale, s.scale),
    )
    list.push(m)
  }
  {
    const f = art.fallenPine
    kinds.set('fallen-pine', [
      new THREE.Matrix4().compose(
        new THREE.Vector3(f.at[0], f.at[1], f.at[2]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.rot),
        new THREE.Vector3(f.scale, f.scale, f.scale),
      ),
    ])
  }

  const scatterMat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    ramp: FOLIAGE_RAMP,
    model: WORLD_MODEL,
    // A pine crown is a dozen rounded facets and half of what the camera sees
    // of one from the canyon floor points DOWNWARD. At the world's 0.45 those
    // faces lost nearly half their value on top of the shade slide, and the
    // documented `#4E6E58` rendered `#44584B` — dE 27, and the hex was present
    // on 0.0-1.8% of every frame in the judged set. A canopy underside is
    // genuinely darker than its top; it is not half as bright.
    skyDrop: 0.22,
    hazeFloor: art.hazeFloor,
    hazeDepth: art.hazeDepth,
  })
  scatterMat.name = 'scatter'
  materials.push(scatterMat)

  for (const [kind, list] of kinds) {
    const geom = kind.startsWith('pine')
      ? pineGeometry(Number(kind.slice(4)) || 0)
      : kind === 'rock'
        ? boulderGeometry()
        : kind === 'scrub'
          ? scrubGeometry()
          : kind === 'fallen-pine'
            ? fallenPineGeometry()
            : null
    if (!geom) continue
    const im = new THREE.InstancedMesh(geom, scatterMat, list.length)
    list.forEach((m, i) => im.setMatrixAt(i, m))
    im.instanceMatrix.needsUpdate = true
    im.frustumCulled = false
    group.add(im)
  }

  // --- what lies past the rim ----------------------------------------------
  const beyond = new MeshBuilder()
  for (const hse of art.beyond.houses) house(beyond, hse)
  // Buildings cast, like everything else. A town lit flat while the hillside
  // below it is covered in long shadows reads as composited in.
  for (const r of art.beyond.ridges) ridge(beyond, r)
  for (const t of art.beyond.terraces ?? []) {
    const [w, d] = t.size
    const c = Math.cos(t.rotY)
    const sn = Math.sin(t.rotY)
    const pt = (u: number, v: number, y: number) =>
      new THREE.Vector3(t.at[0] + u * c - v * sn, t.at[1] + y, t.at[2] + u * sn + v * c)
    // tread
    beyond.quad(
      pt(-w / 2, -d / 2, 0),
      pt(w / 2, -d / 2, 0),
      pt(w / 2, d / 2, 0),
      pt(-w / 2, d / 2, 0),
      CH1.limestone.hex,
      SHADOW_MIX.limestone,
      0.98 + h1(t.at[0]) * 0.05,
    )
    // riser, facing back up the hill: the terrace edge is what reads at distance
    beyond.quad(
      pt(-w / 2, -d / 2, 0),
      pt(-w / 2, d / 2, 0),
      pt(-w / 2, d / 2, -t.drop),
      pt(-w / 2, -d / 2, -t.drop),
      CH1.limestone.hex,
      SHADOW_MIX.limestone,
      0.96,
    )
  }
  for (const p of art.beyond.highland) {
    const [w, d] = p.size
    const c = Math.cos(p.rotY)
    const sn = Math.sin(p.rotY)
    const pt = (u: number, v: number, y: number) =>
      new THREE.Vector3(p.at[0] + u * c - v * sn, p.at[1] + y, p.at[2] + u * sn + v * c)
    // deep enough that a plateau reads as a headland going into the water
    // rather than a slab hanging in the sky behind the town
    const drop = 130
    const t = p.tilt
    beyond.quad(
      pt(-w / 2, -d / 2, t[0]),
      pt(w / 2, -d / 2, t[1]),
      pt(w / 2, d / 2, t[2]),
      pt(-w / 2, d / 2, t[3]),
      CH1.scrub.hex,
      SHADOW_MIX.foliage,
      0.98 + h1(p.at[0]) * 0.05,
    )
    // skirts, so the plateau has thickness and a silhouette edge
    const corner = [
      [-w / 2, -d / 2, t[0]],
      [w / 2, -d / 2, t[1]],
      [w / 2, d / 2, t[2]],
      [-w / 2, d / 2, t[3]],
    ]
    for (let e = 0; e < 4; e++) {
      const A = corner[e]
      const B = corner[(e + 1) % 4]
      beyond.quad(
        pt(A[0], A[1], A[2]),
        pt(B[0], B[1], B[2]),
        pt(B[0], B[1], -drop),
        pt(A[0], A[1], -drop),
        CH1.limestone.hex,
        SHADOW_MIX.limestone,
        0.97,
      )
    }
  }
  {
    const s = art.beyond.sea
    const [w, d] = s.size
    const c = Math.cos(s.rotY)
    const sn = Math.sin(s.rotY)
    const pt = (u: number, v: number) =>
      new THREE.Vector3(s.at[0] + u * c - v * sn, s.at[1], s.at[2] + u * sn + v * c)
    beyond.quad(
      pt(-w / 2, -d / 2),
      pt(w / 2, -d / 2),
      pt(w / 2, d / 2),
      pt(-w / 2, d / 2),
      CH1.sea.hex,
      SHADOW_MIX.distant,
    )
  }
  const beyondMat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    ramp: WORLD_RAMP,
    model: WORLD_MODEL * 0.6,
    hazeFloor: art.hazeFloor,
    hazeDepth: art.hazeDepth,
    side: THREE.DoubleSide,
    occlusionAttribute: true,
  })
  beyondMat.name = 'beyond'
  materials.push(beyondMat)
  group.add(new THREE.Mesh(beyond.geometry(), beyondMat))

  return {
    group,
    hazeFloor: art.hazeFloor,
    materials,
    sunOcclusionAt: (x, y, z) => shadow.sample(x, y, z),
    skyViewAt: (x, y, z) => shadow.skyViewCached(x, y, z),
    groundAt: (x, z) => {
      const h = shadow.heightAt(x, z)
      return h < -1e8 ? null : h
    },
  }
}

// --- primitives ------------------------------------------------------------
// A small library the engine owns. Placement is always chapter data.

/**
 * Aleppo pine. Bare leaning trunk, canopy carried high and flat as two or three
 * offset umbrella masses. That silhouette is the point: it has to be a pine
 * from outline alone, at fog distance, with no texture on it.
 */
function pineGeometry(variant: number): THREE.BufferGeometry {
  const mb = new MeshBuilder()
  const trunkHex = CH1.deadwood.hex
  const pineHex = CH1.pine.hex

  // Mediterranean pine, not an acacia. The first pass built a thin whippy bole
  // carrying stacked flat plates, which is the umbrella thorn of the Serengeti
  // and put every wide shot of this canyon in the wrong continent. The read
  // here is: a THICK bole, barely tapering, leaning a little; and a crown of
  // solid overlapping masses with real vertical depth, wider than it is tall
  // but never a disc. Silhouette is a mushroom, not a shelf.
  const hgt = [3.4, 4.1, 2.8][variant] ?? 3.4
  const lean = [0.1, -0.14, 0.06][variant] ?? 0.08
  const r0 = [0.23, 0.26, 0.19][variant] ?? 0.22
  const SIDES = 6
  const curve = (t: number) => lean * t * t * hgt

  const ring = (t: number, r: number) => {
    const pts: THREE.Vector3[] = []
    const y = t * hgt
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2
      const rr = r * (0.86 + h1(i * 4.1 + variant * 3 + t * 9) * 0.28)
      pts.push(new THREE.Vector3(Math.cos(a) * rr + curve(t), y, Math.sin(a) * rr))
    }
    return pts
  }
  // A root flare at the base and a real taper up the bole. Without them the
  // trunk is a stick pushed into the ground and the tree reads as a thumbtack
  // in close-up, however well the massed ridge line works.
  const taper = (t: number) => (t < 0.14 ? 1.55 - t * 3.2 : 1.1 - t * 0.42)
  const steps = 5
  for (let st = 0; st < steps; st++) {
    const t0 = st / steps
    const t1 = (st + 1) / steps
    const a = ring(t0, r0 * taper(t0))
    const b = ring(t1, r0 * taper(t1))
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES
      mb.quad(a[i], b[i], b[j], a[j], trunkHex, SHADOW_MIX.ground, 0.96 + h1(st * 3 + i) * 0.08)
    }
  }

  // Two or three limbs forking near the top and carrying the crown outward.
  const topX = curve(1)
  const forks: [number, number, number][] =
    variant === 0
      ? [
          [0.45, 0.2, 1.0],
          [-0.6, -0.35, 0.85],
          [0.15, -0.7, 0.7],
        ]
      : variant === 1
        ? [
            [-0.55, 0.4, 1.0],
            [0.7, -0.15, 0.9],
            [-0.1, -0.75, 0.72],
          ]
        : [
            [0.3, 0.15, 1.0],
            [-0.5, -0.4, 0.8],
          ]
  for (const [ox, oz, k] of forks) {
    const cy = hgt + 0.55 * k
    const tip = new THREE.Vector3(topX + ox * 1.05, cy, oz * 1.05)
    const w = 0.085 * k
    // limb as a short tapered prism, so it has mass where it meets the crown
    for (let i = 0; i < SIDES; i++) {
      const a0 = (i / SIDES) * Math.PI * 2
      const a1 = ((i + 1) / SIDES) * Math.PI * 2
      const base0 = new THREE.Vector3(topX + Math.cos(a0) * r0 * 0.6, hgt - 0.45, Math.sin(a0) * r0 * 0.6)
      const base1 = new THREE.Vector3(topX + Math.cos(a1) * r0 * 0.6, hgt - 0.45, Math.sin(a1) * r0 * 0.6)
      const t0 = new THREE.Vector3(tip.x + Math.cos(a0) * w, tip.y - 0.1, tip.z + Math.sin(a0) * w)
      const t1 = new THREE.Vector3(tip.x + Math.cos(a1) * w, tip.y - 0.1, tip.z + Math.sin(a1) * w)
      mb.quad(base0, t0, t1, base1, trunkHex, SHADOW_MIX.ground, 0.95)
    }
    blob(mb, tip.x, cy + 0.5 * k, tip.z, 1.5 * k, 0.82 * k, pineHex, variant * 7 + ox * 13)
  }
  // a filling mass over the fork, so the crown is one canopy and not three hats
  blob(mb, topX, hgt + 0.95, 0, 1.35, 0.78, pineHex, variant * 11 + 5)

  return mb.geometry()
}

/** An irregular low-poly lump: the crown mass a pine is actually made of. */
function blob(
  mb: MeshBuilder,
  cx: number,
  cy: number,
  cz: number,
  rad: number,
  hgt: number,
  hex: string,
  seed: number,
) {
  const RINGS = 3
  const SEG = 7
  const rows: THREE.Vector3[][] = []
  for (let r = 0; r <= RINGS; r++) {
    const v = r / RINGS // 0 top .. 1 bottom
    const theta = v * Math.PI
    const rr = Math.sin(theta)
    const row: THREE.Vector3[] = []
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2
      const wob = 0.78 + h1(i * 5.3 + r * 11.7 + seed) * 0.46
      row.push(
        new THREE.Vector3(
          cx + Math.cos(a) * rr * rad * wob,
          cy + Math.cos(theta) * hgt * (0.85 + h1(i * 2.1 + r + seed) * 0.3),
          cz + Math.sin(a) * rr * rad * wob,
        ),
      )
    }
    rows.push(row)
  }
  const apex = new THREE.Vector3(cx, cy + hgt, cz)
  const base = new THREE.Vector3(cx, cy - hgt * 0.85, cz)
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG
    mb.tri(apex, rows[1][i], rows[1][j], hex, SHADOW_MIX.foliage, 1.02 + h1(i + seed) * 0.04)
    for (let r = 1; r < RINGS; r++) {
      mb.quad(
        rows[r][i],
        rows[r + 1][i],
        rows[r + 1][j],
        rows[r][j],
        hex,
        SHADOW_MIX.foliage,
        0.94 + h1(i * 3 + r * 7 + seed) * 0.1,
      )
    }
    mb.tri(base, rows[RINGS][j], rows[RINGS][i], hex, SHADOW_MIX.foliage, 0.88)
  }
}

/**
 * Limestone boulder. Faceted, blocky, and only a third buried — most of one
 * sunk into the ground leaves a flat grey plate lying on the surface, which
 * reads as litter rather than as rock that fell off the wall above it.
 */
function boulderGeometry(): THREE.BufferGeometry {
  const mb = new MeshBuilder()
  // One subdivision, not none. A bare icosahedron quantised down to quarry
  // faces presents two or three planes to any camera, and under a two-stop ramp
  // two planes is two values: the boulders read as doorstops — a flat wedge of
  // shadow-hex with one lit triangle on top. Eighty faces is still low-poly and
  // it is enough for a lump to have a top, a shoulder and a side.
  const base = new THREE.IcosahedronGeometry(1, 1)
  const p = base.attributes.position
  const v: THREE.Vector3[] = []
  for (let i = 0; i < p.count; i++) {
    const q = new THREE.Vector3().fromBufferAttribute(p, i)
    // pull each vertex toward one of three plane normals, so the lump comes out
    // of the ground with flat quarry faces instead of as a smooth pebble
    // Irregular in all three axes. Quantising only x and z left a straight
    // apex ridge and bilateral symmetry, which reads as a canvas tent.
    // Coherent lumps, not per-vertex spikes. The radius used to be a hash of
    // the vertex's own coordinates, which is white noise: at eighty faces that
    // came out as crumpled paper, every facet pointing somewhere different and
    // the near-binary ramp turning that into a mosaic of tan and grey. A smooth
    // 3-D noise across the sphere gives two or three broad lobes instead, and
    // the facets on each lobe agree with their neighbours.
    const k = 0.82 + (vnoise3(q.x * 1.6, q.y * 1.6, q.z * 1.6, 5) * 0.5 + 0.5) * 0.34
    q.multiplyScalar(k)
    // Quantised onto a coarse lattice so the lump comes out with quarry faces.
    // The lattice used to be coarse enough (steps of 1/2.2 on a unit sphere,
    // about five levels) that neighbouring vertices landed on the SAME point:
    // the triangles between them collapsed, and what survived at mid distance
    // was a flat kite with no side face, no thickness and one hard diagonal
    // fold across it. The tent read was replaced by a paper read. Finer steps
    // keep the faceting and stop the collapse.
    // A light quantisation only. With eighty faces the facets themselves are
    // the quarry faces; a coarse lattice on top of them shreds the lobes.
    q.x = Math.round(q.x * 7.5) / 7.5
    q.y = Math.round(q.y * 6.6) / 6.6
    q.z = Math.round(q.z * 7.1) / 7.1
    // A floor on the radius, so no vertex is pulled into the centre and no face
    // is left as a sliver.
    const rl = q.length()
    if (rl < 0.62) q.multiplyScalar(0.62 / Math.max(rl, 1e-4))
    // Sits ON the ground with only its foot in it.
    //
    // Sunk by a third of its own height it was reliably OVER-buried: the
    // surface it is placed against is the lofted mesh, but that mesh rises and
    // falls within one instance's footprint, so on any slope a boulder went
    // under. What survived above the surface was the cap — one flat facet with
    // no side face and no thickness — and the banks came out littered with
    // triangular sheets of paper. Better to have one occasionally perched than
    // a field of plates.
    // Less sunk than before. At a third of its height the lump lost its
    // shoulder and what remained above the surface was a wedge; the whole
    // point of a boulder in this frame is that it is a ROUNDED mass among
    // straight-edged terrain.
    q.y = q.y * 1.06 - 0.08
    v.push(q)
  }
  for (let i = 0; i < v.length; i += 3) {
    mb.tri(
      v[i],
      v[i + 1],
      v[i + 2],
      CH1.limestone.hex,
      SHADOW_MIX.limestone,
      0.98 + h1(i) * 0.04,
    )
  }
  base.dispose()
  return mb.geometry()
}

/**
 * Low canyon scrub: a cluster of squat domes. Built as cones with a flat
 * underside they read as green shards from any raised camera, and the town
 * reveal looks down on all of them.
 */
function scrubGeometry(): THREE.BufferGeometry {
  const mb = new MeshBuilder()
  // Three domes, and the middle one carries the read. Wobble is kept low and
  // the rings are kept round on purpose: a six-sided ring whose radius swings
  // 0.78 to 1.22 per vertex is a star, not a bush, and at the three or four
  // pixels a scrub occupies from the town-reveal camera a star resolves to a
  // pair of dark-green triangles lying edge-on in the sand. It read as torn
  // paper. Roundness is what survives minification; irregularity is what does
  // not, and this prop is only ever seen small.
  for (const [ox, oz, r, hh, seed] of [
    [0, 0, 0.7, 0.54, 3],
    [0.46, 0.24, 0.5, 0.4, 11],
    [-0.34, 0.38, 0.44, 0.35, 19],
  ]) {
    const RINGS = 3
    const SEG = 8
    const rows: THREE.Vector3[][] = []
    for (let ri = 0; ri <= RINGS; ri++) {
      const v = ri / RINGS
      const rr = Math.sin((v * Math.PI) / 2 + 0.3)
      const row: THREE.Vector3[] = []
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2
        const wob = 0.9 + h1(i * 5.1 + ri * 7.3 + seed) * 0.2
        row.push(
          new THREE.Vector3(
            ox + Math.cos(a) * rr * r * wob,
            hh * Math.cos((v * Math.PI) / 2) * (0.9 + h1(i * 2.7 + seed) * 0.2),
            oz + Math.sin(a) * rr * r * wob,
          ),
        )
      }
      rows.push(row)
    }
    const apex = new THREE.Vector3(ox, hh, oz)
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG
      mb.tri(apex, rows[0][i], rows[0][j], CH1.scrub.hex, SHADOW_MIX.foliage, 1.02)
      for (let ri = 0; ri < RINGS; ri++) {
        mb.quad(
          rows[ri][i],
          rows[ri + 1][i],
          rows[ri + 1][j],
          rows[ri][j],
          CH1.scrub.hex,
          SHADOW_MIX.foliage,
          0.94 + h1(i * 3 + ri + seed) * 0.1,
        )
      }
    }
  }
  return mb.geometry()
}

/** The crossing over the deep channel: one long dead pine, bark off. */
function fallenPineGeometry(): THREE.BufferGeometry {
  const mb = new MeshBuilder()
  const SIDES = 6
  const L = 1 // unit length; the instance scale is the span
  const ring = (t: number, r: number) => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2
      pts.push(new THREE.Vector3((t - 0.5) * L, Math.sin(a) * r, Math.cos(a) * r))
    }
    return pts
  }
  const steps = 6
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps
    const t1 = (s + 1) / steps
    const r0 = (0.055 - t0 * 0.022) * (1 + Math.sin(t0 * 9) * 0.06)
    const r1 = (0.055 - t1 * 0.022) * (1 + Math.sin(t1 * 9) * 0.06)
    const a = ring(t0, r0)
    const b = ring(t1, r1)
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES
      mb.quad(a[i], b[i], b[j], a[j], CH1.deadwood.hex, SHADOW_MIX.ground, 0.97 + h1(s + i) * 0.06)
    }
  }
  // snapped branch stubs, so it reads as a tree that fell and not as a plank
  for (const [t, ang, len] of [
    [0.22, 1.1, 0.09],
    [0.55, -0.8, 0.07],
    [0.78, 2.4, 0.06],
  ]) {
    const base = new THREE.Vector3((t - 0.5) * L, Math.sin(ang) * 0.045, Math.cos(ang) * 0.045)
    const tip = new THREE.Vector3(
      base.x + 0.02,
      base.y + Math.sin(ang) * len,
      base.z + Math.cos(ang) * len,
    )
    const w = 0.016
    mb.quad(
      new THREE.Vector3(base.x - w, base.y, base.z),
      new THREE.Vector3(base.x + w, base.y, base.z),
      new THREE.Vector3(tip.x + w, tip.y, tip.z),
      new THREE.Vector3(tip.x - w, tip.y, tip.z),
      CH1.deadwood.hex,
      SHADOW_MIX.ground,
      0.93,
    )
  }
  return mb.geometry()
}

/** A town house: walls plus a pitched roof. Roofs are burnt orange, never red. */
function house(
  mb: MeshBuilder,
  h: { at: [number, number, number]; size: [number, number, number]; rotY: number; roof: number },
) {
  const [w, hh, d] = h.size
  const c = Math.cos(h.rotY)
  const s = Math.sin(h.rotY)
  const P = (u: number, v: number, y: number) =>
    new THREE.Vector3(h.at[0] + u * c - v * s, h.at[1] + y, h.at[2] + u * s + v * c)
  const hw = w / 2
  const hd = d / 2
  const hy = hh / 2
  const wall = CH1.townStone.hex
  const sm = SHADOW_MIX.distant
  // four walls
  mb.quad(P(-hw, hd, -hy), P(hw, hd, -hy), P(hw, hd, hy), P(-hw, hd, hy), wall, sm)
  mb.quad(P(hw, -hd, -hy), P(-hw, -hd, -hy), P(-hw, -hd, hy), P(hw, -hd, hy), wall, sm, 0.94)
  mb.quad(P(hw, hd, -hy), P(hw, -hd, -hy), P(hw, -hd, hy), P(hw, hd, hy), wall, sm, 0.97)
  mb.quad(P(-hw, -hd, -hy), P(-hw, hd, -hy), P(-hw, hd, hy), P(-hw, -hd, hy), wall, sm, 0.91)
  // gable roof, ridge running along the long axis, with an eave overhang
  const eave = 0.35
  const ry = hy
  const rt = hy + h.roof
  const A = P(-hw - eave, hd + eave, ry)
  const B = P(hw + eave, hd + eave, ry)
  const Cc = P(hw + eave, -hd - eave, ry)
  const D = P(-hw - eave, -hd - eave, ry)
  const R0 = P(-hw - eave, 0, rt)
  const R1 = P(hw + eave, 0, rt)
  const roof = CH1.townRoof.hex
  mb.quad(A, B, R1, R0, roof, SHADOW_MIX.distant)
  mb.quad(Cc, D, R0, R1, roof, SHADOW_MIX.distant, 0.9)
  mb.tri(B, Cc, R1, roof, SHADOW_MIX.distant, 0.95)
  mb.tri(D, A, R0, roof, SHADOW_MIX.distant, 0.95)
}

/** A far headland: a faceted ridge silhouette. Fog does the rest. */
function ridge(
  mb: MeshBuilder,
  r: { at: [number, number, number]; size: [number, number, number]; rotY: number },
) {
  const [w, hh, d] = r.size
  const c = Math.cos(r.rotY)
  const s = Math.sin(r.rotY)
  const P = (u: number, v: number, y: number) =>
    new THREE.Vector3(r.at[0] + u * c - v * s, r.at[1] + y, r.at[2] + u * s + v * c)
  const N = 9
  const top: number[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const ridgeline =
      hh * (0.45 + 0.55 * Math.sin(t * Math.PI)) * (0.72 + h1(i * 7.3 + r.at[0]) * 0.5)
    top.push(ridgeline)
  }
  const hex = CH1.limestone.hex
  for (let i = 0; i < N; i++) {
    const u0 = -w / 2 + (w / N) * i
    const u1 = -w / 2 + (w / N) * (i + 1)
    // front face
    mb.quad(P(u0, -d / 2, 0), P(u1, -d / 2, 0), P(u1, -d / 2, top[i + 1]), P(u0, -d / 2, top[i]), hex, SHADOW_MIX.distant, 0.98)
    // top facet running back
    mb.quad(
      P(u0, -d / 2, top[i]),
      P(u1, -d / 2, top[i + 1]),
      P(u1, d / 2, top[i + 1] * 0.55),
      P(u0, d / 2, top[i] * 0.55),
      hex,
      SHADOW_MIX.distant,
      1.02,
    )
  }
}

export { SURFACE as ART_SURFACES }
