import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { CameraDef } from '../game/types'
import { world, pointInSolid, insideTrigger } from '../game/world'

// Third-person follow camera. Fixed pitch, fixed distance, damped position and
// yaw, a lead toward the direction of travel, a gentle bias toward the dog when
// he composes, occlusion pull-in against the grey-box solids, and manifest
// framed moments that blend in and out. No player camera control of any kind.

const PITCH = (18 * Math.PI) / 180
const DIST = 6.5
const H_DIST = DIST * Math.cos(PITCH) // horizontal offset behind the boy
const V_DIST = DIST * Math.sin(PITCH) // rise above the look height
const LOOK_HEIGHT = 1.0
const LEAD = 1.8
const POS_DAMP = 3.5 // /s exponential damping on camera position
const LOOK_DAMP = 5.0 // /s on the look target
const YAW_DAMP = 2.5 // /s on follow yaw, so turns swing, never snap
const HEAD_HEIGHT = 1.3
const OCC_STEP = 0.4
const MIN_CAM_DIST = 1.8
const DOG_RANGE = 55
const DOG_BIAS = 0.25
/**
 * How far the rig slides sideways while the dog is composed with the boy, in
 * metres. game-design.md asks the framing to bias "toward keeping both of them
 * composed", and two subjects stacked into one vertical column are not composed
 * -- measured across four takes, the dog's feet came within 0 to 8 px of the
 * boy's crown while the dog's own body was 15 to 30 px, which is the Gate 2
 * hero-shot fusion reproduced by the follow camera.
 *
 * Only a TRANSLATION can fix it. Moving the look target is a rotation and shifts
 * both subjects by the same angle, so it cannot separate them; sliding the rig
 * sideways separates them by parallax, because the boy at 6.5 m moves about
 * three times as far across frame as a dog at twenty. The side is fixed rather
 * than chosen per frame, because a rig that picks its shoulder each frame swings
 * every time the dog crosses the axis.
 */
const DOG_SHIFT = 0.95
const DOG_CONE_DOT = 0.45 // "roughly in front": within ~63 degrees of view axis
const BLEND_TIME = 1.5 // framed-moment blend seconds
const SNAP_DIST = 30 // a jump larger than this (dev teleport) snaps the rig

const _facing = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _lookGoal = new THREE.Vector3()
const _head = new THREE.Vector3()
const _ray = new THREE.Vector3()
const _mid = new THREE.Vector3()
const _toDog = new THREE.Vector3()
const _viewDir = new THREE.Vector3()
const _finalPos = new THREE.Vector3()
const _finalLook = new THREE.Vector3()
const _framedPos = new THREE.Vector3()
const _framedLook = new THREE.Vector3()
const _seen = new THREE.Vector3()
const _side = new THREE.Vector3()

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const initRef = useRef(false)
  const yawRef = useRef(0)
  const posRef = useRef(new THREE.Vector3()) // damped ideal (pre-occlusion) position
  const lookRef = useRef(new THREE.Vector3()) // damped look target
  const occDistRef = useRef(DIST) // damped occlusion-limited camera distance
  const dogBiasRef = useRef(0)
  const framedRef = useRef<CameraDef | null>(null)
  const blendRef = useRef(0)

  useFrame((_, delta) => {
    if (!world.ready || !world.manifest) return
    const dt = Math.min(delta, 0.05)
    // Framed on the height he is SEEN at, not the height he collides at. They
    // are the same everywhere but the ford, where the art bed sits a metre
    // below its collision slab so the crossing is under water.
    _seen.set(world.player.pos.x, world.player.visualY, world.player.pos.z)
    const p = _seen
    const pos = posRef.current
    const look = lookRef.current

    // --- follow yaw: settle behind the direction of travel ------------------
    if (world.player.moving) {
      const d = wrapAngle(world.player.heading - yawRef.current)
      yawRef.current = wrapAngle(
        yawRef.current + d * (1 - Math.exp(-YAW_DAMP * dt)),
      )
    }
    _facing.set(Math.sin(yawRef.current), 0, Math.cos(yawRef.current))

    // --- desired follow position and look target ----------------------------
    _desired.copy(p).addScaledVector(_facing, -H_DIST)
    _desired.y += LOOK_HEIGHT + V_DIST
    const lead = LEAD * Math.min(world.player.speed / 1.6, 1)
    _lookGoal.set(p.x, p.y + LOOK_HEIGHT, p.z).addScaledVector(_facing, lead)

    // --- dog bias: compose boy and dog together when he is near and in view -
    let biasTarget = 0
    if (world.dog.visible && p.distanceTo(world.dog.pos) <= DOG_RANGE) {
      _viewDir.subVectors(look, pos)
      _toDog.subVectors(world.dog.pos, pos)
      if (
        _viewDir.lengthSq() > 1e-6 &&
        _toDog.lengthSq() > 1e-6 &&
        _viewDir.normalize().dot(_toDog.normalize()) > DOG_CONE_DOT
      ) {
        biasTarget = DOG_BIAS
      }
    }
    // the bias amount itself is damped, so it fades in and out unnoticed
    dogBiasRef.current +=
      (biasTarget - dogBiasRef.current) * (1 - Math.exp(-2 * dt))
    if (dogBiasRef.current > 0.001) {
      _mid.copy(p).add(world.dog.pos).multiplyScalar(0.5)
      _mid.y += 0.6
      _lookGoal.lerp(_mid, dogBiasRef.current)
    }

    // --- first frame / dev-teleport: snap, never swoop across the map -------
    if (!initRef.current || pos.distanceTo(_desired) > SNAP_DIST) {
      initRef.current = true
      yawRef.current = world.player.heading
      _facing.set(Math.sin(yawRef.current), 0, Math.cos(yawRef.current))
      _desired.copy(p).addScaledVector(_facing, -H_DIST)
      _desired.y += LOOK_HEIGHT + V_DIST
      _lookGoal.set(p.x, p.y + LOOK_HEIGHT, p.z)
      pos.copy(_desired)
      look.copy(_lookGoal)
      occDistRef.current = DIST
      // The shoulder slide arrives with the dog, but on the FIRST frame there
      // is nothing to arrive from: the take's opening frames were composed as
      // though the dog were not there, and the worst stacking in the walk take
      // was at t=0.82s while the bias was still ramping in.
      dogBiasRef.current = biasTarget
    }

    // --- damped follow ------------------------------------------------------
    pos.lerp(_desired, 1 - Math.exp(-POS_DAMP * dt))
    look.lerp(_lookGoal, 1 - Math.exp(-LOOK_DAMP * dt))

    // --- occlusion: march head -> camera, stop before the first solid -------
    _head.set(p.x, p.y + HEAD_HEIGHT, p.z)
    _ray.subVectors(pos, _head)
    const fullLen = _ray.length()
    let allowed = fullLen
    if (fullLen > 1e-4) {
      _ray.divideScalar(fullLen)
      for (let t = OCC_STEP; t <= fullLen; t += OCC_STEP) {
        if (
          pointInSolid(
            _head.x + _ray.x * t,
            _head.y + _ray.y * t,
            _head.z + _ray.z * t,
          )
        ) {
          allowed = Math.max(MIN_CAM_DIST, t - OCC_STEP)
          break
        }
      }
    }
    // pull in instantly (never clip), ease back out
    if (allowed < occDistRef.current) occDistRef.current = allowed
    else
      occDistRef.current +=
        (allowed - occDistRef.current) * (1 - Math.exp(-3 * dt))
    const camDist = Math.min(occDistRef.current, fullLen)
    _finalPos.copy(_head).addScaledVector(_ray, camDist)
    _finalLook.copy(look)

    // --- framed moments from the manifest -----------------------------------
    let inside: CameraDef | null = null
    for (const def of world.framedCameras ? world.manifest.cameras : []) {
      if (insideTrigger(def.trigger, world.player.pos)) {
        inside = def
        break
      }
    }
    if (inside) framedRef.current = inside
    blendRef.current = THREE.MathUtils.clamp(
      blendRef.current + (inside ? dt : -dt) / BLEND_TIME,
      0,
      1,
    )
    if (blendRef.current <= 0) framedRef.current = null
    const framed = framedRef.current
    if (framed && blendRef.current > 0) {
      const b = blendRef.current
      const k = b * b * (3 - 2 * b) // smoothstep
      _framedPos.set(...framed.position)
      _framedLook.set(...framed.lookAt)
      _finalPos.lerp(_framedPos, k)
      _finalLook.lerp(_framedLook, k)
    }

    // The over-the-shoulder slide. Applied to the POSITION only and never to
    // the look target: re-aiming at the boy after the slide would re-centre him
    // and undo the parallax that does the work. Damped through `dogBiasRef`, so
    // it arrives and leaves with the dog rather than snapping on.
    if (dogBiasRef.current > 0.001) {
      _side.set(_facing.z, 0, -_facing.x)
      _finalPos.addScaledVector(_side, DOG_SHIFT * (dogBiasRef.current / DOG_BIAS))
    }

    camera.position.copy(_finalPos)
    camera.lookAt(_finalLook)
  })

  return null
}
