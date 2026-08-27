// Whistle loop (Gate 1). Two components, both inside the R3F Canvas:
//
//   WhistleSystem — consumes whistle requests, enforces the 3s cooldown,
//     schedules the authored 0.5–1.5s answer delay, and fires the answer from
//     wherever the dog actually is at that moment. Also draws the small "boy"
//     cue: a subtle expanding ground ring at the player, so the press itself
//     reads with sound off.
//
//   WhistleCues — the answer's visual correlate at the dog's location:
//     placeholder "birds startle from where he is" (grey tetrahedra rising
//     over the canyon walls) plus a ground ring for the close-range case.
//
// Gate 1 has no audio. The cues are world events at real positions — never
// UI, never arrows, never persistent markers. The answer gives a direction.
// All colors are neutral greys / soft whites; red belongs to the dog.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { consumeWhistleRequest } from '../game/input'
import { world } from '../game/world'

// ---------------------------------------------------------------------------
// shared helpers

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

interface RingSpec {
  durationMs: number
  r0: number
  r1: number
  maxOpacity: number
}

const BOY_RING: RingSpec = { durationMs: 500, r0: 0.3, r1: 1.2, maxOpacity: 0.5 }
const ANSWER_RING: RingSpec = { durationMs: 800, r0: 0.4, r1: 2.5, maxOpacity: 0.6 }

// Animate one pooled ring mesh. Returns false once the ring has finished.
function animateRing(
  mesh: THREE.Mesh | null,
  mat: THREE.MeshBasicMaterial,
  spec: RingSpec,
  elapsedMs: number,
): boolean {
  if (!mesh) return false
  if (elapsedMs >= spec.durationMs) {
    mesh.visible = false
    return false
  }
  const t = Math.max(elapsedMs, 0) / spec.durationMs
  mesh.visible = true
  mesh.scale.setScalar(spec.r0 + (spec.r1 - spec.r0) * easeOutQuad(t))
  mat.opacity = spec.maxOpacity * (1 - t)
  return true
}

// ---------------------------------------------------------------------------
// WhistleSystem — the loop itself + the boy-side press cue

const BOY_RING_POOL = 2 // cooldown (3s) far exceeds ring life (0.5s); 2 is headroom

interface BoyRingSlot {
  active: boolean
  start: number
}

export function WhistleSystem() {
  const slots = useRef<BoyRingSlot[]>(
    Array.from({ length: BOY_RING_POOL }, () => ({ active: false, start: 0 })),
  )
  const meshes = useRef<(THREE.Mesh | null)[]>([])

  const geometry = useMemo(() => new THREE.RingGeometry(0.78, 1, 40), [])
  const materials = useMemo(
    () =>
      Array.from(
        { length: BOY_RING_POOL },
        () =>
          new THREE.MeshBasicMaterial({
            color: '#dfdcd4',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      for (const m of materials) m.dispose()
    }
  }, [geometry, materials])

  useFrame(() => {
    const now = performance.now()
    const w = world.whistle

    // 1. Requests. Within cooldown they are ignored outright — no queue.
    if (consumeWhistleRequest() && now - w.lastAt >= w.cooldownMs) {
      w.lastAt = now
      // Authored answer delay: half a second to a second and a half.
      w.pendingAnswerAt = now + 500 + Math.random() * 1000
      // Boy cue: subtle ground ring at the player, so the press reads silently.
      const slot = slots.current.find((s) => !s.active) ?? slots.current[0]
      slot.active = true
      slot.start = now
      const mesh = meshes.current[slots.current.indexOf(slot)]
      if (mesh) {
        mesh.position.set(
          world.player.pos.x,
          world.player.pos.y + 0.04,
          world.player.pos.z,
        )
      }
    }

    // 2. The answer fires from wherever the dog actually is right now.
    if (w.pendingAnswerAt !== 0 && now >= w.pendingAnswerAt) {
      w.answerPos.copy(world.dog.pos)
      w.answerSeq++
      w.pendingAnswerAt = 0
      world.dog.bounceSeq++ // the dog system plays his bark-bounce off this
    }

    // 3. Animate the boy rings.
    for (let i = 0; i < slots.current.length; i++) {
      const s = slots.current[i]
      if (!s.active) continue
      if (!animateRing(meshes.current[i], materials[i], BOY_RING, now - s.start)) {
        s.active = false
      }
    }
  })

  return (
    <group>
      {materials.map((mat, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el
          }}
          geometry={geometry}
          material={mat}
          rotation-x={-Math.PI / 2}
          visible={false}
        />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// WhistleCues — the answer cue at the dog's position

const MAX_CUES = 3
const BIRDS_PER_CUE = 6
const BIRD_DURATION_MS = 2200
const BIRD_MAX_DELAY_MS = 180 // small stagger so the flock reads as a startle
const BIRD_SCALE = 0.35

interface BirdParams {
  az: number // outward azimuth, radians
  rise: number // total climb, meters (10–14)
  drift: number // outward drift, meters
  wobAmp: number
  wobFreq: number // wobble cycles over the bird's life
  wobPhase: number
  delayMs: number
  spin: number // tumble rate
}

interface CueSlot {
  active: boolean
  start: number
  birds: BirdParams[]
}

function rollBirds(): BirdParams[] {
  const birds: BirdParams[] = []
  for (let i = 0; i < BIRDS_PER_CUE; i++) {
    // Spread azimuths around the circle with jitter so birds part evenly.
    const az = (i / BIRDS_PER_CUE) * Math.PI * 2 + (Math.random() - 0.5) * 0.9
    birds.push({
      az,
      rise: 10 + Math.random() * 4,
      drift: 1.6 + Math.random() * 1.8,
      wobAmp: 0.25 + Math.random() * 0.35,
      wobFreq: 3 + Math.random() * 3,
      wobPhase: Math.random() * Math.PI * 2,
      delayMs: Math.random() * BIRD_MAX_DELAY_MS,
      spin: (Math.random() - 0.5) * 6,
    })
  }
  return birds
}

export function WhistleCues() {
  const slots = useRef<CueSlot[]>(
    Array.from({ length: MAX_CUES }, () => ({
      active: false,
      start: 0,
      birds: rollBirds(),
    })),
  )
  const groups = useRef<(THREE.Group | null)[]>([])
  const birdMeshes = useRef<(THREE.Mesh | null)[]>([]) // [slot * BIRDS_PER_CUE + i]
  const ringMeshes = useRef<(THREE.Mesh | null)[]>([])
  const lastSeq = useRef(0)

  const birdGeometry = useMemo(() => new THREE.TetrahedronGeometry(1), [])
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.78, 1, 40), [])
  // One bird material and one ring material per slot, so overlapping cues
  // fade independently. Near-white, unlit, unfogged: contrasty against the
  // sky at 80m in a grey world.
  const birdMaterials = useMemo(
    () =>
      Array.from(
        { length: MAX_CUES },
        () =>
          new THREE.MeshBasicMaterial({
            color: '#f4f2ea',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false,
          }),
      ),
    [],
  )
  const ringMaterials = useMemo(
    () =>
      Array.from(
        { length: MAX_CUES },
        () =>
          new THREE.MeshBasicMaterial({
            color: '#e9e6de',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  )

  useEffect(() => {
    return () => {
      birdGeometry.dispose()
      ringGeometry.dispose()
      for (const m of birdMaterials) m.dispose()
      for (const m of ringMaterials) m.dispose()
    }
  }, [birdGeometry, ringGeometry, birdMaterials, ringMaterials])

  useFrame(() => {
    const now = performance.now()

    // Spawn on a new answer. Recycle the oldest slot if all are live so
    // overlapping answers can never crash or leak.
    if (world.whistle.answerSeq !== lastSeq.current) {
      lastSeq.current = world.whistle.answerSeq
      let slot = slots.current.find((s) => !s.active)
      if (!slot) {
        slot = slots.current.reduce((a, b) => (a.start <= b.start ? a : b))
      }
      slot.active = true
      slot.start = now
      slot.birds = rollBirds()
      const group = groups.current[slots.current.indexOf(slot)]
      if (group) group.position.copy(world.whistle.answerPos)
    }

    // Animate live slots.
    const totalMs = BIRD_DURATION_MS + BIRD_MAX_DELAY_MS
    for (let si = 0; si < slots.current.length; si++) {
      const slot = slots.current[si]
      const group = groups.current[si]
      if (!group) continue
      if (!slot.active) {
        group.visible = false
        continue
      }
      const elapsed = now - slot.start
      if (elapsed >= totalMs) {
        slot.active = false
        group.visible = false
        continue
      }
      group.visible = true

      // Close-range correlate: expanding ground ring at the answer position.
      animateRing(ringMeshes.current[si], ringMaterials[si], ANSWER_RING, elapsed)

      // The birds: launch upward, drift outward and apart, wobble, fade.
      const flockT = elapsed / totalMs
      birdMaterials[si].opacity =
        flockT < 0.6 ? 0.95 : 0.95 * (1 - (flockT - 0.6) / 0.4)
      for (let bi = 0; bi < BIRDS_PER_CUE; bi++) {
        const mesh = birdMeshes.current[si * BIRDS_PER_CUE + bi]
        if (!mesh) continue
        const b = slot.birds[bi]
        const u = Math.min(Math.max((elapsed - b.delayMs) / BIRD_DURATION_MS, 0), 1)
        // Fast burst off the ground, still climbing at the end.
        const climb = 1 - Math.pow(1 - u, 1.7)
        const out = b.drift * easeOutQuad(u)
        const wob = b.wobAmp * Math.sin(u * b.wobFreq * Math.PI * 2 + b.wobPhase)
        const cos = Math.cos(b.az)
        const sin = Math.sin(b.az)
        mesh.position.set(
          cos * out - sin * wob, // wobble perpendicular to the outward line
          0.4 + b.rise * climb + wob * 0.3,
          sin * out + cos * wob,
        )
        mesh.rotation.set(u * b.spin + b.wobPhase, b.az, u * b.spin * 0.6)
      }
    }
  })

  return (
    <group>
      {slots.current.map((_, si) => (
        <group
          key={si}
          ref={(el) => {
            groups.current[si] = el
          }}
          visible={false}
        >
          {Array.from({ length: BIRDS_PER_CUE }, (_, bi) => (
            <mesh
              key={bi}
              ref={(el) => {
                birdMeshes.current[si * BIRDS_PER_CUE + bi] = el
              }}
              geometry={birdGeometry}
              material={birdMaterials[si]}
              scale={BIRD_SCALE}
            />
          ))}
          <mesh
            ref={(el) => {
              ringMeshes.current[si] = el
            }}
            geometry={ringGeometry}
            material={ringMaterials[si]}
            rotation-x={-Math.PI / 2}
            position-y={0.05}
          />
        </group>
      ))}
    </group>
  )
}
