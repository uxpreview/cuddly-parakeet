import * as THREE from 'three'
import { CH1 } from './palette'
import { makeRamp } from './RampMaterial'
import {
  bakePose,
  boyRigDef,
  buildCollar,
  buildRig,
  dogRigDef,
  jointMatrix,
  restTransforms,
  DOG_JOINTS,
  type Pose,
  type Rig,
  type RigDef,
} from './rig'

// The two characters, as the rest of the game asks for them.
//
// The anatomy itself lives in `rig.ts` and is authored once. This file is the
// two ways it is consumed:
//
//   buildBoy / buildDog        one merged geometry in an authored pose, one
//                              draw call, for the art bible and for stills
//   buildBoyRig / buildDogRig  the joint hierarchy the gameplay actors animate
//
// Poses are still expressed in the vocabulary Gate 2 used — a limb swing is one
// number, positive forward — and translated to joint rotations here, so the
// art-bible staging reads the same as it did while the actors get a skeleton.

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
   * spur. An animal turning to look behind it bends its NECK first; the head
   * only finishes the turn.
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
  // 63 degrees, shared between neck and head. At 103 the muzzle swung clear
  // across the barrel and eclipsed the collar; at 77 it pointed the snout
  // straight down the `dog-read` lens. A glance is what a look-back is anyway.
  neckY: 0.42,
  headY: 0.68,
  headP: 0.1,
  // Carried at the croup, a hand above the topline. Higher than this and the
  // curve starts to hook over his back, which is a cat.
  tailUp: 0.85,
  tailY: 0.2,
}

/**
 * Standing square, head forward. Not a staged beat — this is the pose the model
 * is JUDGED in, because a look-back hides the neck, the collar and most of the
 * silhouette behind a turned head. See D27.
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

// --- pose translation ------------------------------------------------------
// A limb swing is positive forward; a joint whose hanging geometry must swing
// toward +Z rotates by -swing about X. Getting that sign wrong is not subtle,
// which is why it is written down once here instead of at every call site.

export function boyPose(p: BoyPose): Pose {
  return {
    pelvis: [p.lean * 0.5, 0, 0],
    chest: [p.lean, 0, 0],
    head: [p.headP, p.headY, 0],
    shoulderL: [-p.armL, 0, 0],
    shoulderR: [-p.armR, 0, 0],
    hipL: [-p.legL, 0, 0],
    hipR: [-p.legR, 0, 0],
  }
}

export function dogPose(p: DogPose): Pose {
  const sweep = p.tailY * 0.35
  return {
    neck: [0, p.neckY, 0],
    head: [p.headP, p.headY, 0],
    // The rest skeleton already carries the authored tail lift, so a pose only
    // says how far from it this beat sits.
    tail1: [-(p.tailUp - DOG_JOINTS.tailUp), sweep, 0],
    tail2: [0, sweep, 0],
    tail3: [0, sweep, 0],
    flU: [-p.legFL, 0, 0],
    frU: [-p.legFR, 0, 0],
    blU: [-p.legBL, 0, 0],
    brU: [-p.legBR, 0, 0],
  }
}

// --- merged: one pose, one geometry, one draw call -------------------------

let boyDef: RigDef | null = null
let dogDef: RigDef | null = null
const boyDefOf = () => (boyDef ??= boyRigDef())
const dogDefOf = () => (dogDef ??= dogRigDef())

export function buildBoy(pose: BoyPose = BOY_WALK, occlusion = 0): THREE.Group {
  const geom = bakePose(boyDefOf(), boyPose(pose))
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

export function buildDog(pose: DogPose = DOG_LOOK_BACK, occlusion = 0): THREE.Group {
  const p = dogPose(pose)
  const geom = bakePose(dogDefOf(), p)
  const mat = makeRamp({
    vertexColors: true,
    shadowAttribute: true,
    shadowKey: CH1.limestoneShadow.hex,
    occlusion,
  })
  mat.name = 'dog'

  // The collar rides the neck, so in a baked pose it takes the neck's transform
  // and nothing else. Keeping it a separate mesh with a separate material is
  // what lets the red audit whitelist exactly one asset id.
  const collar = buildCollar()
  // `applyMatrix4` on an Object3D moves the OBJECT, not its geometry — so the
  // collar's local frame is now the neck's, which is exactly the frame its
  // geometry and its screen-size floor were authored in. Transforming the
  // floor's centre by the same matrix on top of that applied the neck twice:
  // the centre landed 40 cm from the ring it is supposed to be the middle of,
  // so `need / radius` came out near 1 and D21's floor did nothing. Measured,
  // the collar fell to one and two pixels at trail distance in `vista` and
  // `prints`, and raising the floor to twelve pixels changed nothing at all,
  // which is what said it was not a tuning problem.
  collar.applyMatrix4(jointMatrix(dogDefOf(), p, 'neck'))
  const mn = collar.material as THREE.ShaderMaterial

  const g = new THREE.Group()
  g.add(new THREE.Mesh(geom, mat))
  g.add(collar)
  g.userData.materials = [mat, mn]
  g.userData.height = 0.7
  g.userData.footprint = 0.3
  return g
}

// --- rigged: the actors -----------------------------------------------------

export { BOY_GAIT, DOG_GAIT, DOG_LEGS, DOG_JOINTS } from './rig'
export type { Rig, DogLeg } from './rig'


/** Add a pose on top of a rig's rest skeleton. */
export function applyPose(rig: Rig, pose: Pose): void {
  for (const [name, rot] of Object.entries(pose)) {
    const j = rig.joints[name]
    const rest = rig.rest[name]
    if (!j || !rest) continue
    j.rotation.set(rest.x + rot[0], rest.y + rot[1], rest.z + rot[2])
  }
}

/** The rest skeleton's measurements, for the gait solver. Computed once. */
export const boyRest = () => (boyRestCache ??= restTransforms(boyDefOf()))
export const dogRest = () => (dogRestCache ??= restTransforms(dogDefOf()))
let boyRestCache: ReturnType<typeof restTransforms> | null = null
let dogRestCache: ReturnType<typeof restTransforms> | null = null

export function buildBoyRig(occlusion = 0): Rig {
  return buildRig(boyDefOf(), occlusion)
}

export function buildDogRig(occlusion = 0): Rig {
  const rig = buildRig(dogDefOf(), occlusion)
  const collar = buildCollar()
  rig.joints.neck.add(collar)
  rig.materials.push(collar.material as THREE.Material)
  return rig
}
