import * as THREE from 'three'
import { CH1, SHADOW_MIX } from './palette'
import { makeRamp, sunDirection } from './RampMaterial'

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
const SURFACE: Record<string, { hex: string; shadow: number; grain?: number; tint?: number }> = {
  path: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.04 },
  gravel: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.045 },
  dust: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.038 },
  // Scree and sand are not their own colours. art-direction.md gives Chapter 1
  // five ground-and-stone hexes and no more; a talus slope is broken limestone
  // and a sand bar is the same pale gravel the path is. Inventing a value for
  // each of them is how a documented palette quietly becomes a suggestion — and
  // between them they were occupying more of the frame than the two hexes the
  // document actually names.
  sand: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.035 },
  wetstone: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.03, tint: 0.78 },
  scree: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.055 },
  limestone: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.042 },
  rock: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.028 },
  scrub: { hex: CH1.scrub.hex, shadow: SHADOW_MIX.foliage, grain: 0.03 },
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

/** Per-vertex value mottling from world position, two octaves. */
function mottle(p: THREE.Vector3, amount: number): number {
  const a = vnoise(p.x * 0.31 + p.z * 0.17, 3) * 0.6
  const b = vnoise(p.x * 0.93 - p.z * 0.71, 11) * 0.4
  return 1 + (a + b) * amount
}

export interface ArtScene {
  group: THREE.Group
  hazeFloor: number
  /** Every material built here, for the runtime half of the red audit. */
  materials: THREE.Material[]
  /** 0 = in full sun, 1 = fully in a terrain shadow, at any world point. */
  sunOcclusionAt: (x: number, y: number, z: number) => number
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

  sample(x: number, y: number, z: number): number {
    const s = this.sun
    const flat = Math.hypot(s.x, s.z) || 1
    const dx = s.x / flat
    const dz = s.z / flat
    const dy = s.y / flat
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
  for (const leg of art.legs) {
    const a = leg.range[0]
    const b = leg.range[1]
    for (let i = a; i < b; i++) {
      for (let k = 0; k < leg.chain.length - 1; k++) {
        const A = chainPoint(leg, i, k)
        const B = chainPoint(leg, i + 1, k)
        const Cc = chainPoint(leg, i + 1, k + 1)
        const D = chainPoint(leg, i, k + 1)
        // Each rung carries its own material and they gradate across the face.
        const s0 = SURFACE[leg.chain[k].m] ?? SURFACE.limestone
        const s1 = SURFACE[leg.chain[k + 1].m] ?? SURFACE.limestone
        // Mottling, computed PER VERTEX from world position rather than per
        // face. Flat colour across a 1.5 m face is what makes low-poly ground
        // read as paper; a soft gradient across it is what stops that, and it
        // has to be a gradient or the ground becomes a patchwork of tiles.
        const g0 = s0.grain ?? 0
        const g1 = s1.grain ?? 0
        const k0 = s0.tint ?? 1
        const k1 = s1.tint ?? 1
        const tone: [number, number, number, number] = [
          (g0 ? mottle(A, g0) : 1) * k0,
          (g0 ? mottle(B, g0) : 1) * k0,
          (g1 ? mottle(Cc, g1) : 1) * k1,
          (g1 ? mottle(D, g1) : 1) * k1,
        ]
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
          [
            shadow.at(leg, i, k),
            shadow.at(leg, i + 1, k),
            shadow.at(leg, i + 1, k + 1),
            shadow.at(leg, i, k + 1),
          ],
          [
            shadow.aoAt(leg, i, k),
            shadow.aoAt(leg, i + 1, k),
            shadow.aoAt(leg, i + 1, k + 1),
            shadow.aoAt(leg, i, k + 1),
          ],
        )
      }
    }
  }
  const landMat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    occlusionAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
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
    const p = _a.clone().lerp(_b, s.t)
    // And nothing floats. If the heightfield disagrees with this instance's
    // base by more than a metre, the ground it was placed on is not the ground
    // that got built, and a pine hanging in open sky is the loudest possible
    // authoring error in a wide shot.
    const ground = shadow.heightAt(p.x, p.z)
    if (ground < -1e8 || Math.abs(ground - p.y) > 1.2) continue
    const variant =
      s.kind === 'pine' ? 'pine' + (Math.floor(h1(s.i * 3.7 + s.k * 11 + s.t * 13) * 3) % 3) : s.kind
    let list = kinds.get(variant)
    if (!list) {
      list = []
      kinds.set(variant, list)
    }
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
  const base = new THREE.IcosahedronGeometry(1, 0)
  const p = base.attributes.position
  const v: THREE.Vector3[] = []
  for (let i = 0; i < p.count; i++) {
    const q = new THREE.Vector3().fromBufferAttribute(p, i)
    // pull each vertex toward one of three plane normals, so the lump comes out
    // of the ground with flat quarry faces instead of as a smooth pebble
    // Irregular in all three axes. Quantising only x and z left a straight
    // apex ridge and bilateral symmetry, which reads as a canvas tent.
    const k = 0.66 + h1(Math.round(q.x * 97 + q.y * 31 + q.z * 13)) * 0.6
    q.multiplyScalar(k)
    q.x = Math.round(q.x * 2.6 + h1(q.z * 37) * 0.6) / 2.6
    q.y = Math.round(q.y * 2.2 + h1(q.x * 53) * 0.6) / 2.2
    q.z = Math.round(q.z * 2.4 + h1(q.y * 41) * 0.6) / 2.4
    // less flattened: from a raised camera a squat boulder's top face is a
    // large flat plate, which is what the town reveal looks straight down on
    q.y = q.y * 1.05 - 0.34
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
  for (const [ox, oz, r, hh, seed] of [
    [0, 0, 0.62, 0.46, 3],
    [0.5, 0.26, 0.44, 0.34, 11],
    [-0.36, 0.4, 0.38, 0.29, 19],
  ]) {
    const RINGS = 2
    const SEG = 6
    const rows: THREE.Vector3[][] = []
    for (let ri = 0; ri <= RINGS; ri++) {
      const v = ri / RINGS
      const rr = Math.sin((v * Math.PI) / 2 + 0.25)
      const row: THREE.Vector3[] = []
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2
        const wob = 0.78 + h1(i * 5.1 + ri * 7.3 + seed) * 0.44
        row.push(
          new THREE.Vector3(
            ox + Math.cos(a) * rr * r * wob,
            hh * Math.cos((v * Math.PI) / 2) * (0.8 + h1(i * 2.7 + seed) * 0.4),
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
