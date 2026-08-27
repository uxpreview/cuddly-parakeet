import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { input } from '../game/input'
import { useGame } from '../game/store'
import { world, sampleGround, updateTriggers, isDev } from '../game/world'

// The boy. Grey-box mesh, authored walking pace, camera-relative input,
// analytic ground collision with wall slide. Walking is the only locomotion:
// no run, no jump, no player-controlled pace.

const WALK_SPEED = 1.6 // m/s, authored. Never player-adjustable.
const ACCEL = 8 // m/s^2 toward intent
const DECEL = 12 // m/s^2 when settling
const TURN_RATE = 10 // rad/s heading damping
const STEP_LIMIT = 0.5 // max walkable step height
const SAMPLE_ABOVE = 1.2 // sample ground from this far above the feet
const STRIDE_FREQ = 5.5 // rad of walk phase per meter walked

const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _target = new THREE.Vector3()
const _diff = new THREE.Vector3()
const _tp = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function Player() {
  const camera = useThree((s) => s.camera)
  const rootRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)
  const legLRef = useRef<THREE.Group>(null)
  const legRRef = useRef<THREE.Group>(null)
  const armLRef = useRef<THREE.Group>(null)
  const armRRef = useRef<THREE.Group>(null)

  const velRef = useRef(new THREE.Vector3())
  const walkPhaseRef = useRef(0)
  const meshYRef = useRef<number | null>(null)
  const debugFastRef = useRef(false)

  // Dev-only helpers: number keys teleport along the route, 0 toggles a x4
  // debug speed. The effect body never runs outside dev, so no listener even
  // exists in a non-dev build.
  useEffect(() => {
    if (!isDev) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Digit0') {
        debugFastRef.current = !debugFastRef.current
        return
      }
      const m = /^Digit([1-9])$/.exec(e.code)
      if (!m) return
      const route = world.route
      const tracker = world.player.tracker
      if (!route || !tracker) return
      const s = (route.total * Number(m[1])) / 10
      route.pointAt(s, _tp)
      const g = sampleGround(_tp.x, _tp.z, _tp.y + 2)
      world.player.pos.set(_tp.x, g ? g.y : _tp.y, _tp.z)
      tracker.s = s
      world.player.progress = s
      velRef.current.set(0, 0, 0)
      meshYRef.current = null // resnap the mesh, no slow settle across the map
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame((_, delta) => {
    if (!world.ready || !world.manifest) return
    const dt = Math.min(delta, 0.05)
    const ended = useGame.getState().phase === 'ended'
    const pos = world.player.pos
    const vel = velRef.current

    // --- intent, camera-relative --------------------------------------------
    const mx = ended ? 0 : input.move.x
    const mz = ended ? 0 : input.move.z
    camera.getWorldDirection(_fwd)
    _fwd.y = 0
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1)
    _fwd.normalize()
    _right.crossVectors(_fwd, _up) // right = fwd x up (fwd is horizontal)
    const maxSpeed = WALK_SPEED * (isDev && debugFastRef.current ? 4 : 1)
    _target.set(_right.x * mx + _fwd.x * mz, 0, _right.z * mx + _fwd.z * mz)
    if (_target.lengthSq() > 1) _target.normalize()
    _target.multiplyScalar(maxSpeed)

    // --- accelerate toward intent, decelerate to rest -----------------------
    const hasIntent = _target.lengthSq() > 1e-6
    _diff.subVectors(_target, vel)
    const diffLen = _diff.length()
    const step = (hasIntent ? ACCEL : DECEL) * dt
    if (diffLen <= step) vel.copy(_target)
    else vel.addScaledVector(_diff, step / diffLen)

    // --- move with ground collision and wall slide --------------------------
    const dx = vel.x * dt
    const dz = vel.z * dt
    if (dx !== 0 || dz !== 0) {
      const probe = (nx: number, nz: number) => {
        const s = sampleGround(nx, nz, pos.y + SAMPLE_ABOVE)
        return s && s.walkable && Math.abs(s.y - pos.y) <= STEP_LIMIT ? s : null
      }
      let s = probe(pos.x + dx, pos.z + dz)
      if (s) {
        pos.x += dx
        pos.z += dz
        pos.y = s.y
      } else {
        s = probe(pos.x + dx, pos.z)
        if (s) {
          pos.x += dx
          pos.y = s.y
          vel.z = 0
        } else {
          s = probe(pos.x, pos.z + dz)
          if (s) {
            pos.z += dz
            pos.y = s.y
            vel.x = 0
          } else {
            vel.set(0, 0, 0)
          }
        }
      }
    }

    // --- heading, smoothed toward direction of travel -----------------------
    const speed = Math.hypot(vel.x, vel.z)
    if (speed > 0.05) {
      const targetHeading = Math.atan2(vel.x, vel.z)
      const d = wrapAngle(targetHeading - world.player.heading)
      world.player.heading = wrapAngle(
        world.player.heading + d * (1 - Math.exp(-TURN_RATE * dt)),
      )
    }
    world.player.speed = speed
    world.player.moving = speed > 0.05

    // --- shared state: progress, triggers, chapter exit ---------------------
    if (!ended && world.player.tracker) {
      world.player.progress = world.player.tracker.update(pos)
      updateTriggers(pos)
      if (world.triggersEntered.has(world.manifest.exit.trigger)) {
        useGame.getState().endChapter()
      }
    }

    // --- mesh: position (y visually smoothed), facing, walk cycle -----------
    const root = rootRef.current
    if (!root) return
    if (meshYRef.current === null) meshYRef.current = pos.y
    meshYRef.current += (pos.y - meshYRef.current) * (1 - Math.exp(-12 * dt))
    root.position.set(pos.x, meshYRef.current, pos.z)
    root.rotation.y = world.player.heading

    const gaitSpeed = Math.min(speed, WALK_SPEED)
    const f = gaitSpeed / WALK_SPEED // 0..1; scales all gait motion so it settles
    walkPhaseRef.current += speed * STRIDE_FREQ * dt
    const ph = walkPhaseRef.current
    const swing = Math.sin(ph)
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.abs(Math.sin(ph)) * 0.035 * f
      bodyRef.current.rotation.x = 0.06 * f // slight forward lean while walking
      bodyRef.current.rotation.z = Math.sin(ph) * 0.03 * f
    }
    if (legLRef.current) legLRef.current.rotation.x = swing * 0.6 * f
    if (legRRef.current) legRRef.current.rotation.x = -swing * 0.6 * f
    if (armLRef.current) armLRef.current.rotation.x = -swing * 0.35 * f
    if (armRRef.current) armRRef.current.rotation.x = swing * 0.35 * f
  })

  // ~1.15m tall, roughly 3 heads: big sphere head, capsule torso, stub limbs.
  // Neutral greys only; red belongs to the dog.
  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        {/* legs pivot at the hip */}
        <group ref={legLRef} position={[0.08, 0.34, 0]}>
          <mesh position={[0, -0.16, 0]}>
            <boxGeometry args={[0.11, 0.32, 0.12]} />
            <meshLambertMaterial color="#767676" />
          </mesh>
        </group>
        <group ref={legRRef} position={[-0.08, 0.34, 0]}>
          <mesh position={[0, -0.16, 0]}>
            <boxGeometry args={[0.11, 0.32, 0.12]} />
            <meshLambertMaterial color="#767676" />
          </mesh>
        </group>
        {/* torso */}
        <mesh position={[0, 0.55, 0]}>
          <capsuleGeometry args={[0.15, 0.3, 4, 12]} />
          <meshLambertMaterial color="#8e8e8e" />
        </mesh>
        {/* arms pivot at the shoulder */}
        <group ref={armLRef} position={[0.2, 0.76, 0]}>
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[0.07, 0.26, 0.08]} />
            <meshLambertMaterial color="#8a8a8a" />
          </mesh>
        </group>
        <group ref={armRRef} position={[-0.2, 0.76, 0]}>
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[0.07, 0.26, 0.08]} />
            <meshLambertMaterial color="#8a8a8a" />
          </mesh>
        </group>
        {/* head — big, rounded */}
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshLambertMaterial color="#a4a4a4" />
        </mesh>
      </group>
    </group>
  )
}
