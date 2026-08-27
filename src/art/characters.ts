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

/** A limb: a tapered box pivoted at its top, swung by `angle`. */
function limb(
  w: number,
  len: number,
  d: number,
  hip: [number, number, number],
  angle: number,
  hex: string,
  shadow: number,
) {
  const g = place(box(w, len, d), [0, -len / 2, 0])
  place(g, [0, 0, 0], [angle, 0, 0])
  place(g, hip)
  return paint(g, hex, shadow)
}

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

  // legs
  const legs: [number, number, number][] = [
    [0.085, 0.2, pose.legFL],
    [-0.085, 0.2, pose.legFR],
    [0.085, -0.19, pose.legBL],
    [-0.085, -0.19, pose.legBR],
  ]
  for (const [x, z, ang] of legs) {
    parts.push(limb(0.066, 0.245, 0.07, [x, 0.285, z], ang, coat, S))
    // white points: socks
    const sock = place(box(0.076, 0.105, 0.082), [0, -0.245 + 0.052, 0.004])
    place(sock, [0, 0, 0], [ang, 0, 0])
    place(sock, [x, 0.285, z])
    parts.push(paint(sock, pts, S))
  }

  // torso: chest deeper than the waist, tucked-up belly. Compact.
  const chest = capsule(0.115, 0.16, 3, 8)
  chest.rotateX(Math.PI / 2)
  chest.scale(1, 0.94, 1)
  parts.push(paint(place(chest, [0, 0.345, 0.1], [0, 0, 0]), coat, S))
  const rump = capsule(0.1, 0.11, 3, 8)
  rump.rotateX(Math.PI / 2)
  parts.push(paint(place(rump, [0, 0.34, -0.16]), coat, S))
  // White points, sized to do their job. art-direction.md puts the coat at
  // `#E5D5BC` and the canyon gravel at `#EFE3C8` — four value points apart, near
  // identical hue — so the coat alone cannot separate him from the ground he
  // trots over. The white points are the value break that does, and they have
  // to be big enough to survive at trail distance: chest, throat, muzzle, four
  // socks and the tail tip.
  const blaze = sphere(0.075, 8, 6)
  blaze.scale(0.78, 1.35, 0.7)
  parts.push(paint(place(blaze, [0, 0.34, 0.235]), pts, S))
  const throat = sphere(0.055, 7, 5)
  throat.scale(0.85, 1.1, 0.8)
  parts.push(paint(place(throat, [0, 0.47, 0.25]), pts, S))

  // neck, angled up out of the shoulders
  const neck = place(capsule(0.062, 0.1, 3, 7), [0, 0.47, 0.21], [0.55, 0, 0])
  parts.push(paint(neck, coat, S))

  // head group: everything above the collar turns together
  const headParts: THREE.BufferGeometry[] = []
  const skull = sphere(0.083, 9, 6)
  skull.scale(1, 0.95, 1.12)
  headParts.push(paint(place(skull, [0, 0, 0]), coat, S))
  // muzzle, a white point
  const muzzle = box(0.062, 0.055, 0.1)
  headParts.push(paint(place(muzzle, [0, -0.028, 0.115]), pts, S))
  headParts.push(paint(place(sphere(0.021, 6, 4), [0, -0.014, 0.165]), DOG.nose.hex, 0.2))
  // pointed ears, set wide and upright
  for (const side of [1, -1]) {
    const ear = place(cone(0.04, 0.105, 5), [0, 0.052, 0])
    place(ear, [0, 0, 0], [-0.16, 0, side * 0.2])
    place(ear, [0.055 * side, 0.078, -0.012])
    headParts.push(paint(ear, coat, S))
  }
  // eyes: small and dark. They will catch light at night; not in this chapter.
  for (const side of [1, -1]) {
    const eye = sphere(0.016, 6, 4)
    eye.scale(1, 1.05, 0.7)
    headParts.push(paint(place(eye, [0.046 * side, 0.014, 0.072]), DOG.eyes.hex, 0.15))
  }
  const head = mergePainted(headParts)
  place(head, [0, 0, 0], [pose.headP, pose.headY, 0])
  place(head, [0, 0.565, 0.28])
  parts.push(head)

  // tail: up and carried, with a white tip. Tail language is half of what this
  // character says, so it is a real form, not a stub.
  const tailParts: THREE.BufferGeometry[] = []
  const seg = 4
  for (let i = 0; i < seg; i++) {
    const t = i / seg
    const r = 0.032 * (1 - t * 0.45)
    const s = place(box(r * 2, r * 2, 0.075), [0, 0, -0.038 - i * 0.072])
    tailParts.push(paint(s, i === seg - 1 ? DOG.points.hex : coat, S))
  }
  const tail = mergePainted(tailParts)
  place(tail, [0, 0, 0], [pose.tailUp, pose.tailY, 0])
  place(tail, [0, 0.4, -0.26])
  parts.push(tail)

  const geom = mergePainted(parts)
  const mat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    occlusion,
  })
  mat.name = 'dog'

  // The collar. Its own mesh, its own material, named for its asset id.
  // Red-audit whitelist entry 1 of 2. Nothing else in the game may be this hue.
  // Thicker than a real collar. It is the game's entire search cue, read over
  // the boy's shoulder at twenty metres, and a band that is anatomically right
  // is a band nobody ever sees.
  const collarGeom = new THREE.TorusGeometry(0.078, 0.027, 5, 12)
  collarGeom.rotateX(Math.PI / 2 - 0.55)
  collarGeom.translate(0, 0.5, 0.245)
  const collarMat = makeRamp({
    color: DOG.collar.hex,
    shadowKey: DOG.collar.hex,
    // the collar does not take the terrain shadow: it is the game's search cue
    // and it has to survive him standing in shade
    occlusion: 0,
    // The collar barely darkens in shade. It is the game's search cue and it
    // has to survive being on the shadow side of the dog.
    shadowMix: 0.0,
  })
  collarMat.name = DOG.collar.id

  const g = new THREE.Group()
  g.add(new THREE.Mesh(geom, mat))
  g.add(new THREE.Mesh(collarGeom, collarMat))
  g.userData.materials = [mat, collarMat]
  g.userData.height = 0.62
  g.userData.footprint = 0.3
  return g
}
