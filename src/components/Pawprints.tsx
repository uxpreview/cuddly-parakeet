import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, sampleGround } from '../game/world'

// Placeholder pawprint trail for the grey box. The trail is half the
// wayfinding system: a ring buffer of small flat dark ellipses dropped along
// the dog's travel, only on surfaces the manifest lists (dust, gravel, sand),
// living ~40 seconds and shrinking away over the last 10.

const COUNT = 420
const SPACING = 0.7 // meters of dog travel per print
const LIFE = 40 // seconds
const FADE = 10 // last N seconds shrink to nothing
const OFFSET = 0.1 // alternating lateral offset, perpendicular to heading
const PRINT_COLOR = '#6b675e' // dark neutral grey — never red-hued

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _sc = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

interface TrailState {
  inited: boolean
  clock: number
  last: THREE.Vector3
  haveLast: boolean
  acc: number
  side: number
  next: number
  x: Float32Array
  y: Float32Array
  z: Float32Array
  h: Float32Array
  birth: Float32Array
  active: Uint8Array
}

function setSlot(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, heading: number, f: number) {
  _q.setFromAxisAngle(UP, heading)
  _p.set(x, y, z)
  _sc.set(0.7 * f, 1, f) // ellipse: narrow across, long along travel
  _m.compose(_p, _q, _sc)
  mesh.setMatrixAt(i, _m)
}

export function Pawprints() {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const geom = useMemo(() => {
    const g = new THREE.CircleGeometry(0.09, 12)
    g.rotateX(-Math.PI / 2) // lie flat on the ground
    return g
  }, [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: PRINT_COLOR }), [])

  const st = useRef<TrailState>({
    inited: false,
    clock: 0,
    last: new THREE.Vector3(),
    haveLast: false,
    acc: 0,
    side: 1,
    next: 0,
    x: new Float32Array(COUNT),
    y: new Float32Array(COUNT),
    z: new Float32Array(COUNT),
    h: new Float32Array(COUNT),
    birth: new Float32Array(COUNT).fill(-1e9),
    active: new Uint8Array(COUNT),
  }).current

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || !world.ready || !world.manifest) return
    const dt = Math.min(Math.max(delta, 0), 0.1)
    st.clock += dt
    let dirty = false

    if (!st.inited) {
      st.inited = true
      for (let i = 0; i < COUNT; i++) setSlot(mesh, i, 0, -100, 0, 0, 0.0001)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      dirty = true
    }

    const dog = world.dog
    const surfaces = world.manifest.trail.pawprintSurfaces

    // spawn along the dog's travel
    if (dog.visible) {
      if (!st.haveLast) {
        st.last.copy(dog.pos)
        st.haveLast = true
      }
      const dx = dog.pos.x - st.last.x
      const dz = dog.pos.z - st.last.z
      const d = Math.hypot(dx, dz)
      if (d > 3) {
        // teleport (appear node) — restart the trail, no print smear
        st.last.copy(dog.pos)
        st.acc = 0
      } else if (d > 0) {
        st.acc += d
        st.last.copy(dog.pos)
        while (st.acc >= SPACING) {
          st.acc -= SPACING
          const gs = sampleGround(dog.pos.x, dog.pos.z, dog.pos.y + 0.75)
          if (!gs || !surfaces.includes(gs.surface)) continue // prints only where they'd hold
          st.side = -st.side
          const perpX = Math.cos(dog.heading) * OFFSET * st.side
          const perpZ = -Math.sin(dog.heading) * OFFSET * st.side
          const i = st.next
          st.next = (st.next + 1) % COUNT
          st.x[i] = dog.pos.x + perpX
          st.y[i] = gs.y + 0.02
          st.z[i] = dog.pos.z + perpZ
          st.h[i] = dog.heading
          st.birth[i] = st.clock
          st.active[i] = 1
          setSlot(mesh, i, st.x[i], st.y[i], st.z[i], st.h[i], 1)
          dirty = true
        }
      }
    } else {
      st.haveLast = false
    }

    // age: shrink over the last FADE seconds, then recycle
    for (let i = 0; i < COUNT; i++) {
      if (!st.active[i]) continue
      const age = st.clock - st.birth[i]
      if (age >= LIFE) {
        st.active[i] = 0
        setSlot(mesh, i, st.x[i], -100, st.z[i], 0, 0.0001)
        dirty = true
      } else if (age > LIFE - FADE) {
        const f = (LIFE - age) / FADE
        setSlot(mesh, i, st.x[i], st.y[i], st.z[i], st.h[i], Math.max(f, 0.001))
        dirty = true
      }
    }

    if (dirty) mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geom, mat, COUNT]} frustumCulled={false} />
}
