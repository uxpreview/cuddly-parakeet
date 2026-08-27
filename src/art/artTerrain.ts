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
    fromO: number
    toO: number
    drop: number
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
const SURFACE: Record<string, { hex: string; shadow: number; grain?: number }> = {
  path: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground },
  gravel: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.022 },
  dust: { hex: CH1.path.hex, shadow: SHADOW_MIX.ground, grain: 0.015 },
  sand: { hex: CH1.sand.hex, shadow: SHADOW_MIX.ground },
  wetstone: { hex: CH1.wetStone.hex, shadow: SHADOW_MIX.ground },
  scree: { hex: CH1.scree.hex, shadow: 0.85, grain: 0.03 },
  limestone: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.028 },
  rock: { hex: CH1.limestone.hex, shadow: SHADOW_MIX.limestone, grain: 0.028 },
  scrub: { hex: CH1.scrub.hex, shadow: SHADOW_MIX.foliage, grain: 0.03 },
  deadwood: { hex: CH1.deadwood.hex, shadow: SHADOW_MIX.ground },
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
  private c = new THREE.Color()

  private push(p: THREE.Vector3, hex: string, shade: number, tone: number, o: number) {
    this.pos.push(p.x, p.y, p.z)
    this.c.set(hex)
    this.col.push(this.c.r * tone, this.c.g * tone, this.c.b * tone)
    this.shadow.push(shade)
    this.occ.push(o)
  }

  tri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    cc: THREE.Vector3,
    hex: string,
    shade: number,
    tone = 1,
    occ: [number, number, number] = [0, 0, 0],
  ) {
    this.push(a, hex, shade, tone, occ[0])
    this.push(b, hex, shade, tone, occ[1])
    this.push(cc, hex, shade, tone, occ[2])
  }

  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    cc: THREE.Vector3,
    d: THREE.Vector3,
    hex: string,
    shade: number,
    tone = 1,
    occ: [number, number, number, number] = [0, 0, 0, 0],
  ) {
    this.tri(a, b, cc, hex, shade, tone, [occ[0], occ[1], occ[2]])
    this.tri(a, cc, d, hex, shade, tone, [occ[0], occ[2], occ[3]])
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
    g.computeVertexNormals() // non-indexed: every face gets its own normal
    return g
  }
}

export interface ArtScene {
  group: THREE.Group
  hazeFloor: number
  /** Every material built here, for the runtime half of the red audit. */
  materials: THREE.Material[]
  /** 0 = in full sun, 1 = fully in a terrain shadow, at any world point. */
  sunOcclusionAt: (x: number, y: number, z: number) => number
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

  /** One ray: is anything between this point and the sun? */
  private blocked(x: number, y: number, z: number, dx: number, dz: number, dy: number): boolean {
    const STEP = 1.6
    for (let t = STEP; t < 62; t += STEP) {
      const hy = this.height(x + dx * t, z + dz * t)
      if (hy > y + dy * t + 0.35) return true
    }
    return false
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

  const legOf = new Map<string, (typeof art.legs)[number]>()
  for (const l of art.legs) legOf.set(l.name, l)

  // A cross-section point in world space. The jitter is a deterministic
  // function of (sample, chain index), so anything that needs to sit exactly on
  // this surface later can ask for the same point and get the same answer.
  const chainPoint = (leg: (typeof art.legs)[number], i: number, k: number) => {
    const p = leg.chain[Math.max(0, Math.min(leg.chain.length - 1, k))]
    const [cx, cy, cz, h] = centerAt(i)
    const lx = Math.sin(h)
    const lz = -Math.cos(h)
    const sign = p.o < 0 ? -1 : 1
    const o = p.o + vnoise(i / 3.4, k * 3 + 1) * p.j * sign
    const y = p.y + vnoise(i / 5.1, k * 3 + 2) * p.j * 0.55
    return new THREE.Vector3(cx + lx * o, cy + y, cz + lz * o)
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
    // one sample of overlap into each neighbour so legs of different width
    // interpenetrate instead of cracking apart at the seam
    const a = Math.max(0, leg.range[0] - 1)
    const b = Math.min(C.length - 1, leg.range[1] + 1)
    for (let i = a; i < b; i++) {
      for (let k = 0; k < leg.chain.length - 1; k++) {
        const A = chainPoint(leg, i, k)
        const B = chainPoint(leg, i + 1, k)
        const Cc = chainPoint(leg, i + 1, k + 1)
        const D = chainPoint(leg, i, k + 1)
        // a face takes the colour of whichever of its two rungs is further out
        const p0 = leg.chain[k]
        const p1 = leg.chain[k + 1]
        const src = SURFACE[(p1.o >= 0 ? p1 : p0).m] ?? SURFACE.limestone
        // vary along BOTH axes: noise that only moves along the centerline
        // paints vertical streaks down a cliff, which reads as water staining
        const tone = src.grain
          ? 1 + (vnoise(i / 2.6, k * 7 + 40) * 0.6 + vnoise(k * 1.7, i * 3 + 5) * 0.4) * src.grain
          : 1
        land.quad(A, B, Cc, D, src.hex, src.shadow, tone, [
          shadow.at(leg, i, k),
          shadow.at(leg, i + 1, k),
          shadow.at(leg, i + 1, k + 1),
          shadow.at(leg, i, k + 1),
        ])
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
  for (const w of art.waters) {
    let mb = byWater.get(w.material)
    if (!mb) {
      mb = new MeshBuilder()
      byWater.set(w.material, mb)
    }
    const src = SURFACE[w.material] ?? SURFACE.river
    const a = Math.max(0, w.range[0] - 1)
    const b = Math.min(C.length - 1, w.range[1] + 1)
    const SEG = 3
    const at = (idx: number, o: number) => {
      const [cx, cy, cz, h] = centerAt(idx)
      return new THREE.Vector3(cx + Math.sin(h) * o, cy - w.drop, cz - Math.cos(h) * o)
    }
    for (let i = a; i < b; i++) {
      for (let k = 0; k < SEG; k++) {
        const o0 = w.fromO + ((w.toO - w.fromO) * k) / SEG
        const o1 = w.fromO + ((w.toO - w.fromO) * (k + 1)) / SEG
        const tone = 1 + Math.max(0, vnoise(i / 2.6, k * 11 + 3)) * 0.05
        mb.quad(at(i, o0), at(i + 1, o0), at(i + 1, o1), at(i, o1), src.hex, src.shadow, tone)
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
    if (slope > 1.5) continue
    const p = _a.clone().lerp(_b, s.t)
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
      CH1.scree.hex,
      0.85,
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
  })
  beyondMat.name = 'beyond'
  materials.push(beyondMat)
  group.add(new THREE.Mesh(beyond.geometry(), beyondMat))

  return {
    group,
    hazeFloor: art.hazeFloor,
    materials,
    sunOcclusionAt: (x, y, z) => shadow.sample(x, y, z),
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
  // Aleppo pine: a short bare trunk that curves as it rises, then the canopy
  // carried high, wide and flat. Half the height is trunk and the canopy is
  // wider than the tree is tall — that proportion is the whole silhouette.
  const hgt = [3.1, 3.7, 2.5][variant] ?? 3.1
  const bend = [0.32, -0.42, 0.18][variant] ?? 0.25
  const SIDES = 5
  const curve = (t: number) => bend * t * t // no shear at the base

  const ring = (t: number, r: number) => {
    const pts: THREE.Vector3[] = []
    const y = t * hgt
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r + curve(t) * hgt, y, Math.sin(a) * r))
    }
    return pts
  }
  const steps = 3
  for (let s = 0; s < steps; s++) {
    const t0 = s / steps
    const t1 = (s + 1) / steps
    const a = ring(t0, 0.15 - t0 * 0.06)
    const b = ring(t1, 0.15 - t1 * 0.06)
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES
      mb.quad(a[i], b[i], b[j], a[j], trunkHex, SHADOW_MIX.ground, 0.97 + h1(s * 3 + i) * 0.06)
    }
  }

  // two limbs reaching out to where the canopy sits, so the crown is carried
  const top = new THREE.Vector3(curve(1) * hgt, hgt, 0)
  const masses: [number, number, number, number, number][] = []
  const crown: [number, number, number][] =
    variant === 0
      ? [
          [0.35, 0.15, 1.0],
          [-0.75, -0.45, 0.72],
          [0.55, -0.85, 0.6],
        ]
      : variant === 1
        ? [
            [-0.5, 0.35, 1.0],
            [0.85, -0.2, 0.78],
            [-0.2, -0.9, 0.55],
          ]
        : [
            [0.2, 0.1, 1.0],
            [-0.6, -0.5, 0.62],
          ]
  for (const [ox, oz, k] of crown) {
    const cy = hgt + 0.45 * k + 0.18
    masses.push([cy, 1.55 * k + 0.35, 0.34 * k + 0.12, top.x + ox * 1.25, oz * 1.25])
    // the limb
    const w = 0.055
    mb.quad(
      new THREE.Vector3(top.x - w, hgt - 0.35, -w),
      new THREE.Vector3(top.x + w, hgt - 0.35, w),
      new THREE.Vector3(top.x + ox * 1.25 + w, cy - 0.1, oz * 1.25 + w),
      new THREE.Vector3(top.x + ox * 1.25 - w, cy - 0.1, oz * 1.25 - w),
      trunkHex,
      SHADOW_MIX.ground,
      0.95,
    )
  }

  for (const [cy, rad, thick, ox, oz] of masses) {
    const N = 8
    const rim: THREE.Vector3[] = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const rr = rad * (0.74 + h1(i * 3.3 + variant * 9 + cy * 7) * 0.46)
      // ragged: each rim point sits at its own height, so the silhouette is
      // never a clean disc
      const dy = (h1(i * 7.7 + variant * 3 + cy) - 0.5) * thick * 0.9
      rim.push(new THREE.Vector3(ox + Math.cos(a) * rr, cy + dy, oz + Math.sin(a) * rr))
    }
    const apex = new THREE.Vector3(ox, cy + thick, oz)
    const under = new THREE.Vector3(ox, cy - thick * 0.55, oz)
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      mb.tri(apex, rim[i], rim[j], pineHex, SHADOW_MIX.foliage, 1 + h1(i + variant * 5) * 0.06 - 0.02)
      mb.tri(under, rim[j], rim[i], pineHex, SHADOW_MIX.foliage, 0.9)
    }
  }
  return mb.geometry()
}

/** Limestone boulder: an irregular faceted lump, never a sphere. */
function boulderGeometry(): THREE.BufferGeometry {
  const mb = new MeshBuilder()
  const base = new THREE.IcosahedronGeometry(1, 0)
  const p = base.attributes.position
  const v: THREE.Vector3[] = []
  for (let i = 0; i < p.count; i++) {
    const q = new THREE.Vector3().fromBufferAttribute(p, i)
    const k = 0.62 + h1(Math.round(q.x * 97 + q.y * 31 + q.z * 13)) * 0.5
    q.multiplyScalar(k)
    q.y = q.y * 0.72 - 0.2 // squat, and sunk into the ground it rests on
    v.push(q)
  }
  for (let i = 0; i < v.length; i += 3) {
    mb.tri(v[i], v[i + 1], v[i + 2], CH1.limestone.hex, SHADOW_MIX.limestone, 0.97 + h1(i) * 0.05)
  }
  base.dispose()
  return mb.geometry()
}

/** Low canyon scrub: a couple of squashed domes. No flowers in chapter 1. */
function scrubGeometry(): THREE.BufferGeometry {
  const mb = new MeshBuilder()
  for (const [ox, oz, r, hh] of [
    [0, 0, 0.75, 0.5],
    [0.55, 0.3, 0.5, 0.34],
    [-0.4, 0.45, 0.42, 0.28],
  ]) {
    const N = 6
    const rim: THREE.Vector3[] = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const rr = r * (0.8 + h1(i * 5.1 + ox * 13) * 0.4)
      rim.push(new THREE.Vector3(ox + Math.cos(a) * rr, 0, oz + Math.sin(a) * rr))
    }
    const apex = new THREE.Vector3(ox, hh, oz)
    for (let i = 0; i < N; i++) {
      mb.tri(apex, rim[i], rim[(i + 1) % N], CH1.scrub.hex, SHADOW_MIX.foliage, 0.96 + h1(i) * 0.08)
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
