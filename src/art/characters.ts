import * as THREE from 'three'
import { BOY, DOG, CH1, SHADOW_MIX } from './palette'
import { makeRamp } from './RampMaterial'
import { mergePainted, paint, place } from './geom'

// The two characters, built to the forms art-direction.md specifies and shaded
// by the same ramp as the world, so they belong to the chapter's light rather
// than sitting on top of it.
//
// Silhouette first. The boy is legible as a boy and the dog as a dog from
// outline alone: the boy is three heads tall with a head you could not mistake
// for anything else, and the dog is compact with pointed ears and a raised tail.
//
// The collar is built as its own mesh with its own material, named for its
// asset id, because that is what lets the red audit whitelist exactly one
// material in the whole game and fail everything else.

export interface BoyPose {
  /** Radians. Positive swings the limb forward (+Z is the facing direction). */
  legL: number
  legR: number
  armL: number
  armR: number
  /** Head yaw and pitch, radians. */
  headY: number
  headP: number
  lean: number
}

export const BOY_WALK: BoyPose = {
  legL: 0.52,
  legR: -0.44,
  armL: -0.3,
  armR: 0.26,
  headY: 0.16,
  headP: -0.05,
  lean: 0.07,
}

export interface DogPose {
  legFL: number
  legFR: number
  legBL: number
  legBR: number
  /** Head yaw/pitch. A look-back is a big yaw with the body barely turned. */
  headY: number
  headP: number
  /** Tail lift and sweep. */
  tailUp: number
  tailY: number
  bodyY: number
}

/** The look-back: he has stopped, and he is checking that the boy is following. */
export const DOG_LOOK_BACK: DogPose = {
  legFL: 0.1,
  legFR: -0.06,
  legBL: -0.04,
  legBR: 0.08,
  headY: 2.05,
  headP: -0.06,
  tailUp: 0.95,
  tailY: 0.28,
  bodyY: 0.16,
}

// --- primitives -----------------------------------------------------------
// Low segment counts on purpose: flat shading turns a 10x7 sphere into a
// faceted rounded form, which is the house style. Nothing here is smooth.

const sphere = (r: number, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h)
const capsule = (r: number, len: number, cap = 3, seg = 8) =>
  new THREE.CapsuleGeometry(r, len, cap, seg)
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
const cone = (r: number, h: number, seg = 5) => new THREE.ConeGeometry(r, h, seg)

// --- the boy ---------------------------------------------------------------
// Roughly 1.15 m, three heads tall, big head, sturdy legs, rounded everything.
// Faceless but for the eyes: art-direction.md leaves the face [OPEN] and
// recommends eyes only, no mouth. That recommendation is what is built here,
// and it stays Ryan's to overrule.

export function buildBoy(pose: BoyPose = BOY_WALK, occlusion = 0): THREE.Group {
  const parts: THREE.BufferGeometry[] = []
  const skin = BOY.skin.hex
  const S = SHADOW_MIX.character

  // legs: rounded and sturdy, pivoting at the hip, with the shorts wrapping the
  // top of each one so the leg is never a separate stick beside the body
  for (const [side, ang] of [
    [1, pose.legL],
    [-1, pose.legR],
  ] as const) {
    const leg = capsule(0.058, 0.2, 3, 7)
    place(leg, [0, -0.16, 0])
    place(leg, [0, 0, 0], [ang, 0, 0])
    place(leg, [0.072 * side, 0.4, 0])
    parts.push(paint(leg, skin, S))

    // Long enough to clear the shirt hem. The earth value is the only warm
    // note balancing the cool shirt, and if the shirt covers it the boy reads
    // as a child in a nightgown from the one angle the game shows him from.
    const sh = capsule(0.081, 0.14, 3, 9)
    place(sh, [0, -0.09, 0])
    place(sh, [0, 0, 0], [ang * 0.55, 0, 0])
    place(sh, [0.072 * side, 0.45, 0])
    parts.push(paint(sh, BOY.shorts.hex, S))

    const shoe = place(box(0.105, 0.07, 0.185), [0, -0.295, 0.028])
    place(shoe, [0, 0, 0], [ang, 0, 0])
    place(shoe, [0.072 * side, 0.4, 0])
    parts.push(paint(shoe, BOY.shoes.hex, S))
  }
  // hips: one mass bridging the two legs, so the boy has a body and not a pair
  // of trousers hanging off a barrel
  const hips = capsule(0.092, 0.09, 3, 9)
  hips.rotateZ(Math.PI / 2)
  parts.push(paint(place(hips, [0, 0.475, 0], [pose.lean * 0.5, 0, 0]), BOY.shorts.hex, S))

  // torso: a soft barrel, leaning very slightly into the walk. Short, so the
  // shirt hem sits above the shorts and the two-value split is visible.
  const torso = capsule(0.132, 0.15, 3, 9)
  parts.push(paint(place(torso, [0, 0.635, 0], [pose.lean, 0, 0]), BOY.shirt.hex, S))

  // arms. The shoulder is a ball inside the torso's silhouette and the arm
  // hangs off it: an arm pivoting at the surface of a capsule reads as a
  // detached box floating beside the body, which is exactly what it is.
  for (const [side, ang] of [
    [1, pose.armL],
    [-1, pose.armR],
  ] as const) {
    const shoulder = sphere(0.064, 8, 6)
    parts.push(paint(place(shoulder, [0.114 * side, 0.735, 0]), BOY.shirt.hex, S))

    const arm = capsule(0.041, 0.17, 3, 7)
    place(arm, [0, -0.115, 0])
    place(arm, [0, 0, 0], [ang, 0, 0])
    place(arm, [0.13 * side, 0.735, 0])
    parts.push(paint(arm, skin, S))

    // short sleeve, overlapping both the shoulder and the arm
    const sl = capsule(0.052, 0.05, 3, 8)
    place(sl, [0, -0.045, 0])
    place(sl, [0, 0, 0], [ang, 0, 0])
    place(sl, [0.13 * side, 0.735, 0])
    parts.push(paint(sl, BOY.shirt.hex, S))

    const hand = sphere(0.042, 7, 5)
    place(hand, [0, -0.225, 0])
    place(hand, [0, 0, 0], [ang, 0, 0])
    place(hand, [0.13 * side, 0.735, 0])
    parts.push(paint(hand, skin, S))
  }

  // neck, so the head sits on the body rather than balancing on it
  parts.push(paint(place(capsule(0.052, 0.05, 3, 7), [0, 0.79, 0]), skin, S))

  // head: the whole silhouette hangs off this. Big, round, tipped forward a
  // touch — a boy looking down the canyon for his dog.
  const headGroup: THREE.BufferGeometry[] = []
  headGroup.push(paint(sphere(0.185, 11, 8), skin, S))
  // hair as a cap sitting on the skull, cut off above the eyes
  const hair = sphere(0.194, 11, 6)
  hair.scale(1, 0.86, 1)
  headGroup.push(paint(place(hair, [0, 0.03, -0.012]), BOY.hair.hex, S))
  for (const side of [1, -1]) {
    const e = sphere(0.042, 6, 4)
    e.scale(0.5, 1, 0.9)
    headGroup.push(paint(place(e, [0.178 * side, -0.01, 0]), skin, S))
  }
  // eyes only. No mouth, no nose.
  for (const side of [1, -1]) {
    const eye = sphere(0.026, 7, 5)
    eye.scale(0.85, 1.1, 0.6)
    headGroup.push(paint(place(eye, [0.068 * side, 0.0, 0.163]), BOY.eyes.hex, 0.15))
  }
  const head = mergePainted(headGroup)
  place(head, [0, 0, 0], [pose.headP, pose.headY, 0])
  place(head, [0, 0.955, 0])
  parts.push(head)

  const geom = mergePainted(parts)
  const mat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    occlusion, // a boy standing in the wall's shadow is in the wall's shadow
  })
  mat.name = 'boy'
  const g = new THREE.Group()
  g.add(new THREE.Mesh(geom, mat))
  g.userData.materials = [mat]
  g.userData.height = 1.15
  g.userData.footprint = 0.34
  return g
}

// --- the dog ---------------------------------------------------------------
// ~0.5 m at the shoulder. Compact, pointed ears, a tail with real language.
// Coat #E5D5BC with white points, so he reads against every palette; the
// collar is #D0342C and is the only red anything in this game.

export function buildDog(pose: DogPose = DOG_LOOK_BACK, occlusion = 0): THREE.Group {
  const parts: THREE.BufferGeometry[] = []
  const coat = DOG.coat.hex
  const pts = DOG.points.hex
  const S = SHADOW_MIX.character

  // The body is ONE lofted barrel, not two capsules pushed together. Two
  // capsules leave a crease down his back and read as a pack animal; a single
  // run of rings from a deep chest to a narrower rump reads as a dog.
  {
    const rings: [number, number, number, number][] = [
      // z, half-width, half-height, centre height. Compact: a canyon dog stands
      // taller than he is long in the barrel, and a long low body reads as a cat.
      [0.24, 0.058, 0.064, 0.4],
      [0.17, 0.098, 0.108, 0.39],
      [0.07, 0.114, 0.122, 0.385],
      [-0.04, 0.106, 0.11, 0.385],
      [-0.14, 0.094, 0.096, 0.39],
      [-0.22, 0.066, 0.068, 0.395],
    ]
    const N = 8
    const ringPts = rings.map(([z, hw, hh, cy]) => {
      const out: THREE.Vector3[] = []
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        // belly tucked up, back rounded
        const t = Math.sin(a)
        const yr = t < 0 ? hh * 0.82 : hh
        out.push(new THREE.Vector3(Math.cos(a) * hw, cy + t * yr, z))
      }
      return out
    })
    const mb: THREE.BufferGeometry[] = []
    const build = (hex: string, faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][]) => {
      const pos: number[] = []
      for (const f of faces) for (const v of f) pos.push(v.x, v.y, v.z)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      return paint(g, hex, S)
    }
    const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []
    for (let r = 0; r < ringPts.length - 1; r++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N
        faces.push([ringPts[r][i], ringPts[r + 1][i], ringPts[r + 1][j]])
        faces.push([ringPts[r][i], ringPts[r + 1][j], ringPts[r][j]])
      }
    }
    // caps
    const front = new THREE.Vector3(0, rings[0][3], rings[0][0] + 0.05)
    const back = new THREE.Vector3(0, rings[rings.length - 1][3], rings[rings.length - 1][0] - 0.05)
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      faces.push([front, ringPts[0][j], ringPts[0][i]])
      faces.push([back, ringPts[ringPts.length - 1][i], ringPts[ringPts.length - 1][j]])
    }
    mb.push(build(coat, faces))
    parts.push(...mb)
  }

  // legs: rounded, with the socks as rounded fur markings rather than blocks
  const legs: [number, number, number][] = [
    [0.08, 0.145, pose.legFL],
    [-0.08, 0.145, pose.legFR],
    [0.082, -0.155, pose.legBL],
    [-0.082, -0.155, pose.legBR],
  ]
  for (const [x, z, ang] of legs) {
    const leg = capsule(0.037, 0.2, 3, 6)
    place(leg, [0, -0.135, 0])
    place(leg, [0, 0, 0], [ang, 0, 0])
    place(leg, [x, 0.35, z])
    parts.push(paint(leg, coat, S))

    const sock = capsule(0.04, 0.04, 3, 7)
    place(sock, [0, -0.225, 0.004])
    place(sock, [0, 0, 0], [ang, 0, 0])
    place(sock, [x, 0.35, z])
    parts.push(paint(sock, pts, S))
  }

  // White points, sized to do their job. art-direction.md puts the coat at
  // `#E5D5BC` and the canyon gravel at `#EFE3C8` — four value points apart, near
  // identical hue — so the coat alone cannot separate him from the ground he
  // trots over. The white points are the value break that does.
  const blaze = sphere(0.062, 8, 6)
  blaze.scale(0.8, 1.4, 0.75)
  parts.push(paint(place(blaze, [0, 0.39, 0.235]), pts, S))

  // A real neck, angled up out of the shoulders. Without it the head is bolted
  // to the front of the barrel and the whole animal reads as a goat.
  const NECK_Y = 0.5
  const NECK_Z = 0.235
  const NECK_TILT = 0.62
  {
    const neck = capsule(0.058, 0.11, 3, 8)
    place(neck, [0, 0, 0], [NECK_TILT, 0, 0])
    place(neck, [0, NECK_Y, NECK_Z])
    parts.push(paint(neck, coat, S))
    const throat = sphere(0.04, 7, 5)
    throat.scale(0.8, 1.1, 0.8)
    parts.push(paint(place(throat, [0, NECK_Y - 0.035, NECK_Z + 0.05]), pts, S))
  }

  // head group: everything above the collar turns together
  const headParts: THREE.BufferGeometry[] = []
  const skull = sphere(0.078, 9, 7)
  skull.scale(1, 0.94, 1.05)
  headParts.push(paint(place(skull, [0, 0, 0]), coat, S))
  // A SHORT muzzle. The long one read as a snout, which is half of why the
  // silhouette said donkey.
  const muzzle = capsule(0.032, 0.035, 3, 7)
  muzzle.rotateX(Math.PI / 2)
  headParts.push(paint(place(muzzle, [0, -0.028, 0.088]), pts, S))
  headParts.push(paint(place(sphere(0.019, 6, 5), [0, -0.02, 0.118]), DOG.nose.hex, 0.2))
  // Ears: short, broad, raked back. Tall thin spikes read as horns.
  for (const side of [1, -1]) {
    const ear = cone(0.046, 0.072, 4)
    ear.scale(1, 1, 0.55)
    place(ear, [0, 0.03, 0])
    place(ear, [0, 0, 0], [-0.52, side * 0.25, side * 0.34])
    place(ear, [0.05 * side, 0.062, -0.012])
    headParts.push(paint(ear, coat, S))
  }
  for (const side of [1, -1]) {
    const eye = sphere(0.015, 6, 5)
    eye.scale(1, 1.05, 0.7)
    headParts.push(paint(place(eye, [0.042 * side, 0.012, 0.06]), DOG.eyes.hex, 0.15))
  }
  const head = mergePainted(headParts)
  place(head, [0, 0, 0], [pose.headP, pose.headY, 0])
  place(head, [0, NECK_Y + 0.115, NECK_Z + 0.075])
  parts.push(head)

  // Tail: a curved taper, not a segmented rod. Tail language is half of what
  // this character says, so the form has to be able to carry a curve.
  {
    const segs = 5
    let px = 0
    let py = 0.415
    let pz = -0.235
    let ang = pose.tailUp
    for (let i = 0; i < segs; i++) {
      const t = i / segs
      const r = 0.028 * (1 - t * 0.55)
      const len = 0.055
      const seg = capsule(r, len * 0.7, 2, 6)
      place(seg, [0, len / 2, 0])
      place(seg, [0, 0, 0], [-(Math.PI / 2 - ang), pose.tailY * (0.4 + t), 0])
      place(seg, [px, py, pz])
      parts.push(paint(seg, i >= segs - 2 ? pts : coat, S))
      // advance along the tail, curling as it goes
      px += Math.sin(pose.tailY * (0.4 + t)) * len * 0.3
      py += Math.sin(ang) * len
      pz -= Math.cos(ang) * len
      ang -= 0.16 // the curl
    }
  }

  const geom = mergePainted(parts)
  const mat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    occlusion,
  })
  mat.name = 'dog'

  // The collar. Its own mesh, its own material, named for its asset id.
  // Red-audit whitelist entry 1 of 2. It wraps the NECK, behind the jaw: a band
  // that can only be seen from one side is not reading as a collar, and on this
  // dog it was reading as something red carried in his mouth.
  const collarGeom = new THREE.TorusGeometry(0.066, 0.024, 6, 14)
  collarGeom.rotateX(Math.PI / 2 - NECK_TILT)
  collarGeom.translate(0, NECK_Y - 0.012, NECK_Z + 0.008)
  const collarMat = makeRamp({
    color: DOG.collar.hex,
    shadowKey: DOG.collar.hex,
    shadowMix: 0.0,
    // The collar barely shades and never takes the terrain's shadow. It is the
    // game's entire search cue: art-direction.md asks that in every frame
    // containing the dog the eye go to it first, involuntarily, and a cue that
    // loses a fifth of its value on the shadow side cannot do that. This is the
    // one material in the game allowed to disobey the light.
    shadeDrop: 0.9,
    flatten: 0.72,
    occlusion: 0,
  })
  collarMat.name = DOG.collar.id

  const g = new THREE.Group()
  g.add(new THREE.Mesh(geom, mat))
  g.add(new THREE.Mesh(collarGeom, collarMat))
  g.userData.materials = [mat, collarMat]
  g.userData.height = 0.6
  g.userData.footprint = 0.28
  return g
}
