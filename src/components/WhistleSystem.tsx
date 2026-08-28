// The whistle loop.
//
//   WhistleSystem — consumes whistle requests, enforces the 3 s cooldown, and
//     schedules the authored 0.5-1.5 s answer delay. The answer fires from
//     wherever the dog actually is at that moment.
//
//   WhistleCues — the answer's visual correlate AT HIS LOCATION: birds lifting
//     and scattering, and a puff of dust off the ground where he barked.
//
// game-design.md: "Every answer has a visual correlate at his location, because
// the game must be fully playable with sound off... The answer gives a
// direction, never a marker." Both halves of that are load-bearing here. The
// cues are world events at real positions — they are not drawn on top of the
// world, they do not persist, and they do not point.
//
// What this replaces: six grey tetrahedra and two expanding ground rings. The
// tetrahedra were a Gate 1 placeholder for birds and read as debris; the ring
// under the BOY was the press cue, which is a marker on the player drawn in
// screen grammar. The press reads on the boy now — he stops, tips his head back
// and puts a hand to his mouth — which is what a boy whistling looks like.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { consumeWhistleRequest } from '../game/input'
import { world } from '../game/world'
import { now, rand } from '../game/clock'
import { CH1 } from '../art/palette'

export function WhistleSystem() {
  useFrame(() => {
    const t = now()
    const w = world.whistle

    // 1. Requests. Within cooldown they are ignored outright — no queue.
    if (consumeWhistleRequest() && t - w.lastAt >= w.cooldownMs) {
      w.lastAt = t
      // Authored answer delay: half a second to a second and a half.
      w.pendingAnswerAt = t + 500 + rand() * 1000
      w.pressSeq++ // the boy plays the gesture off this
    }

    // 2. The answer fires from wherever the dog actually is right now.
    if (w.pendingAnswerAt !== 0 && t >= w.pendingAnswerAt) {
      w.answerPos.copy(world.dog.pos)
      w.answerSeq++
      w.pendingAnswerAt = 0
      world.dog.bounceSeq++ // the dog system plays his bark-bounce off this
    }
  })
  return null
}

// ---------------------------------------------------------------------------
// WhistleCues — birds and dust, at the dog's position

const MAX_CUES = 3
const BIRDS_PER_CUE = 7
const CUE_MS = 2600
const PUFFS_PER_CUE = 4

/**
 * One bird: a shallow V of two triangles, seen as a silhouette. Nothing else is
 * needed — at the distances the answer arrives from, a bird is two strokes and
 * a flap, and anything more is invisible. The V is built about the origin so a
 * wingbeat is one rotation per side.
 */
function birdGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const S = 0.42 // wing half-span, metres
  const C = 0.1 // body half-length
  // left wing, right wing, and a body sliver between them
  const v = [
    0, 0, C, -S, 0.12 * S, -0.35 * C, -0.42 * S, 0, 0.55 * C,
    0, 0, C, 0.42 * S, 0, 0.55 * C, S, 0.12 * S, -0.35 * C,
    0, 0, C, -0.42 * S, 0, 0.55 * C, 0.42 * S, 0, 0.55 * C,
  ]
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

interface Bird {
  az: number
  rise: number
  drift: number
  flap: number
  phase: number
  delay: number
  bank: number
}

interface Puff {
  az: number
  reach: number
  rise: number
  delay: number
  size: number
}

interface CueSlot {
  active: boolean
  start: number
  birds: Bird[]
  puffs: Puff[]
}

function rollCue(): { birds: Bird[]; puffs: Puff[] } {
  const birds: Bird[] = []
  for (let i = 0; i < BIRDS_PER_CUE; i++) {
    // They part unevenly. A flock leaving evenly spaced is a firework.
    const az = (i / BIRDS_PER_CUE) * Math.PI * 2 + (rand() - 0.5) * 1.5
    birds.push({
      az,
      rise: 7 + rand() * 7,
      drift: 5 + rand() * 7,
      flap: 7 + rand() * 5,
      phase: rand() * Math.PI * 2,
      delay: rand() * 0.22,
      bank: (rand() - 0.5) * 0.9,
    })
  }
  const puffs: Puff[] = []
  for (let i = 0; i < PUFFS_PER_CUE; i++) {
    puffs.push({
      az: rand() * Math.PI * 2,
      reach: 0.3 + rand() * 0.9,
      rise: 0.35 + rand() * 0.5,
      delay: rand() * 0.12,
      size: 0.5 + rand() * 0.5,
    })
  }
  return { birds, puffs }
}

export function WhistleCues() {
  const slots = useRef<CueSlot[]>(
    Array.from({ length: MAX_CUES }, () => ({ active: false, start: 0, ...rollCue() })),
  )
  const groups = useRef<(THREE.Group | null)[]>([])
  const birdMeshes = useRef<(THREE.Mesh | null)[]>([])
  const puffMeshes = useRef<(THREE.Mesh | null)[]>([])
  const lastSeq = useRef(0)

  const geo = useMemo(() => {
    const puff = new THREE.PlaneGeometry(1, 1)
    puff.rotateX(-Math.PI / 2)
    return { bird: birdGeometry(), puff }
  }, [])

  // Birds read as a DARK silhouette against a pale sky, which is the only thing
  // that survives at eighty metres. Pine is a documented hex and no new colour
  // enters the chapter for this. The dust is the path value it is lifted from.
  const mats = useMemo(
    () => ({
      bird: Array.from(
        { length: MAX_CUES },
        () =>
          new THREE.MeshBasicMaterial({
            color: CH1.pine.hex,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
          }),
      ),
      puff: Array.from(
        { length: MAX_CUES },
        () =>
          new THREE.MeshBasicMaterial({
            color: CH1.path.hex,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
      ),
    }),
    [],
  )

  useEffect(() => {
    return () => {
      geo.bird.dispose()
      geo.puff.dispose()
      for (const m of [...mats.bird, ...mats.puff]) m.dispose()
    }
  }, [geo, mats])

  useFrame(() => {
    const t = now()

    // Spawn on a new answer. Recycle the oldest slot if all are live so
    // overlapping answers can never crash or leak.
    if (world.whistle.answerSeq !== lastSeq.current) {
      lastSeq.current = world.whistle.answerSeq
      let slot = slots.current.find((s) => !s.active)
      if (!slot) slot = slots.current.reduce((a, b) => (a.start <= b.start ? a : b))
      slot.active = true
      slot.start = t
      const rolled = rollCue()
      slot.birds = rolled.birds
      slot.puffs = rolled.puffs
      const group = groups.current[slots.current.indexOf(slot)]
      if (group) group.position.copy(world.whistle.answerPos)
    }

    for (let si = 0; si < slots.current.length; si++) {
      const slot = slots.current[si]
      const group = groups.current[si]
      if (!group) continue
      if (!slot.active) {
        group.visible = false
        continue
      }
      const e = (t - slot.start) / CUE_MS
      if (e >= 1) {
        slot.active = false
        group.visible = false
        continue
      }
      group.visible = true
      mats.bird[si].opacity = e < 0.62 ? 0.95 : 0.95 * (1 - (e - 0.62) / 0.38)
      mats.puff[si].opacity = 0.5 * Math.max(0, 1 - e / 0.55)

      for (let bi = 0; bi < BIRDS_PER_CUE; bi++) {
        const mesh = birdMeshes.current[si * BIRDS_PER_CUE + bi]
        if (!mesh) continue
        const b = slot.birds[bi]
        const u = THREE.MathUtils.clamp((e - b.delay) / (1 - b.delay), 0, 1)
        // hard off the ground, still climbing at the end
        const climb = 1 - Math.pow(1 - u, 1.8)
        const out = b.drift * (1 - Math.pow(1 - u, 2))
        mesh.position.set(
          Math.cos(b.az) * out,
          0.7 + b.rise * climb,
          Math.sin(b.az) * out,
        )
        // The wingbeat is the whole read at distance: a shape that translates
        // without flapping is a thrown stone.
        const beat = Math.sin(u * b.flap * Math.PI * 2 + b.phase)
        mesh.rotation.set(beat * 0.55, -b.az + Math.PI / 2, b.bank * (1 - u))
        mesh.scale.setScalar(u > 0 ? 1 : 0.001)
      }
      for (let pi = 0; pi < PUFFS_PER_CUE; pi++) {
        const mesh = puffMeshes.current[si * PUFFS_PER_CUE + pi]
        if (!mesh) continue
        const p = slot.puffs[pi]
        const u = THREE.MathUtils.clamp((e - p.delay) / 0.55, 0, 1)
        const s = p.size * (0.35 + u * 1.5)
        mesh.position.set(Math.cos(p.az) * p.reach * u, 0.05 + p.rise * u, Math.sin(p.az) * p.reach * u)
        mesh.scale.set(s, 1, s)
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
              key={'b' + bi}
              ref={(el) => {
                birdMeshes.current[si * BIRDS_PER_CUE + bi] = el
              }}
              geometry={geo.bird}
              material={mats.bird[si]}
            />
          ))}
          {Array.from({ length: PUFFS_PER_CUE }, (_, pi) => (
            <mesh
              key={'p' + pi}
              ref={(el) => {
                puffMeshes.current[si * PUFFS_PER_CUE + pi] = el
              }}
              geometry={geo.puff}
              material={mats.puff[si]}
            />
          ))}
        </group>
      ))}
    </group>
  )
}
