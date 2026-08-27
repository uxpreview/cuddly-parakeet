import * as THREE from 'three'
import type { GreyboxBlock, GreyboxTerrain, Surface } from './types'

// Analytic collision against the grey-box block list. Rendering merges blocks
// into a handful of meshes; collision never touches triangles — it queries
// block tops through a 2D spatial hash, which keeps the per-frame cost flat.

export interface GroundSample {
  y: number
  surface: Surface
  walkable: boolean
}

interface IndexedBlock {
  b: GreyboxBlock
  cos: number
  sin: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  top: number
  bottom: number
}

const CELL = 8

export class BlockIndex {
  private grid = new Map<string, IndexedBlock[]>()

  constructor(blocks: GreyboxBlock[]) {
    for (const b of blocks) {
      const rot = b.rotY ?? 0
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      const hx = b.size[0] / 2
      const hz = b.size[2] / 2
      // world AABB of the rotated footprint
      const ex = Math.abs(cos) * hx + Math.abs(sin) * hz
      const ez = Math.abs(sin) * hx + Math.abs(cos) * hz
      const ib: IndexedBlock = {
        b,
        cos,
        sin,
        minX: b.at[0] - ex,
        maxX: b.at[0] + ex,
        minZ: b.at[2] - ez,
        maxZ: b.at[2] + ez,
        top: b.at[1] + b.size[1] / 2,
        bottom: b.at[1] - b.size[1] / 2,
      }
      const cx0 = Math.floor(ib.minX / CELL)
      const cx1 = Math.floor(ib.maxX / CELL)
      const cz0 = Math.floor(ib.minZ / CELL)
      const cz1 = Math.floor(ib.maxZ / CELL)
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = cx + ',' + cz
          let list = this.grid.get(key)
          if (!list) {
            list = []
            this.grid.set(key, list)
          }
          list.push(ib)
        }
      }
    }
  }

  private cell(x: number, z: number): IndexedBlock[] | undefined {
    return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL))
  }

  private footprintContains(ib: IndexedBlock, x: number, z: number): boolean {
    if (x < ib.minX || x > ib.maxX || z < ib.minZ || z > ib.maxZ) return false
    const dx = x - ib.b.at[0]
    const dz = z - ib.b.at[2]
    // rotate into block-local space (inverse of rotY about +Y)
    const lx = dx * ib.cos - dz * ib.sin
    const lz = dx * ib.sin + dz * ib.cos
    return Math.abs(lx) <= ib.b.size[0] / 2 && Math.abs(lz) <= ib.b.size[2] / 2
  }

  // Highest block top at (x,z) that is at or below fromY. This is the ground
  // the player/dog would stand on if they were at height fromY.
  sampleGround(x: number, z: number, fromY: number): GroundSample | null {
    const list = this.cell(x, z)
    if (!list) return null
    let best: IndexedBlock | null = null
    for (const ib of list) {
      if (ib.top > fromY) continue
      if (best && ib.top <= best.top) continue
      if (this.footprintContains(ib, x, z)) best = ib
    }
    if (!best) return null
    return { y: best.top, surface: best.b.surface, walkable: best.b.walkable }
  }

  pointInSolid(x: number, y: number, z: number): boolean {
    const list = this.cell(x, z)
    if (!list) return false
    for (const ib of list) {
      if (y > ib.top || y < ib.bottom) continue
      if (this.footprintContains(ib, x, z)) return true
    }
    return false
  }
}

// Grey-box tones per surface. Untextured, near-greyscale; readability only.
const SURFACE_COLOR: Record<Surface, string> = {
  dust: '#b9b4a8',
  gravel: '#a8a49a',
  sand: '#c4bfae',
  stone: '#9a978f',
  wood: '#8d8478',
  rock: '#7e7d78',
  water: '#5c6a70',
}

export function buildTerrainMeshes(terrain: GreyboxTerrain): THREE.Group {
  const group = new THREE.Group()
  const bySurface = new Map<string, { geoms: THREE.BufferGeometry[]; color: string }>()

  const add = (b: GreyboxBlock) => {
    const geom = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2])
    const m = new THREE.Matrix4()
    if (b.rotY) m.makeRotationY(b.rotY)
    m.setPosition(b.at[0], b.at[1], b.at[2])
    geom.applyMatrix4(m)
    const tone = b.tone ?? 1
    const key = b.surface + '|' + tone
    let bucket = bySurface.get(key)
    if (!bucket) {
      const base = new THREE.Color(SURFACE_COLOR[b.surface])
      base.multiplyScalar(tone)
      bucket = { geoms: [], color: '#' + base.getHexString() }
      bySurface.set(key, bucket)
    }
    bucket.geoms.push(geom)
  }

  for (const b of terrain.blocks) add(b)
  for (const b of terrain.decor) add(b)

  for (const bucket of bySurface.values()) {
    const merged = mergeGeometries(bucket.geoms)
    const mat = new THREE.MeshLambertMaterial({ color: bucket.color })
    const mesh = new THREE.Mesh(merged, mat)
    group.add(mesh)
  }
  return group
}

// Minimal non-indexed merge; avoids pulling in the examples/ utils module.
function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertCount = 0
  const nonIndexed = geoms.map((g) => g.toNonIndexed())
  for (const g of nonIndexed) vertCount += g.attributes.position.count
  const pos = new Float32Array(vertCount * 3)
  const norm = new Float32Array(vertCount * 3)
  let offset = 0
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array as Float32Array, offset * 3)
    norm.set(g.attributes.normal.array as Float32Array, offset * 3)
    offset += g.attributes.position.count
    g.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3))
  return merged
}
