import * as THREE from 'three'
import { BOY, DOG, CH1, SHADOW_MIX } from './palette'
import { makeRamp } from './RampMaterial'
import { mergePainted, paint, place } from './geom'

// The two characters, as skeletons.
//
// Gate 2 built them as one baked geometry each, posed once and merged, which is
// exactly right for a still and useless for Gate 3: the gameplay actors were
// still driving the Gate 1 grey boxes because there was nothing to drive here.
// So the anatomy is authored ONCE, in this file, in joint-local frames, and it
// is consumed two ways:
//
//   buildRig()    a THREE.Group hierarchy with named joints, one mesh per
//                 joint, for the gameplay actors to animate
//   bakePose()    the same parts flattened through a pose into a single merged
//                 geometry and a single draw call, for the art bible and for
//                 anything else that never moves
//
// Because both come out of the same segment list, the dog in the recording and
// the dog in the art bible are literally the same model. That is the point: the
// last pass could not have told you whether they were.
//
// The joint set is not decorative. It is the smallest set the gait states and
// the node vocabulary actually need:
//
//   boy   pelvis, chest, head, two shoulders + elbows, two hips + knees +
//         ankles. The three-joint leg is what makes a planted foot possible at
//         all: swinging one rigid leg about the hip drags the foot along the
//         ground, and "no foot sliding" is a Gate 3 must-confirm.
//   dog   body, neck, head, three tail segments, and three segments a leg.
//         The neck is separate from the head because a look-back bends the neck
//         first (D27). The tail is a chain because tail language is a sweep
//         travelling down it, not a stick waving. The hock is the joint that
//         reads as dog rather than cat, so it has to survive into the rig.

// --- the framework ---------------------------------------------------------

export interface JointDef {
  name: string
  parent: string | null
  /** Rest offset from the parent joint's origin, in the parent's local frame. */
  at: [number, number, number]
  /** Rest rotation, applied before any animation. */
  rot?: [number, number, number]
}

export interface PartDef {
  /** Joint this geometry is rigid with. */
  joint: string
  /** Geometry, authored in that joint's local frame, already painted. */
  geom: THREE.BufferGeometry
}

export interface RigDef {
  joints: JointDef[]
  parts: PartDef[]
  /** Material name, which is also the red audit's asset id for it. */
  material: string
  height: number
  footprint: number
}

export type Pose = Record<string, [number, number, number]>

/** The joint hierarchy, one mesh per joint that carries geometry. */
export interface Rig {
  group: THREE.Group
  joints: Record<string, THREE.Group>
  /** Authored rest rotations, so a pose is always added to the skeleton. */
  rest: Record<string, THREE.Euler>
  materials: THREE.Material[]
  height: number
  footprint: number
  /** Sets the ramp material's terrain-shadow term, which moves with the actor. */
  setOcclusion: (v: number) => void
}

function makeJoints(def: RigDef): { root: THREE.Group; joints: Record<string, THREE.Group> } {
  const joints: Record<string, THREE.Group> = {}
  const root = new THREE.Group()
  for (const j of def.joints) {
    const g = new THREE.Group()
    g.name = j.name
    g.position.set(j.at[0], j.at[1], j.at[2])
    if (j.rot) g.rotation.set(j.rot[0], j.rot[1], j.rot[2])
    joints[j.name] = g
  }
  for (const j of def.joints) {
    ;(j.parent ? joints[j.parent] : root).add(joints[j.name])
  }
  return { root, joints }
}

/** Rest rotations, so a pose is applied on top of the authored skeleton. */
function restRotations(def: RigDef): Record<string, THREE.Euler> {
  const out: Record<string, THREE.Euler> = {}
  for (const j of def.joints) {
    out[j.name] = new THREE.Euler(j.rot?.[0] ?? 0, j.rot?.[1] ?? 0, j.rot?.[2] ?? 0)
  }
  return out
}

/**
 * How far the rest pose stands above its own origin.
 *
 * Measured, once, from the skeleton — not hand-tuned into the joint heights.
 * The boy was floating 5.4 cm above every surface he was placed on for the
 * whole of Gate 2 (`boy` geometry min y = +0.0537 in the judged set) because
 * nothing ever asked. The dog got this at D27 and the boy did not.
 */
export function restDrop(def: RigDef): number {
  const { root, joints } = makeJoints(def)
  root.updateMatrixWorld(true)
  let min = Infinity
  const v = new THREE.Vector3()
  for (const p of def.parts) {
    const pos = p.geom.attributes.position
    const m = joints[p.joint].matrixWorld
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m)
      if (v.y < min) min = v.y
    }
  }
  return min === Infinity ? 0 : min
}

/**
 * Every joint's world transform in the rest pose, with the ground drop applied.
 *
 * The gait solver needs real numbers off the actual skeleton and must not be
 * handed guesses: how high the ankle sits when the sole is flat on the floor IS
 * the leg's effective length, and a guess there is a character who hovers or
 * sinks by however wrong the guess was.
 */
export function restTransforms(def: RigDef): Record<string, { pos: THREE.Vector3; quat: THREE.Quaternion }> {
  const { root, joints } = makeJoints(def)
  root.position.y = -restDrop(def)
  root.updateMatrixWorld(true)
  const out: Record<string, { pos: THREE.Vector3; quat: THREE.Quaternion }> = {}
  for (const name of Object.keys(joints)) {
    out[name] = {
      pos: new THREE.Vector3().setFromMatrixPosition(joints[name].matrixWorld),
      quat: new THREE.Quaternion().setFromRotationMatrix(joints[name].matrixWorld),
    }
  }
  return out
}

export function buildRig(def: RigDef, occlusion = 0): Rig {
  const { root, joints } = makeJoints(def)
  const mat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    occlusion,
  })
  mat.name = def.material
  const materials: THREE.Material[] = [mat]

  // One mesh per joint that carries geometry: 13 for the boy, 18 for the dog.
  // A mesh per PART would be three times that for nothing — parts on the same
  // joint are rigid with each other by definition.
  const byJoint = new Map<string, THREE.BufferGeometry[]>()
  for (const p of def.parts) {
    const list = byJoint.get(p.joint) ?? []
    list.push(p.geom.clone())
    byJoint.set(p.joint, list)
  }
  for (const [name, geoms] of byJoint) {
    joints[name].add(new THREE.Mesh(mergePainted(geoms), mat))
  }

  root.position.y = -restDrop(def)

  return {
    group: root,
    joints,
    rest: restRotations(def),
    materials,
    height: def.height,
    footprint: def.footprint,
    setOcclusion: (v: number) => {
      mat.uniforms.uOcclusion.value = v
    },
  }
}

/**
 * The same parts, flattened through a pose into one geometry and one draw call.
 * This is what the art bible renders, and it is why a still and a frame of the
 * recording cannot drift apart: they come out of the same segment list.
 */
function posedJoints(def: RigDef, pose: Pose) {
  const { root, joints } = makeJoints(def)
  const rest = restRotations(def)
  for (const [name, rot] of Object.entries(pose)) {
    const j = joints[name]
    if (!j) continue
    j.rotation.set(rest[name].x + rot[0], rest[name].y + rot[1], rest[name].z + rot[2])
  }
  root.position.y = -restDrop(def)
  root.updateMatrixWorld(true)
  return joints
}

/**
 * Where one joint ends up under a pose. The merged path needs it for the
 * collar, which is a mesh of its own riding the neck.
 */
export function jointMatrix(def: RigDef, pose: Pose, joint: string): THREE.Matrix4 {
  return posedJoints(def, pose)[joint].matrixWorld.clone()
}

export function bakePose(def: RigDef, pose: Pose): THREE.BufferGeometry {
  const joints = posedJoints(def, pose)
  const out: THREE.BufferGeometry[] = []
  for (const p of def.parts) {
    const g = p.geom.clone()
    g.applyMatrix4(joints[p.joint].matrixWorld)
    out.push(g)
  }
  return mergePainted(out)
}

// --- primitives ------------------------------------------------------------
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
// recommends eyes only, no mouth.
//
// The forms are the ones Gate 2 signed off. What is new is where the cuts fall:
// the single leg capsule becomes thigh / shin / foot about a knee and an ankle,
// and the single arm capsule becomes upper arm / forearm about an elbow. The
// hairline stays a spherical CAP at a radius larger than the skull's, which is
// what stopped the skin punching through the brow.

export const BOY_JOINTS = {
  pelvisY: 0.545,
  chestUp: 0.13, // chest at 0.675
  headUp: 0.3, // head at 0.975
  shoulderX: 0.142,
  shoulderUp: 0.1, // shoulders at 0.775
  upperArm: 0.115,
  foreArm: 0.11,
  hipX: 0.072,
  hipDown: 0.075, // hips at 0.470
  thigh: 0.215, // knees at 0.255
  shin: 0.215, // ankles at 0.040
} as const

/**
 * The legs got 7 cm longer at Gate 3, and it was not a stylistic preference.
 *
 * A leg reaches forward by roughly sqrt(2 * reach * dip), where `dip` is how far
 * the hip is allowed to fall below full extension. The old skeleton put the hip
 * at 0.40 with a hip-to-ankle reach of 0.36 and the ankle 0.04 off the ground —
 * dead straight, zero slack — so ANY step at all was unreachable and the
 * measured reach error at a 0.95 m stride was 505 mm on the left foot. A leg
 * that cannot take a step is a rig problem, not an art one.
 *
 * What it costs: he is 1.17 m rather than 1.15 m tall, and his head is now 2.97
 * of his own heights rather than 2.9, which is closer to the three the art
 * direction asks for. Everything else about him — the palette, the hairline cap,
 * the eyes-only face, the shoe, the silhouette Gate 2 signed off — is untouched.
 */

/** Hip-to-ankle reach, which the gait solver needs and must not guess at. */
export const BOY_LEG_REACH = BOY_JOINTS.thigh + BOY_JOINTS.shin

export function boyRigDef(): RigDef {
  const J = BOY_JOINTS
  const skin = BOY.skin.hex
  const S = SHADOW_MIX.character
  const parts: PartDef[] = []
  const add = (joint: string, geom: THREE.BufferGeometry) => parts.push({ joint, geom })

  const joints: JointDef[] = [
    { name: 'pelvis', parent: null, at: [0, J.pelvisY, 0] },
    { name: 'chest', parent: 'pelvis', at: [0, J.chestUp, 0] },
    { name: 'head', parent: 'chest', at: [0, J.headUp, 0] },
  ]
  for (const [side, sfx] of [
    [1, 'L'],
    [-1, 'R'],
  ] as const) {
    joints.push(
      // The outward splay lives in the shoulder's REST rotation, not in the
      // geometry: an arm hanging straight down a rounded torso welds to it in
      // silhouette and the boy loses the one thing that says he is walking.
      { name: 'shoulder' + sfx, parent: 'chest', at: [J.shoulderX * side, J.shoulderUp, 0], rot: [0, 0, -0.16 * side] },
      { name: 'elbow' + sfx, parent: 'shoulder' + sfx, at: [0, -J.upperArm, 0] },
      { name: 'hip' + sfx, parent: 'pelvis', at: [J.hipX * side, -J.hipDown, 0] },
      { name: 'knee' + sfx, parent: 'hip' + sfx, at: [0, -J.thigh, 0] },
      { name: 'ankle' + sfx, parent: 'knee' + sfx, at: [0, -J.shin, 0] },
    )
  }

  // hips: one mass bridging the two legs, so the boy has a body and not a pair
  // of trousers hanging off a barrel
  {
    const hips = capsule(0.092, 0.09, 3, 9)
    hips.rotateZ(Math.PI / 2)
    add('pelvis', paint(hips, BOY.shorts.hex, S))
  }

  // torso: a soft barrel. Short, so the shirt hem sits above the shorts and the
  // two-value split is visible.
  add('chest', paint(place(capsule(0.132, 0.15, 3, 9), [0, 0, 0]), BOY.shirt.hex, S))
  for (const side of [1, -1]) {
    // The shoulder ball sits INSIDE the torso's silhouette and the arm hangs off
    // it: an arm pivoting at the surface of a capsule reads as a detached box
    // floating beside the body, which is exactly what it is.
    add('chest', paint(place(sphere(0.064, 8, 6), [0.114 * side, J.shoulderUp, 0]), BOY.shirt.hex, S))
  }

  for (const sfx of ['L', 'R']) {
    // upper arm, with the short sleeve overlapping the shoulder
    const arm = capsule(0.041, 0.075, 3, 7)
    add('shoulder' + sfx, paint(place(arm, [0, -J.upperArm / 2, 0]), skin, S))
    add('shoulder' + sfx, paint(place(capsule(0.052, 0.05, 3, 8), [0, -0.045, 0]), BOY.shirt.hex, S))
    // forearm and hand
    add('elbow' + sfx, paint(place(capsule(0.038, 0.055, 3, 7), [0, -J.foreArm / 2, 0]), skin, S))
    add('elbow' + sfx, paint(place(sphere(0.042, 7, 5), [0, -J.foreArm, 0]), skin, S))

    // thigh, with the shorts wrapping the top of it so the leg is never a
    // separate stick beside the body
    add('hip' + sfx, paint(place(capsule(0.058, 0.09, 3, 7), [0, -J.thigh / 2, 0]), skin, S))
    add('hip' + sfx, paint(place(capsule(0.081, 0.1, 3, 9), [0, -0.052, 0]), BOY.shorts.hex, S))
    // shin
    add('knee' + sfx, paint(place(capsule(0.052, 0.085, 3, 7), [0, -J.shin / 2, 0]), skin, S))
    // The shoe. Its sole is the rest pose's lowest point, and restDrop() puts
    // that on the ground rather than 5 cm above it.
    add('ankle' + sfx, paint(place(box(0.105, 0.07, 0.185), [0, -0.005, 0.028]), BOY.shoes.hex, S))
  }

  // neck, so the head sits on the body rather than balancing on it
  add('chest', paint(place(capsule(0.052, 0.05, 3, 7), [0, 0.155, 0]), skin, S))

  // head: the whole silhouette hangs off this
  {
    const h: THREE.BufferGeometry[] = []
    h.push(paint(sphere(0.185, 11, 8), skin, S))
    // Hair as a true spherical CAP at a uniform radius larger than the skull's.
    // A cap of constant radius cannot intersect a smaller concentric sphere at
    // all; the hairline is where the cap ENDS, tipped back so it sits lower at
    // the nape than at the brow.
    const hair = new THREE.SphereGeometry(0.197, 12, 8, 0, Math.PI * 2, 0, 1.28)
    h.push(paint(place(hair, [0, 0.004, -0.004], [0.34, 0, 0]), BOY.hair.hex, S))
    for (const side of [1, -1]) {
      const e = sphere(0.042, 6, 4)
      e.scale(0.5, 1, 0.9)
      h.push(paint(place(e, [0.178 * side, -0.01, 0]), skin, S))
    }
    // eyes only. No mouth, no nose.
    for (const side of [1, -1]) {
      const eye = sphere(0.026, 7, 5)
      eye.scale(0.85, 1.1, 0.6)
      h.push(paint(place(eye, [0.068 * side, 0.0, 0.163]), BOY.eyes.hex, 0.15))
    }
    add('head', mergePainted(h))
  }

  return { joints, parts, material: 'boy', height: 1.15, footprint: 0.34 }
}

// --- the dog ---------------------------------------------------------------
// ~0.5 m at the shoulder. Compact, pointed ears, a tail with real language.
// Coat #E5D5BC with white points; the collar is #D0342C and is the only red
// anything in this game.
//
// The forms are D27's, unchanged, because they are what stopped him reading as
// a cat: a LEVEL topline with the tuck on the belly line only, a forechest prow
// ahead of the forelegs, scapula masses at the withers and thigh masses at the
// hip, three tapering segments a leg with a real elbow in front and a real hock
// behind, a tail based at the croup, small ears rooted on the temple, and a
// blunt coat-coloured muzzle with a stop. What is new is that they are cut at
// the joints instead of baked into one lump.

export const DOG_JOINTS = {
  /** Body pivot, at the croup, so a sit rotates the chest up and the rear down. */
  bodyAt: [0, 0.39, -0.11] as [number, number, number],
  neckBase: [0, 0.412, 0.132] as [number, number, number],
  neckLen: 0.19,
  neckTilt: 0.56, // radians from vertical, leaning forward
  tailBase: [0, 0.428, -0.196] as [number, number, number],
  // 0.085, not 0.06. Three segments made a 0.18 m tail on a 0.70 m dog -- 26%
  // of his height, about eight pixels at the ranges this chapter stages him,
  // four of them thick. art-direction.md asks for "tail with real language" and
  // the Gate 3 must-confirm is that the language READS; measured across two
  // iterations the critic could not locate the tail at all at 29-35 px, in
  // either the trot or the hazard-wait. A real dog's tail is nearer 40% of his
  // height, so this is more accurate as well as more visible.
  tailSeg: 0.085,
  tailUp: 0.85, // carried at the croup, a hand above the topline
  tailBend: -0.16, // one gentle arc, not an S: the angle only ever falls
  frontAt: [0.093, 0.372, 0.112] as [number, number, number],
  rearAt: [0.089, 0.392, -0.124] as [number, number, number],
  /** [length, radius, angle change at this joint] per segment, hip outward. */
  front: [
    [0.115, 0.062, -0.46],
    [0.185, 0.053, 0.44],
    [0.045, 0.047, 0.14],
  ] as [number, number, number][],
  rear: [
    [0.13, 0.078, 0.55],
    [0.135, 0.057, -1.15],
    [0.13, 0.044, 0.68],
  ] as [number, number, number][],
  collarR: 0.095,
  collarW: 0.03,
  collarU: 0.42, // how far up the neck, 0 at the shoulder, 1 at the skull
} as const

export const DOG_LEGS = ['fl', 'fr', 'bl', 'br'] as const
export type DogLeg = (typeof DOG_LEGS)[number]

/** Shoulder-to-paw and hip-to-paw reach, straightened. The gait solver needs both. */
export const DOG_REACH = {
  front: DOG_JOINTS.front.reduce((a, s) => a + s[0], 0),
  rear: DOG_JOINTS.rear.reduce((a, s) => a + s[0], 0),
}

export function dogRigDef(): RigDef {
  const D = DOG_JOINTS
  const coat = DOG.coat.hex
  const pts = DOG.points.hex
  const S = SHADOW_MIX.character
  const parts: PartDef[] = []
  const add = (joint: string, geom: THREE.BufferGeometry) => parts.push({ joint, geom })
  const local = (p: readonly [number, number, number]): [number, number, number] => [
    p[0] - D.bodyAt[0],
    p[1] - D.bodyAt[1],
    p[2] - D.bodyAt[2],
  ]

  const joints: JointDef[] = [
    { name: 'body', parent: null, at: [...D.bodyAt] },
    { name: 'neck', parent: 'body', at: local(D.neckBase) },
    {
      name: 'head',
      parent: 'neck',
      at: [0, Math.cos(D.neckTilt) * D.neckLen + 0.038, Math.sin(D.neckTilt) * D.neckLen + 0.04],
    },
    { name: 'tail1', parent: 'body', at: local(D.tailBase), rot: [-(Math.PI / 2 - D.tailUp), 0, 0] },
    { name: 'tail2', parent: 'tail1', at: [0, D.tailSeg, 0], rot: [D.tailBend, 0, 0] },
    { name: 'tail3', parent: 'tail2', at: [0, D.tailSeg, 0], rot: [D.tailBend, 0, 0] },
  ]
  for (const leg of DOG_LEGS) {
    const front = leg[0] === 'f'
    const side = leg[1] === 'l' ? 1 : -1
    const anchor = front ? D.frontAt : D.rearAt
    const segs = front ? D.front : D.rear
    joints.push({
      name: leg + 'U',
      parent: 'body',
      at: local([anchor[0] * side, anchor[1], anchor[2]]),
      rot: [-segs[0][2], 0, 0],
    })
    joints.push({ name: leg + 'L', parent: leg + 'U', at: [0, -segs[0][0], 0], rot: [-segs[1][2], 0, 0] })
    joints.push({ name: leg + 'P', parent: leg + 'L', at: [0, -segs[1][0], 0], rot: [-segs[2][2], 0, 0] })
  }

  // --- the barrel ----------------------------------------------------------
  // One loft, and it is NOT symmetric fore and aft: the topline is LEVEL from
  // the withers to the croup, the deepest section is the heart girth just
  // behind the shoulder, and the belly tucks up under the loin. An arched
  // topline over a tucked belly is a cat's roach back.
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
    const back = new THREE.Vector3(0, RINGS[5][3], RINGS[5][0] - 0.036)
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N
      faces.push([front, ringPts[0][j], ringPts[0][i]])
      faces.push([back, ringPts[5][i], ringPts[5][j]])
    }
    const pos: number[] = []
    for (const f of faces) for (const v of f) pos.push(v.x, v.y, v.z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    add('body', paint(place(g, local([0, 0, 0])), coat, S))
  }

  // The forechest. A dog seen from in front is a chest with a head over it, and
  // this is also where the largest white point goes — it faces the boy for the
  // whole chapter.
  {
    const brisket = sphere(0.066, 9, 6)
    brisket.scale(0.92, 1.06, 0.9)
    add('body', paint(place(brisket, local([0, 0.336, 0.17])), pts, S))
  }
  // Scapulae at the withers, thigh masses over the hip: inside the barrel's
  // silhouette from the side and breaking it from every other angle, which is
  // exactly what a shoulder and a haunch do.
  for (const side of [1, -1]) {
    const blade = sphere(0.07, 8, 6)
    blade.scale(0.58, 0.94, 1.2)
    add('body', paint(place(blade, local([0.086 * side, 0.424, 0.096])), coat, S))
    const thigh = sphere(0.09, 9, 6)
    thigh.scale(0.66, 1.04, 0.98)
    add('body', paint(place(thigh, local([0.088 * side, 0.382, -0.12])), coat, S))
  }

  // --- the legs ------------------------------------------------------------
  // The radius step at a joint is what makes the joint visible under flat
  // shading. Four posts of one diameter with no bend is a table.
  for (const leg of DOG_LEGS) {
    const front = leg[0] === 'f'
    const segs = front ? D.front : D.rear
    const names = [leg + 'U', leg + 'L', leg + 'P']
    segs.forEach(([len, r], i) => {
      const seg = capsule(r, Math.max(0.012, len - r * 1.1), 3, 7)
      add(names[i], paint(place(seg, [0, -len / 2, 0]), coat, S))
    })
    const tip = segs[2][0]
    // The accumulated rest angle at the pastern, undone in the paw's own
    // geometry so a foot is flat on the ground in the rest pose.
    const level = -(segs[0][2] + segs[1][2] + segs[2][2])
    // Paw and sock. White, and shaped: a rounded wedge longer than it is wide,
    // so from the gameplay camera — which looks down at him — a foot is a foot
    // and not a bead on the end of a stick.
    const paw = capsule(0.043, 0.052, 3, 8)
    paw.rotateX(Math.PI / 2)
    paw.scale(0.9, 0.78, 1.0)
    add(names[2], paint(place(paw, [0, -tip + 0.03, 0.014], [level, 0, 0]), pts, S))
    const sock = capsule(0.041, 0.045, 3, 7)
    add(names[2], paint(place(sock, [0, -tip + 0.038, 0]), pts, S))
  }

  // --- neck and head -------------------------------------------------------
  {
    // A thick tapered neck, wider where it meets the shoulder than where it
    // meets the skull. A parallel-sided strut is a llama's.
    const neck = new THREE.CylinderGeometry(0.062, 0.098, D.neckLen, 9, 1)
    place(neck, [0, 0, 0], [D.neckTilt, 0, 0])
    place(neck, [
      0,
      (Math.cos(D.neckTilt) * D.neckLen) / 2,
      (Math.sin(D.neckTilt) * D.neckLen) / 2,
    ])
    add('neck', paint(neck, coat, S))
    // the white of the chest carries up the throat
    const throat = sphere(0.045, 7, 5)
    throat.scale(0.78, 1.1, 0.72)
    add('neck', paint(place(throat, [0, 0.042, 0.064]), pts, S))
  }

  {
    const h: THREE.BufferGeometry[] = []
    const skull = sphere(0.094, 9, 7)
    skull.scale(0.97, 0.93, 1.08)
    h.push(paint(skull, coat, S))
    // Cheeks, filling the corner between skull and muzzle. Without them there
    // is a visible waist and the muzzle reads as stuck on.
    for (const side of [1, -1]) {
      const cheek = sphere(0.053, 7, 5)
      cheek.scale(0.82, 0.88, 0.9)
      h.push(paint(place(cheek, [0.055 * side, -0.024, 0.044]), coat, S))
    }
    // The muzzle. BLUNT, coat-coloured, and with a STOP: the first ring is set
    // well inside the skull's outline so the profile BREAKS at the brow instead
    // of running crown to chin as one convex curve. NO WHITE ON THE FACE AT ALL
    // — at reading distance a white lower jaw resolves as a tusk.
    {
      const rings: [number, number, number][] = [
        [0.03, 0.062, 0.056],
        [0.092, 0.058, 0.05],
        [0.152, 0.05, 0.042],
      ]
      const AXIS_Y = -0.036
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
      const tip = new THREE.Vector3(0, AXIS_Y - 0.006, 0.196)
      for (let i = 0; i < N; i++) faces.push([tip, rp[2][i], rp[2][(i + 1) % N]])
      // close the base, so the stop is a hard edge rather than an open tube
      const base = new THREE.Vector3(0, AXIS_Y, 0.03)
      for (let i = 0; i < N; i++) faces.push([base, rp[0][(i + 1) % N], rp[0][i]])
      const pos: number[] = []
      for (const f of faces) for (const v of f) pos.push(v.x, v.y, v.z)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      h.push(paint(g, coat, S))
    }
    h.push(paint(place(sphere(0.016, 6, 5), [0, -0.05, 0.19]), DOG.nose.hex, 0.2))
    // Ears: pointed, but SMALL, low and close together, with a section, rooted
    // on the temple and set INTO the skull rather than onto it — sitting proud,
    // the base corners cleared the skull's outline and gave the head four
    // points instead of two.
    for (const side of [1, -1]) {
      const ear = cone(0.05, 0.108, 4)
      ear.scale(1, 1, 0.72)
      place(ear, [0, 0.05, 0])
      place(ear, [0, 0, 0], [-0.1, side * 0.24, side * 0.2])
      place(ear, [0.055 * side, 0.03, 0.002])
      h.push(paint(ear, coat, S))
    }
    {
      const brow = sphere(0.062, 7, 5)
      brow.scale(1.32, 0.44, 0.78)
      h.push(paint(place(brow, [0, 0.042, 0.048]), coat, S))
    }
    for (const side of [1, -1]) {
      const eye = sphere(0.019, 6, 5)
      eye.scale(1, 1.05, 0.7)
      h.push(paint(place(eye, [0.052 * side, 0.002, 0.072]), DOG.eyes.hex, 0.15))
    }
    add('head', mergePainted(h))
  }

  // --- the tail ------------------------------------------------------------
  // Based at the CROUP and half again as thick as a whip, tapering, with the
  // white point on the tip. Three segments, so a sweep travels down it instead
  // of the whole thing waving as one stick.
  for (let i = 0; i < 3; i++) {
    const r = 0.054 * (1 - (i / 3) * 0.3)
    const seg = capsule(r, D.tailSeg * 0.75, 2, 6)
    add('tail' + (i + 1), paint(place(seg, [0, D.tailSeg / 2, 0]), i === 2 ? pts : coat, S))
  }

  return { joints, parts, material: 'dog', height: 0.7, footprint: 0.3 }
}

/**
 * The collar, built in the NECK joint's local frame.
 *
 * Its own mesh and its own material, named for its asset id, because that is
 * what lets the red audit whitelist exactly one material in the whole game and
 * fail everything else. Red-audit whitelist entry 1 of 2.
 *
 * A STRAP ON THE NECK, not a scarf on the chest: it shares the neck's axis, is
 * barely wider in radius than the neck it wraps, and sits mid-neck rather than
 * right under the jaw — high on the neck the skull eclipses it from behind and
 * above, which is the angle the game shows most and the angle at which the
 * collar is the only way to find him.
 */
export function buildCollar(): THREE.Mesh {
  const D = DOG_JOINTS
  const geom = new THREE.CylinderGeometry(D.collarR, D.collarR * 1.04, D.collarW, 14, 1, true)
  place(geom, [0, 0, 0], [D.neckTilt, 0, 0])
  const at: [number, number, number] = [
    0,
    Math.cos(D.neckTilt) * D.neckLen * D.collarU,
    Math.sin(D.neckTilt) * D.neckLen * D.collarU,
  ]
  geom.translate(at[0], at[1], at[2])
  const axis = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), D.neckTilt)
  const mat = makeRamp({
    color: DOG.collar.hex,
    shadowKey: DOG.collar.hex,
    shadowMix: 0.0,
    // The collar barely shades and never takes the terrain's shadow. It is the
    // game's entire search cue, and a cue that loses a fifth of its value on the
    // shadow side cannot take the eye involuntarily. The one material in the
    // game allowed to disobey the light.
    shadeDrop: 0.94,
    flatten: 0.82,
    occlusion: 0,
    // The band never projects smaller than this. It costs nothing up close,
    // where the factor is exactly 1. D21.
    //
    // 4.0, not 2.5. Gate 3 stages the dog at 24-29 m, half again as far as any
    // art-bible viewpoint, and 2.5 px of radius does not survive there. The
    // ring is DRAWN at the floor, but only its core clears the audit's
    // saturation threshold and the antialiased edge is lost: at 2.5 the mark
    // measured 3x2 px at 17.8 m, 1 px at 24 m, and strobed on and off frame to
    // frame for the last five seconds of the Gate 3 reel. A cue that blinks is
    // worse than a small one. So the floor covers the edge it loses, not just
    // the core it keeps.
    //
    // Measured through the game's own camera at 960x540 (tools/dev/collarrange.mjs):
    //
    //     3.1 m  12x10 px  68%      17.6 m  5x4  67%
    //     5.1 m  10x8      66%      21.6 m  5x4  67%
    //     8.4 m   7x5      69%      26.6 m  5x5  63%
    //    13.5 m   6x5      65%      31.6 m  5x6  66%
    //                              35.9 m  6x7  65%
    //
    // Never under five pixels wide, never zero, never fewer than sixteen red
    // pixels, against a banked floor of 5x5 at 21% saturation.
    minScreenRadiusPx: 4.0,
    minScreenCenter: at,
    // The band's own axis, so the strap keeps a readable STROKE at range as
    // well as a readable radius. Taken through exactly the transforms the
    // geometry took: an approximation here shears the ring.
    minScreenAxis: [axis.x, axis.y, axis.z],
    // 4.4, not 1.8. The band's radius floor holds its width across the frame,
    // but a ring seen from behind and above — which is the angle the game shows
    // most — projects as an ellipse whose SHORT axis is the one the radius
    // floor does not defend. Measured at trail distance the collar came back
    // 6 px by 3 at 42% saturation after a blur, against 6 by 4 at 55% when the
    // dog was four metres from the camera. Thickening the strap along its own
    // axis is what puts the short axis back, and up close the factor is still
    // exactly 1.
    //
    // The short axis is the one that fails first, and it fails everywhere, not
    // only at range: from an 18-degree camera the ring projects as an ellipse
    // whose height is mostly stroke. Raising the radius floor alone left the
    // band 3 px tall through the whole 15-20 m band. This is what fixed it.
    minScreenWidthPx: 4.4,
    side: THREE.DoubleSide,
  })
  mat.name = DOG.collar.id
  return new THREE.Mesh(geom, mat)
}

// --- gait specs ------------------------------------------------------------
// Kept here because they are measurements of these skeletons, not free
// parameters: the hip positions are the joints', and the stride lengths are
// what these two leg lengths actually cover at the paces the chapter authors.

/**
 * The boy's walk. Two feet, alternating, with a double-support overlap — duty
 * above 0.5 is what separates a walk from a run, and this game has no run.
 * Stride 0.95 m at 1.6 m/s is a cadence of about 1.7 steps a second, which is
 * a child keeping up rather than an adult strolling.
 */
export const BOY_GAIT = {
  phases: [0, 0.5],
  hips: [
    [BOY_JOINTS.hipX, 0],
    [-BOY_JOINTS.hipX, 0],
  ] as [number, number][],
  // Stride follows from the leg, not from taste. A foot on the ground travels
  // `duty * stride` relative to the hip, so half of that is how far forward the
  // hip has to reach at touchdown; a 0.43 m leg covers 0.225 m of that with a
  // 5.9 cm hip dip, which is 5% of his height and is what a walk's vertical
  // oscillation actually is. 0.75 m of stride at 1.15 m/s is 184 steps a
  // minute: fast, and he is chasing his dog.
  strideLen: 0.75,
  nominal: 1.15,
  duty: 0.6,
  lift: 0.055,
  /** Read by the actor when it turns a sole position into an IK target. */
  ankleLift: 0.04,
  /**
   * The furthest the hip may fall below full leg extension.
   *
   * A boy's legs are exactly as long as his hip is high -- measured, standing
   * slack 0.0000 m -- which is correct anatomy and means the support solve is
   * ALWAYS working against full extension. Every stance width therefore asks
   * the body down, and this budget is how far it may go.
   *
   * It has to be at least what the STRIDE asks for, and the stride asks for a
   * lot: at mid-stance the foot sits about 0.26 m from its hip, so the leg can
   * only give sqrt(0.43^2 - 0.26^2) = 0.343 m of height and the hip must drop
   * 87 mm to stay on it. Cutting this to 0.055 to tidy up the settle starved
   * the walk instead -- the solve saturated at the floor for the whole of every
   * left stance and dragged the sole 377 mm off its own plant, which the gait
   * instrument reported as 293 mm of p99 reach error on that foot in all four
   * takes. Lower hips reach FURTHER back, not less far, which is the part that
   * is easy to get backwards.
   *
   * The settle is fixed where it actually broke -- the rate limit in
   * supportHeight -- not here.
   */
  maxDip: 0.12,
  track: 0,
}

/**
 * The dog's trot: diagonal pairs, front-left with back-right. Duty 0.42 leaves
 * a moment with no foot down, which is the thing that reads as a trot rather
 * than as a fast walk. The negative track is single-tracking — a trotting dog
 * brings his feet in toward the centreline, and it is most of why a trot looks
 * light.
 */
export const DOG_GAIT = {
  phases: [0, 0.5, 0.5, 0], // fl, fr, bl, br
  hips: [
    [DOG_JOINTS.frontAt[0], DOG_JOINTS.frontAt[2]],
    [-DOG_JOINTS.frontAt[0], DOG_JOINTS.frontAt[2]],
    [DOG_JOINTS.rearAt[0], DOG_JOINTS.rearAt[2]],
    [-DOG_JOINTS.rearAt[0], DOG_JOINTS.rearAt[2]],
  ] as [number, number][],
  // Same arithmetic as the boy's. The front leg is the binding one: shoulder at
  // 0.372, pastern joint at 0.084, and 0.30 m of upper-plus-lower between them,
  // which is 12 mm of slack standing square. 0.70 m of stride at duty 0.42 asks
  // for 0.147 m of reach at touchdown and gets it for a 3 cm drop through the
  // stance. At 2.6 m/s that is 3.7 stride cycles a second, which is a dog
  // trotting rather than a dog running — story rule 4.
  // 0.62 m of stride at 2.2 m/s is 3.55 stride cycles a second, which is where
  // a real dog's trot sits, and it is the pace the chapter's trot nodes were
  // retuned to. At 0.70/2.6 he was doing 4.2, and the forelegs — which have
  // 12 mm of slack standing square — could not keep the paws down for the last
  // fifth of every stance.
  strideLen: 0.62,
  nominal: 2.2,
  duty: 0.42,
  lift: 0.05,
  ankleLift: 0.05,
  maxDip: 0.075,
  track: -0.042,
}
