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
  // Swung far enough that daylight shows between arm and body. An arm hanging
  // straight down a rounded torso welds to it in silhouette, and the boy loses
  // the one thing that says he is walking.
  armL: -0.62,
  armR: 0.5,
  headY: 0.16,
  headP: -0.05,
  lean: 0.07,
}

export interface DogPose {
  /** Positive swings the limb FORWARD, toward +Z. */
  legFL: number
  legFR: number
  legBL: number
  legBR: number
  /**
   * The look-back is shared between the neck and the head.
   *
   * It was all head before, and a head yawed 117 degrees on a neck that still
   * pointed down the canyon put the muzzle out sideways from the skull like a
   * spur — the single worst-looking thing in the render set. An animal turning
   * to look behind it bends its NECK first; the head only finishes the turn.
   */
  neckY: number
  headY: number
  headP: number
  /** Tail lift and sweep. */
  tailUp: number
  tailY: number
}

/** The look-back: he has stopped, and he is checking that the boy is following. */
export const DOG_LOOK_BACK: DogPose = {
  legFL: 0.1,
  legFR: -0.06,
  legBL: -0.04,
  legBR: 0.08,
  // 77 degrees, shared between neck and head. At 103 the muzzle swung clear
  // across the barrel and eclipsed the collar: a look-back has to read as a
  // glance over the shoulder, not as a head screwed on backwards.
  neckY: 0.5,
  headY: 0.85,
  headP: 0.1,
  // Carried at the croup, a hand above the topline. Higher than this and the
  // curve starts to hook over his back, which is a cat.
  tailUp: 0.85,
  tailY: 0.2,
}

/**
 * Standing square, head forward. Not a staged beat — this is the pose the model
 * is JUDGED in, because a look-back hides the neck, the collar and most of the
 * silhouette behind a head turned a hundred degrees.
 */
export const DOG_NEUTRAL: DogPose = {
  legFL: 0.06,
  legFR: -0.04,
  legBL: -0.03,
  legBR: 0.05,
  neckY: 0,
  headY: 0,
  headP: 0.05,
  tailUp: 0.8,
  tailY: 0.06,
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
    place(arm, [0, 0, 0], [ang, 0, side * -0.16])
    place(arm, [0.142 * side, 0.735, 0])
    parts.push(paint(arm, skin, S))

    // short sleeve, overlapping both the shoulder and the arm
    const sl = capsule(0.052, 0.05, 3, 8)
    place(sl, [0, -0.045, 0])
    place(sl, [0, 0, 0], [ang, 0, side * -0.16])
    place(sl, [0.142 * side, 0.735, 0])
    parts.push(paint(sl, BOY.shirt.hex, S))

    const hand = sphere(0.042, 7, 5)
    place(hand, [0, -0.225, 0])
    place(hand, [0, 0, 0], [ang, 0, side * -0.16])
    place(hand, [0.142 * side, 0.735, 0])
    parts.push(paint(hand, skin, S))
  }

  // neck, so the head sits on the body rather than balancing on it
  parts.push(paint(place(capsule(0.052, 0.05, 3, 7), [0, 0.79, 0]), skin, S))

  // head: the whole silhouette hangs off this. Big, round, tipped forward a
  // touch — a boy looking down the canyon for his dog.
  const headGroup: THREE.BufferGeometry[] = []
  headGroup.push(paint(sphere(0.185, 11, 8), skin, S))
  // Hair as a true spherical CAP, at a uniform radius larger than the skull's.
  //
  // It used to be a whole sphere squashed to 0.86 in Y, which is smaller than
  // the skull over most of the front of the head — so the skin punched through
  // it along the brow, as two bare bands across the forehead at roughly
  // (72,87)-(105,93) in `dog-read-desktop.png`, sampling #CE9F76. A cap of
  // constant radius cannot intersect a smaller concentric sphere at all; the
  // hairline is where the cap ENDS, and it is tipped back so it sits lower at
  // the nape than at the brow.
  const hair = new THREE.SphereGeometry(0.197, 12, 8, 0, Math.PI * 2, 0, 1.28)
  headGroup.push(paint(place(hair, [0, 0.004, -0.004], [0.34, 0, 0]), BOY.hair.hex, S))
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
//
// He read as a CAT through iteration 7, and that is the most expensive possible
// place for this game to fail its own silhouette test. The diagnosis, and what
// each half of it is answered with here:
//
//   arched back, dipping at the loin        -> a LEVEL topline; the tuck is on
//                                              the belly line only
//   no chest, no shoulder, no haunch        -> a forechest prow ahead of the
//                                              forelegs, scapula masses at the
//                                              withers, thigh masses at the hip
//   four spindly posts of one diameter      -> three tapering segments a leg,
//                                              with a real elbow in front and a
//                                              real hock behind
//   thin high-set tail with an S in it      -> base at the croup, half again as
//                                              thick, one gentle arc
//   tall ears set high and wide             -> lower, closer, and smaller
//                                              against a larger skull
//   a white spike for a muzzle              -> a blunt COAT-coloured muzzle,
//                                              with the white moved to the jaw,
//                                              the blaze, the chest and the feet
//
// Proportions are held to real ones: brisket at elbow height, hock behind the
// hip, muzzle about half the skull's length. Flat shading exposes bad forms, so
// the forms are where the work goes.

/**
 * Swing a HANGING part (built along -Y) forward by `ang`. rotateX(-ang) sends
 * -Y toward +Z, which is forward.
 */
const swingX = (g: THREE.BufferGeometry, ang: number) => place(g, [0, 0, 0], [-ang, 0, 0])

/**
 * Tilt a RISING part (built along +Y) forward by `ang`. The opposite sign, and
 * getting it wrong is not subtle: the neck leaned backward while the head was
 * placed forward of it, so the neck rendered as a flat slab lying across the
 * chest with the skull perched on top of it rather than on the end of it.
 */
const tiltX = (g: THREE.BufferGeometry, ang: number) => place(g, [0, 0, 0], [ang, 0, 0])

export function buildDog(pose: DogPose = DOG_LOOK_BACK, occlusion = 0): THREE.Group {
  const parts: THREE.BufferGeometry[] = []
  const coat = DOG.coat.hex
  const pts = DOG.points.hex
  const S = SHADOW_MIX.character

  // The barrel. One loft, and it is NOT symmetric fore and aft: the topline is
  // LEVEL from the withers to the croup, the deepest section is the heart girth
  // just behind the shoulder, and the belly tucks up under the loin. An arched
  // topline over a tucked belly is a cat's roach back, and it was the loudest
  // single thing saying "cat" in the previous model.
  const RINGS: [number, number, number, number][] = [
    // z, half-width, half-height, centre height  (topline = centre + half-height)
    [0.155, 0.1, 0.104, 0.394], // front of the ribcage, behind the shoulder
    [0.1, 0.134, 0.134, 0.372], // heart girth: deepest and widest
    [0.03, 0.136, 0.13, 0.376],
    [-0.045, 0.116, 0.108, 0.398], // loin, tucked
    [-0.108, 0.13, 0.118, 0.39], // haunch
    [-0.168, 0.096, 0.088, 0.404], // croup
  ]
  {
    const N = 8
    const ringPts = RINGS.map(([z, hw, hh, cy]) => {
      const out: THREE.Vector3[] = []
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        const t = Math.sin(a)
        const yr = t < 0 ? hh * 0.8 : hh
        out.push(new THREE.Vector3(Math.cos(a) * hw, cy + t * yr, z))
      }
      return out
    })
    const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []
    for (let r = 0; r < ringPts.length - 1; r++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N
        faces.push([ringPts[r][i], ringPts[r + 1][i], ringPts[r + 1][j]])
        faces.push([ringPts[r][i], ringPts[r + 1][j], ringPts[r][j]])
      }
    }
    const front = new THREE.Vector3(0, RINGS[0][3] - 0.012, RINGS[0][0] + 0.042)
    const back = new THREE.Vector3(0, RINGS[RINGS.length - 1][3], RINGS[RINGS.length - 1][0] - 0.036)
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      faces.push([front, ringPts[0][j], ringPts[0][i]])
      faces.push([back, ringPts[ringPts.length - 1][i], ringPts[ringPts.length - 1][j]])
    }
    const pos: number[] = []
    for (const f of faces) for (const v of f) pos.push(v.x, v.y, v.z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    parts.push(paint(g, coat, S))
  }

  // The forechest. A dog seen from in front is a chest with a head over it; the
  // previous model went straight from the neck to the belly and had no front at
  // all. This is also where one of the white points goes, which is why the two
  // decisions are made in the same place: the chest patch is the largest bright
  // mark on him and it faces the boy for the whole chapter.
  {
    const brisket = sphere(0.066, 9, 6)
    brisket.scale(0.92, 1.06, 0.9)
    parts.push(paint(place(brisket, [0, 0.336, 0.17]), pts, S))
  }
  // Scapulae at the withers and thigh masses over the hip. Both are inside the
  // barrel's silhouette from the side and break it from every other angle,
  // which is exactly what a shoulder and a haunch do.
  for (const side of [1, -1]) {
    const blade = sphere(0.07, 8, 6)
    blade.scale(0.58, 0.94, 1.2)
    parts.push(paint(place(blade, [0.086 * side, 0.424, 0.096]), coat, S))
    const thigh = sphere(0.09, 9, 6)
    thigh.scale(0.66, 1.04, 0.98)
    parts.push(paint(place(thigh, [0.088 * side, 0.382, -0.12]), coat, S))
  }

  /**
   * A leg as a CHAIN. Each segment is a capsule with its own radius, swung by
   * its own angle relative to the one above it, and the radius step at a joint
   * is what makes the joint visible under flat shading. Four posts of one
   * diameter with no bend is a table, and that is what the previous legs were.
   */
  const limb = (
    x: number,
    y: number,
    z: number,
    segs: [len: number, r: number, dAng: number][],
    swing: number,
  ) => {
    let py = y
    let pz = z
    let a = swing
    for (const [len, r, dAng] of segs) {
      a += dAng
      const seg = capsule(r, Math.max(0.012, len - r * 1.1), 3, 7)
      place(seg, [0, -len / 2, 0])
      swingX(seg, a)
      place(seg, [x, py, pz])
      parts.push(paint(seg, coat, S))
      py -= Math.cos(a) * len
      pz += Math.sin(a) * len
    }
    // Paw and sock. White, and shaped: a rounded wedge longer than it is wide,
    // so from the gameplay camera — which looks down at him — a foot is a foot
    // and not a bead on the end of a stick.
    const paw = capsule(0.043, 0.052, 3, 8)
    paw.rotateX(Math.PI / 2)
    paw.scale(0.9, 0.78, 1.0)
    swingX(paw, a * 0.25)
    place(paw, [x, py + 0.03, pz + 0.014])
    parts.push(paint(paw, pts, S))
    const sock = capsule(0.041, 0.045, 3, 7)
    place(sock, [0, -0.024, 0])
    swingX(sock, a)
    place(sock, [x, py + 0.062, pz])
    parts.push(paint(sock, pts, S))
  }

  // Front: humerus back, forearm straight down under the shoulder, short
  // pastern. The elbow lands at the brisket line, which is where a dog's is.
  for (const [side, sw] of [
    [1, pose.legFL],
    [-1, pose.legFR],
  ] as const) {
    limb(
      0.093 * side,
      0.372,
      0.112,
      [
        [0.115, 0.062, -0.46],
        [0.185, 0.053, 0.44],
        [0.045, 0.047, 0.14],
      ],
      sw,
    )
  }
  // Rear: femur forward, gaskin back, metatarsus down. The angle between the
  // second and third segments IS the hock, and it is the joint that separates a
  // dog's back leg from a cat's at a glance.
  for (const [side, sw] of [
    [1, pose.legBL],
    [-1, pose.legBR],
  ] as const) {
    limb(
      0.089 * side,
      0.392,
      -0.124,
      [
        [0.13, 0.078, 0.55],
        [0.135, 0.057, -1.15],
        [0.13, 0.044, 0.68],
      ],
      sw,
    )
  }

  // --- neck and head, as one turning unit ----------------------------------
  // Built in a local frame at the base of the neck and yawed as a whole by
  // `neckY`, with the head taking `headY` on top of that. See DogPose.
  const neckHead: THREE.BufferGeometry[] = []
  const NECK_LEN = 0.19
  const NECK_TILT = 0.56 // radians from vertical, leaning forward
  const HEAD_AT: [number, number, number] = [
    0,
    Math.cos(NECK_TILT) * NECK_LEN + 0.038,
    Math.sin(NECK_TILT) * NECK_LEN + 0.04,
  ]
  {
    // A thick tapered neck that is wider where it meets the shoulder than where
    // it meets the skull. A parallel-sided strut is a llama's.
    const neck = new THREE.CylinderGeometry(0.062, 0.098, NECK_LEN, 9, 1)
    tiltX(neck, NECK_TILT)
    place(neck, [0, Math.cos(NECK_TILT) * NECK_LEN * 0.5, Math.sin(NECK_TILT) * NECK_LEN * 0.5])
    neckHead.push(paint(neck, coat, S))
    // the white of the chest carries up the throat
    const throat = sphere(0.045, 7, 5)
    throat.scale(0.78, 1.1, 0.72)
    neckHead.push(paint(place(throat, [0, 0.042, 0.064]), pts, S))
  }

  const headParts: THREE.BufferGeometry[] = []
  const skull = sphere(0.094, 9, 7)
  skull.scale(0.97, 0.93, 1.08)
  headParts.push(paint(skull, coat, S))
  // Cheeks, filling the corner between skull and muzzle. Without them there is
  // a visible waist there and the muzzle reads as stuck on.
  for (const side of [1, -1]) {
    const cheek = sphere(0.053, 7, 5)
    cheek.scale(0.82, 0.88, 0.9)
    headParts.push(paint(place(cheek, [0.055 * side, -0.024, 0.044]), coat, S))
  }
  // The muzzle. BLUNT, and the same colour as the skull.
  //
  // It was white and it was a spike — 0.152 long off a skull of radius 0.076 —
  // and under the look-back yaw it projected sideways out of the head carrying
  // the nose with it, so it read as a second object rather than as a snout.
  // Painting it in the coat welds it to the skull; the white moves to the jaw
  // and the blaze, where a dog's white actually is.
  //
  // The white of the jaw is the SAME loft, split along its own waist: the
  // upper faces take the coat and the lower faces take the points. A separate
  // white capsule slung under the snout is what produced the wedge in the
  // judged render — narrower than the muzzle it was under, so it stuck out
  // below it as its own object and carried the nose away from the head.
  {
    const rings: [number, number, number][] = [
      [0.046, 0.07, 0.062],
      [0.098, 0.062, 0.054],
      [0.146, 0.052, 0.044],
    ]
    const AXIS_Y = -0.032
    const N = 8
    const rp = rings.map(([z, hw, hh]) => {
      const o: THREE.Vector3[] = []
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        o.push(new THREE.Vector3(Math.cos(a) * hw, AXIS_Y + Math.sin(a) * hh, z))
      }
      return o
    })
    const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []
    for (let r = 0; r < rp.length - 1; r++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N
        faces.push([rp[r][i], rp[r + 1][i], rp[r + 1][j]])
        faces.push([rp[r][i], rp[r + 1][j], rp[r][j]])
      }
    }
    const tip = new THREE.Vector3(0, AXIS_Y - 0.008, 0.176)
    for (let i = 0; i < N; i++)
      faces.push([tip, rp[rp.length - 1][i], rp[rp.length - 1][(i + 1) % N]])
    // close the base, so the stop is a hard edge rather than an open tube
    const base = new THREE.Vector3(0, AXIS_Y, 0.046)
    for (let i = 0; i < N; i++) faces.push([base, rp[0][(i + 1) % N], rp[0][i]])
    const half: [number[], number[]] = [[], []]
    for (const f of faces) {
      const below = (f[0].y + f[1].y + f[2].y) / 3 < AXIS_Y - 0.034 ? 1 : 0
      for (const v of f) half[below].push(v.x, v.y, v.z)
    }
    for (const [i, hex] of [
      [0, coat],
      [1, pts],
    ] as const) {
      if (!half[i].length) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(half[i], 3))
      headParts.push(paint(g, hex, S))
    }
  }
  headParts.push(paint(place(sphere(0.017, 6, 5), [0, -0.044, 0.168]), DOG.nose.hex, 0.2))
  // Ears: pointed, per art-direction.md, but SMALL, low and close together. The
  // previous pair stood 0.085 tall off a 0.076 skull, splayed wide off the
  // crown — that is a cat's ear set, and on a pale wedge head it was most of
  // why he read as one.
  for (const side of [1, -1]) {
    const ear = cone(0.05, 0.084, 4)
    ear.scale(1, 1, 0.6)
    place(ear, [0, 0.038, 0])
    place(ear, [0, 0, 0], [-0.12, side * 0.22, side * 0.36])
    place(ear, [0.05 * side, 0.06, -0.002])
    headParts.push(paint(ear, coat, S))
  }
  {
    const brow = sphere(0.062, 7, 5)
    brow.scale(1.32, 0.46, 0.78)
    headParts.push(paint(place(brow, [0, 0.03, 0.05]), coat, S))
  }
  for (const side of [1, -1]) {
    const eye = sphere(0.016, 6, 5)
    eye.scale(1, 1.05, 0.7)
    headParts.push(paint(place(eye, [0.052 * side, 0.014, 0.07]), DOG.eyes.hex, 0.15))
  }
  const head = mergePainted(headParts)
  place(head, [0, 0, 0], [pose.headP, pose.headY, 0])
  place(head, HEAD_AT)
  neckHead.push(head)

  const NECK_BASE: [number, number, number] = [0, 0.412, 0.132]
  const neckGeom = mergePainted(neckHead)
  place(neckGeom, [0, 0, 0], [0, pose.neckY, 0])
  place(neckGeom, NECK_BASE)
  parts.push(neckGeom)

  // Tail: based at the CROUP and half again as thick as it was, curving once.
  // The old one started at mid-body height with an S in it and tapered to a
  // whip — a cat's tail, drawn on the wrong part of the animal.
  {
    const segs = 3
    let px = 0
    let py = 0.428
    let pz = -0.196
    let ang = pose.tailUp
    for (let i = 0; i < segs; i++) {
      const t = i / segs
      const r = 0.048 * (1 - t * 0.3)
      const len = 0.06
      const seg = capsule(r, len * 0.75, 2, 6)
      place(seg, [0, len / 2, 0])
      place(seg, [0, 0, 0], [-(Math.PI / 2 - ang), pose.tailY * (0.4 + t), 0])
      place(seg, [px, py, pz])
      parts.push(paint(seg, i >= segs - 1 ? pts : coat, S))
      px += Math.sin(pose.tailY * (0.4 + t)) * len * 0.3
      py += Math.sin(ang) * len
      pz -= Math.cos(ang) * len
      // one gentle arc, not an S: the angle only ever falls
      ang -= 0.16
    }
  }

  const geom = mergePainted(parts)

  // Stand him on the ground. The model is authored around the barrel, so where
  // the feet end up is whatever the leg chain and the pose add up to — and in
  // the judged set that was five centimetres of daylight under him with his own
  // contact shadow printed on the sand below. Measured once, here, rather than
  // hand-tuned into the joint heights every time a leg angle changes.
  geom.computeBoundingBox()
  const drop = geom.boundingBox!.min.y
  geom.translate(0, -drop, 0)

  const mat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    occlusion,
  })
  mat.name = 'dog'

  // The collar. Its own mesh, its own material, named for its asset id.
  // Red-audit whitelist entry 1 of 2.
  //
  // A STRAP ON THE NECK, not a scarf on the chest. The previous band was 5.2 cm
  // wide and 9 cm in radius, sitting where the neck meets the shoulder: it was
  // wider than the neck it was supposed to go around, so no aperture was ever
  // visible at any size in any frame and it read as a kerchief. This one shares
  // the neck's axis, sits just behind the jaw where a collar is buckled, and is
  // barely wider in radius than the neck it wraps — so the neck passes through
  // it and the ring is a ring.
  const COLLAR_R = 0.095
  const COLLAR_W = 0.03
  // Mid-neck, not right under the jaw. High on the neck the skull eclipses the
  // band from behind and above — which is the angle the game shows most, and
  // the angle at which the collar is the only way to find him.
  const COLLAR_U = 0.42 // how far up the neck, 0 at the shoulder, 1 at the skull
  const collarGeom = new THREE.CylinderGeometry(COLLAR_R, COLLAR_R * 1.04, COLLAR_W, 14, 1, true)
  tiltX(collarGeom, NECK_TILT)
  const cx = Math.sin(pose.neckY)
  const cz = Math.cos(pose.neckY)
  const lx = 0
  const ly = NECK_BASE[1] + Math.cos(NECK_TILT) * NECK_LEN * COLLAR_U
  const lz = Math.sin(NECK_TILT) * NECK_LEN * COLLAR_U
  collarGeom.rotateY(pose.neckY)
  const COLLAR_AT: [number, number, number] = [
    NECK_BASE[0] + lx * cz + lz * cx,
    ly - drop,
    NECK_BASE[2] + lz * cz - lx * cx,
  ]
  collarGeom.translate(COLLAR_AT[0], COLLAR_AT[1], COLLAR_AT[2])
  const collarMat = makeRamp({
    color: DOG.collar.hex,
    shadowKey: DOG.collar.hex,
    shadowMix: 0.0,
    // The collar barely shades and never takes the terrain's shadow. It is the
    // game's entire search cue: art-direction.md asks that in every frame
    // containing the dog the eye go to it first, involuntarily, and a cue that
    // loses a fifth of its value on the shadow side cannot do that. This is the
    // one material in the game allowed to disobey the light.
    shadeDrop: 0.94,
    flatten: 0.82,
    occlusion: 0,
    // See RampMaterial: the band never projects smaller than this. Two and a
    // half pixels of radius is five pixels across, which is the smallest thing
    // that survives the sampler as a coloured mark rather than as a tint on one
    // grey pixel. It costs nothing up close, where the factor is exactly 1.
    // Measured and kept: docs/decisions.md D21.
    minScreenRadiusPx: 2.5,
    minScreenCenter: COLLAR_AT,
    side: THREE.DoubleSide,
  })
  collarMat.name = DOG.collar.id

  const g = new THREE.Group()
  g.add(new THREE.Mesh(geom, mat))
  g.add(new THREE.Mesh(collarGeom, collarMat))
  g.userData.materials = [mat, collarMat]
  g.userData.height = 0.7
  g.userData.footprint = 0.3
  return g
}
