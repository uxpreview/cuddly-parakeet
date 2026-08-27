import * as THREE from 'three'
import type { DogNode, PathFile, Vec3 } from './types'

// The dog's route flattened to one arc-length-parameterized polyline, with the
// s-range each manifest node occupies. Player progress along this line drives
// the dog's lead-distance discipline; the projection is windowed and (mostly)
// monotonic so switchback legs that pass near each other in space cannot yank
// progress across laps.

export interface ResolvedNode {
  node: DogNode
  s0: number
  s1: number
  points: THREE.Vector3[] // 1 point for stationary nodes, polyline for moving ones
}

export class Route {
  points: THREE.Vector3[] = []
  cum: number[] = []
  nodes: ResolvedNode[] = []
  total = 0

  constructor(dogRoute: DogNode[], paths: Map<string, PathFile>) {
    const pushPoint = (p: Vec3) => {
      const v = new THREE.Vector3(p[0], p[1], p[2])
      if (this.points.length === 0) {
        this.points.push(v)
        this.cum.push(0)
        return
      }
      const prev = this.points[this.points.length - 1]
      const d = prev.distanceTo(v)
      if (d < 1e-4) return
      this.points.push(v)
      this.cum.push(this.cum[this.cum.length - 1] + d)
    }

    for (const node of dogRoute) {
      const s0 = this.cum.length ? this.cum[this.cum.length - 1] : 0
      const nodePts: THREE.Vector3[] = []
      const addPts = (pts: Vec3[]) => {
        for (const p of pts) {
          pushPoint(p)
          nodePts.push(new THREE.Vector3(p[0], p[1], p[2]))
        }
      }
      if (node.type === 'trot') {
        const pf = paths.get(node.path)
        if (!pf) throw new Error('missing path file: ' + node.path)
        addPts(pf.points)
      } else if (node.type === 'near-miss') {
        pushPoint(node.at)
        nodePts.push(new THREE.Vector3(...node.at))
        const pf = paths.get(node.escape)
        if (!pf) throw new Error('missing escape path: ' + node.escape)
        addPts(pf.points)
      } else {
        pushPoint(node.at)
        nodePts.push(new THREE.Vector3(...node.at))
      }
      const s1 = this.cum[this.cum.length - 1]
      this.nodes.push({ node, s0, s1, points: nodePts })
    }
    this.total = this.cum[this.cum.length - 1] ?? 0
  }

  pointAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    const cum = this.cum
    const pts = this.points
    if (s <= 0) return out.copy(pts[0])
    if (s >= this.total) return out.copy(pts[pts.length - 1])
    // binary search for segment
    let lo = 0
    let hi = cum.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] <= s) lo = mid
      else hi = mid
    }
    const t = (s - cum[lo]) / (cum[hi] - cum[lo])
    return out.copy(pts[lo]).lerp(pts[hi], t)
  }

  directionAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    this.pointAt(Math.max(0, s - 0.5), a)
    this.pointAt(Math.min(this.total, s + 0.5), b)
    out.subVectors(b, a)
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0)
    return out.normalize()
  }

  // Nearest s to `pos` within [sMin, sMax], brute force over segments in range.
  project(pos: THREE.Vector3, sMin: number, sMax: number): number {
    const cum = this.cum
    const pts = this.points
    let bestS = Math.max(0, Math.min(sMin, this.total))
    let bestD = Infinity
    const seg = new THREE.Vector3()
    const toP = new THREE.Vector3()
    const closest = new THREE.Vector3()
    for (let i = 0; i < pts.length - 1; i++) {
      if (cum[i + 1] < sMin || cum[i] > sMax) continue
      seg.subVectors(pts[i + 1], pts[i])
      toP.subVectors(pos, pts[i])
      const len2 = seg.lengthSq()
      const t = len2 > 0 ? THREE.MathUtils.clamp(toP.dot(seg) / len2, 0, 1) : 0
      closest.copy(pts[i]).addScaledVector(seg, t)
      const d = closest.distanceToSquared(pos)
      if (d < bestD) {
        bestD = d
        bestS = cum[i] + Math.sqrt(len2) * t
      }
    }
    return bestS
  }
}

export class ProgressTracker {
  s = 0
  constructor(private route: Route) {}

  update(pos: THREE.Vector3): number {
    // search a forward-biased window; allow slight regression for backtracking
    const next = this.route.project(pos, this.s - 8, this.s + 14)
    if (next > this.s || next < this.s - 6) this.s = Math.max(next, this.s - 6)
    else this.s = next
    return this.s
  }
}
