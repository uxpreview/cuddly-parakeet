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
import { recFrame } from '../game/record'
import { BOY, CH1 } from '../art/palette'

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
/** Wingtip to wingtip, metres. See birdGeometry(): S is the half-span. */
const BIRD_SPAN = 0.84
/**
 * And never narrower than this on screen. Same argument as the collar's floor
 * (D21) and the same failure without it: the answer arrives from wherever the
 * dog is, which in this chapter is fifteen to thirty metres up the canyon, and
 * at thirty metres a real bird is four pixels. Four pixels of anything is dirt
 * on the lens. Up close the factor is exactly 1.
 */
const BIRD_MIN_PX = 16

const _wp = new THREE.Vector3()

// Dust is soft or it is a tile.
//
// The puff was a PlaneGeometry with a flat MeshBasicMaterial on it, which draws
// a hard-edged square lying on the ground -- at the size dust has to be to
// register at all, an obvious grey slab under the dog. A radial falloff is the
// whole difference between a cloud and a decal.
const PUFF_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const PUFF_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  // soft all the way in: dust has no core
  float a = (1.0 - smoothstep(0.0, 1.0, r)) * uOpacity;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`

/**
 * One bird: a shallow V of two triangles, seen as a silhouette. Nothing else is
 * needed — at the distances the answer arrives from, a bird is two strokes and
 * a flap, and anything more is invisible. The V is built about the origin so a
 * wingbeat is one rotation per side.
 */
function birdGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const S = 0.42 // wing half-span, metres
  const C = 0.2 // body half-length
  const T = 0.42 // chord kept at the wing TIP, as a fraction of the root's
  // Span is not the same thing as INK.
  //
  // The first shape was a V of near-zero-chord slivers: measured, it drew at 40
  // pixels of span and about two pixels of mark, which at a glance is dirt on
  // the lens rather than a bird. It also tapered to a point, so the outer third
  // of every wing was a sub-pixel wedge that antialiased away entirely.
  //
  // So each wing is a quad -- root chord, tip chord, both real -- and the body
  // between them is a solid sliver. Same silhouette, an order of magnitude more
  // of it. At the 16 px floor below, the wing chord lands around 3 px.
  const wing = (side: number) => {
    const x0 = 0.34 * S * side
    const x1 = S * side
    // root and tip, each with a leading and trailing edge
    const rl = [x0, 0, C]
    const rt = [x0, 0, -0.55 * C]
    const tl = [x1, 0.12 * S, C * T]
    const tt = [x1, 0.12 * S, -0.55 * C * T]
    return side > 0
      ? [...rl, ...tl, ...tt, ...rl, ...tt, ...rt]
      : [...rl, ...tt, ...tl, ...rl, ...rt, ...tt]
  }
  const body = [
    -0.34 * S, 0, C, 0.34 * S, 0, C, 0.34 * S, 0, -0.55 * C,
    -0.34 * S, 0, C, 0.34 * S, 0, -0.55 * C, -0.34 * S, 0, -0.55 * C,
  ]
  const v = [...body, ...wing(-1), ...wing(1)]
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
      // They have to clear the treeline into open sky, or a dark bird is fired
      // at a dark canopy and the whole cue is spent against the one background
      // that hides it. From the following camera the pines top out around ten
      // metres above the canyon floor.
      rise: 11 + rand() * 8,
      // Not so far that they stop saying WHERE. The answer gives a direction,
      // so a bird that has drifted twelve metres off him is pointing at nothing.
      drift: 3 + rand() * 5,
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
      // Bigger and thrown wider than the first pass. A puff the size of the
      // dog's own foot, in the value of the ground it came off, was invisible
      // twice over -- and it is the half of the correlate that says WHERE, at
      // his feet, rather than only that something happened.
      reach: 0.5 + rand() * 1.3,
      rise: 0.45 + rand() * 0.7,
      delay: rand() * 0.12,
      size: 1.0 + rand() * 0.9,
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

  // Birds read as a DARK silhouette, which is the only thing that survives at
  // eighty metres. No new colour enters the chapter for this: both hexes below
  // are already documented in the palette.
  //
  // They were CH1.pine, and the dust was CH1.path. Both were invisible, and
  // measurably so. The birds are fired from the dog's position on the canyon
  // floor, which from the following camera is in front of a full pine treeline
  // of the identical hex: across the answer the frame's pine-hex pixel count
  // went from 88 at rest to 135 at peak -- seven birds, six pixels each, drawn
  // in the colour of what is behind them. The dust was the path value lifted
  // off the path, semi-transparent, same hue and same value: it could not be
  // seen and never could have been.
  //
  // A silhouette is a value contrast or it is nothing. Boy-hair brown sits 40 L
  // below pine and 90 below the sky, and limestone shadow is the darkest thing
  // the ground palette owns.
  const mats = useMemo(
    () => ({
      bird: Array.from(
        { length: MAX_CUES },
        () =>
          new THREE.MeshBasicMaterial({
            color: BOY.hair.hex,
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
          new THREE.ShaderMaterial({
            vertexShader: PUFF_VERT,
            fragmentShader: PUFF_FRAG,
            uniforms: {
              uColor: { value: new THREE.Color(CH1.limestoneShadow.hex) },
              uOpacity: { value: 0 },
            },
            transparent: true,
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

  useFrame((state) => {
    const t = now()
    let liveBirds = 0
    let livePuffs = 0
    let maxPx = 0
    let maxOp = 0

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
      mats.puff[si].uniforms.uOpacity.value = 0.62 * Math.max(0, 1 - e / 0.55)

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
        // (the floor below rescales this when the bird is far)
        if (u > 0) {
          liveBirds++
          maxOp = Math.max(maxOp, mats.bird[si].opacity)
          mesh.getWorldPosition(_wp)
          const d = _wp.distanceTo(state.camera.position)
          const cam = state.camera as THREE.PerspectiveCamera
          const perPx =
            (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(state.size.height, 1)
          const px = BIRD_SPAN / Math.max(d, 0.01) / perPx
          // The screen-size floor, applied about the bird's own centre so a
          // near bird is untouched and a far one stays a bird rather than
          // becoming a speck.
          const k = px < BIRD_MIN_PX ? BIRD_MIN_PX / Math.max(px, 0.01) : 1
          mesh.scale.setScalar(k)
          if (px * k > maxPx) maxPx = px * k
        }
      }
      for (let pi = 0; pi < PUFFS_PER_CUE; pi++) {
        const mesh = puffMeshes.current[si * PUFFS_PER_CUE + pi]
        if (!mesh) continue
        const p = slot.puffs[pi]
        const u = THREE.MathUtils.clamp((e - p.delay) / 0.55, 0, 1)
        const s = p.size * (0.35 + u * 1.5)
        mesh.position.set(Math.cos(p.az) * p.reach * u, 0.05 + p.rise * u, Math.sin(p.az) * p.reach * u)
        mesh.scale.set(s, 1, s)
        if (u > 0 && mats.puff[si].uniforms.uOpacity.value > 0.01) livePuffs++
      }
    }

    recFrame.cue = {
      birds: liveBirds,
      puffs: livePuffs,
      maxPx: Math.round(maxPx * 10) / 10,
      opacity: Math.round(maxOp * 100) / 100,
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
