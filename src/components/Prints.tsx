import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from '../game/world'
import { drainPrints, type PrintSpawn } from '../game/trail'
import { boyPrintTexture, dogPrintTexture, printMaterial } from '../art/decals'

// The trail, which is half the wayfinding system: there is no compass, no
// waypoint and no objective text to fall back on.
//
// Two things changed at Gate 3. The art is D18's — the hand-drawn alpha decals
// the art bible already stamps — instead of the Gate 1 grey ellipse. And a
// print is no longer sampled off the dog's position every so many metres: it is
// spawned by a FOOTFALL, at the foot's own world position, facing the way that
// foot was pointing. A print can therefore only exist where a foot went down,
// which is what "footprints land in step and alternate correctly, pawprints
// match his gait" actually asks for.
//
// Lifetimes are game-design.md's, which owns them per D6: the dog's hold about
// forty seconds, twice the boy's, and both fade by losing strength and
// shrinking rather than by turning grey (D18).

const LIFE = { dog: 40, boy: 20 }
const FADE = { dog: 10, boy: 6 } // last N seconds shrink away
// A trotting dog puts down four feet a cycle at roughly 0.95 m a cycle, so
// forty seconds at 2.6 m/s is a little over four hundred prints. Sized from
// that rather than from a guess, with headroom for the ford's slow crossing.
const COUNT = { dog: 560, boy: 220 }

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

interface Bank {
  mesh: THREE.InstancedMesh
  x: Float32Array
  y: Float32Array
  z: Float32Array
  h: Float32Array
  birth: Float32Array
  next: number
}

function makeBank(kind: 'dog' | 'boy'): Bank {
  // Sizes are D18's, which are deliberately larger than the anatomy wants:
  // beyond about three metres a smaller print is averaged away by the sampler
  // entirely, and the trail simply stops existing.
  const size = kind === 'dog' ? 0.2 : 0.235
  const geom = new THREE.PlaneGeometry(size * (kind === 'dog' ? 0.95 : 0.66), size)
  geom.rotateX(-Math.PI / 2)
  const mat = printMaterial(
    kind,
    kind === 'dog' ? dogPrintTexture() : boyPrintTexture(),
  )
  const n = COUNT[kind]
  const mesh = new THREE.InstancedMesh(geom, mat, n)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return {
    mesh,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    h: new Float32Array(n),
    birth: new Float32Array(n).fill(-1e9),
    next: 0,
  }
}

const APART2 = 0.15 * 0.15
function overlaps(b: Bank, x: number, z: number, t: number, life: number): boolean {
  for (let i = 0; i < b.birth.length; i++) {
    if (t - b.birth[i] > life) continue
    const dx = b.x[i] - x
    const dz = b.z[i] - z
    if (dx * dx + dz * dz < APART2) return true
  }
  return false
}

function setSlot(b: Bank, i: number, scale: number) {
  _q.setFromAxisAngle(UP, b.h[i])
  _p.set(b.x[i], b.y[i], b.z[i])
  _s.set(scale, 1, scale)
  _m.compose(_p, _q, _s)
  b.mesh.setMatrixAt(i, _m)
}

export function Prints() {
  const banks = useMemo(() => ({ dog: makeBank('dog'), boy: makeBank('boy') }), [])
  const clock = useRef(0)
  const spawns = useRef<PrintSpawn[]>([]).current

  useEffect(() => {
    for (const b of Object.values(banks)) {
      for (let i = 0; i < b.birth.length; i++) {
        b.y[i] = -1000
        setSlot(b, i, 0.0001)
      }
      b.mesh.instanceMatrix.needsUpdate = true
    }
    return () => {
      for (const b of Object.values(banks)) {
        b.mesh.geometry.dispose()
        ;(b.mesh.material as THREE.Material).dispose()
      }
    }
  }, [banks])

  useFrame((_, delta) => {
    if (!world.ready || !world.manifest) return
    clock.current += Math.min(Math.max(delta, 0), 0.1)
    const t = clock.current
    const dirty = { dog: false, boy: false }

    spawns.length = 0
    drainPrints(spawns)
    const surfaces = world.manifest.trail.pawprintSurfaces
    for (const p of spawns) {
      // Prints only where they would hold: dust, gravel and sand. Town stone
      // takes none, which is why chapter 2 shifts to the other signals.
      const gs = world.blocks?.sampleGround(p.x, p.z, p.y + 0.75)
      if (!gs || !surfaces.includes(gs.surface)) continue
      const b = banks[p.kind]
      // Never darker than one print. The decals multiply, so two on the same
      // spot are twice as dark and a dozen are a hole in the ground -- which is
      // what a dog turning about at heel for half a minute was drawing. A
      // print that lands on a live print is simply not laid.
      if (overlaps(b, p.x, p.z, t, LIFE[p.kind])) continue
      const i = b.next
      b.next = (b.next + 1) % b.birth.length
      b.x[i] = p.x
      b.y[i] = p.y + (p.kind === 'dog' ? 0.012 : 0.01)
      b.z[i] = p.z
      b.h[i] = p.heading
      b.birth[i] = t
      setSlot(b, i, 1)
      dirty[p.kind] = true
    }

    for (const kind of ['dog', 'boy'] as const) {
      const b = banks[kind]
      for (let i = 0; i < b.birth.length; i++) {
        const age = t - b.birth[i]
        if (age < LIFE[kind] - FADE[kind] || age > LIFE[kind] + 1) continue
        const f = Math.max(0.0001, (LIFE[kind] - age) / FADE[kind])
        setSlot(b, i, Math.min(1, f))
        dirty[kind] = true
      }
      if (dirty[kind]) b.mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <primitive object={banks.dog.mesh} />
      <primitive object={banks.boy.mesh} />
    </>
  )
}
