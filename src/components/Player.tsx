import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { input } from '../game/input'
import { useGame } from '../game/store'
import { world, sampleGround, artGround, updateTriggers, isDev } from '../game/world'
import { pushPrint } from '../game/trail'
import { recFrame } from '../game/record'
import { buildBoyRig, boyRest, BOY_GAIT } from '../art/characters'
import { Gait, solveChain, setWorldQuaternion, type Chain } from '../game/gait'

// The boy. Authored walking pace, camera-relative input, analytic ground
// collision with wall slide. Walking is the only locomotion: no run, no jump,
// no player-controlled pace.
//
// The mesh is the art bible's boy, rigged — the Gate 1 grey box is gone. What
// drives it is a footfall plan, not a limb angle: each foot is put down at a
// world position, held while he passes over it, and picked up again, so the
// contact point cannot slide. See src/game/gait.ts.

// 1.15 m/s, authored, never player-adjustable.
//
// It was 1.6, chosen at Gate 1 against a grey box with no gait in it. A 1.17 m
// boy with a 0.43 m leg covers 0.75 m a stride; 1.6 m/s is then 256 steps a
// minute, which is not a walk at any size. 1.15 puts him at 184, and it puts
// the chapter's 595 m of route at 8.6 minutes against the ~8 the story bible
// asks for — closer than 1.6's 6.2. game-design.md names no number for this.
const WALK_SPEED = 1.15
const ACCEL = 8 // m/s^2 toward intent
// 4.5 m/s^2, which takes him 0.26 s and 15 cm to stop from a walk. It was 12,
// which is 0.10 s and 3 cm — a body that stops in a tenth of a second did not
// have any weight in it to begin with, and the gate asks for stopping to settle.
const DECEL = 4.5
const TURN_RATE = 10 // rad/s heading damping
const STEP_LIMIT = 0.5 // max walkable step height
const SAMPLE_ABOVE = 1.2 // sample ground from this far above the feet

const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _target = new THREE.Vector3()
const _diff = new THREE.Vector3()
const _tp = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _foot = new THREE.Vector3()
const _hip = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _fwdWorld = new THREE.Vector3()

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function Player() {
  const camera = useThree((s) => s.camera)
  const holder = useRef<THREE.Group>(null)

  const rig = useMemo(() => buildBoyRig(), [])
  const rest = useMemo(() => boyRest(), [])
  const gait = useMemo(() => new Gait(BOY_GAIT), [])
  const chains = useMemo<Chain[]>(
    () =>
      (['L', 'R'] as const).map((s) => ({
        root: rig.joints['hip' + s],
        mid: rig.joints['knee' + s],
        l1: rest['hip' + s].pos.distanceTo(rest['knee' + s].pos),
        l2: rest['knee' + s].pos.distanceTo(rest['ankle' + s].pos),
        restDir2: new THREE.Vector3(0, -1, 0),
        // A knee bends forward. It is the only joint on him that has an opinion.
        pole: 1,
      })),
    [rig, rest],
  )
  /** How high the ankle sits when the sole is flat. Measured off the skeleton. */
  const ankleLift = useMemo(() => rest.ankleL.pos.y, [rest])
  const legReach = useMemo(() => chains.map((c) => c.l1 + c.l2), [chains])
  const hipY = useMemo(() => [rest.hipL.pos.y, rest.hipR.pos.y], [rest])

  const vel = useRef(new THREE.Vector3()).current
  const st = useRef({
    meshY: null as number | null,
    debugFast: false,
    // the settle: a small spring the deceleration kicks, and the lean it unwinds
    dip: 0,
    dipV: 0,
    lean: 0,
    lastSpeed: 0,
    lastHeading: 0,
    stillFor: 0,
    breath: 0,
    armPhase: 0,
  }).current

  // Dev-only helpers: number keys teleport along the route, 0 toggles a x4
  // debug speed. The effect body never runs outside dev, so no listener even
  // exists in a non-dev build. The teleport goes through
  // `world.player.teleportTo` because the velocity, the footfall plan and the
  // mesh's height smoothing all have to be reset with it.
  useEffect(() => {
    if (!isDev) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'Digit0') {
        st.debugFast = !st.debugFast
        return
      }
      const m = /^Digit([1-9])$/.exec(e.code)
      if (!m || !world.route) return
      world.player.teleportTo = (world.route.total * Number(m[1])) / 10
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [st])

  useFrame((_, delta) => {
    if (!world.ready || !world.manifest) return
    const dt = Math.min(delta, 0.05)
    const ended = useGame.getState().phase === 'ended'
    const pos = world.player.pos

    // Characters stand on the ART surface where there is one, not on the
    // collision blocks. The two agree almost everywhere; where they
    // deliberately do not — the ford bed sits below its collision slab so the
    // crossing is under water — standing on the collision height is what put
    // the boy dry on top of the river.
    const groundFn = (x: number, z: number, fromY: number) => {
      const a = artGround(x, z)
      if (a !== null) return a
      const g = sampleGround(x, z, fromY)
      return g ? g.y : fromY
    }

    // --- staging teleport (dev / recording harness) --------------------------
    if (world.player.teleportTo >= 0 && world.route && world.player.tracker) {
      const s = world.player.teleportTo
      world.player.teleportTo = -1
      world.route.pointAt(s, _tp)
      const g = sampleGround(_tp.x, _tp.z, _tp.y + 2)
      pos.set(_tp.x, g ? g.y : _tp.y, _tp.z)
      world.player.tracker.s = s
      world.player.progress = s
      world.route.directionAt(s, _tp)
      world.player.heading = Math.atan2(_tp.x, _tp.z)
      vel.set(0, 0, 0)
      st.meshY = null // resnap the mesh, no slow settle across the map
      gait.reset(pos, world.player.heading, groundFn)
    }

    // --- intent, camera-relative --------------------------------------------
    const mx = ended ? 0 : input.move.x
    const mz = ended ? 0 : input.move.z
    camera.getWorldDirection(_fwd)
    _fwd.y = 0
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1)
    _fwd.normalize()
    _right.crossVectors(_fwd, _up) // right = fwd x up (fwd is horizontal)
    const maxSpeed = WALK_SPEED * (isDev && st.debugFast ? 4 : 1)
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

    const root = holder.current
    if (!root) return
    const heading = world.player.heading

    // --- the footfall plan ---------------------------------------------------
    const yawRate = wrapAngle(heading - st.lastHeading) / Math.max(dt, 1e-4)
    st.lastHeading = heading
    gait.update(dt, speed, pos, heading, groundFn, yawRate)
    for (const f of gait.feet) {
      if (!f.justPlanted) continue
      // A print is spawned BY the plant, at the foot's own position. That is
      // what makes "footprints land in step and alternate correctly" a fact
      // about the animation rather than a claim about it.
      pushPrint('boy', f.pos.x, f.pos.y, f.pos.z, f.heading)
    }

    // --- weight ---------------------------------------------------------------
    // Deceleration kicks a small spring in the pelvis and a lean that unwinds
    // through it. Stopping is not the walk cycle scaling to zero: a body that
    // was moving has to put the momentum somewhere.
    const accel = (speed - st.lastSpeed) / Math.max(dt, 1e-4)
    st.lastSpeed = speed
    st.stillFor = speed < 0.05 ? st.stillFor + dt : 0
    const dipTarget = THREE.MathUtils.clamp(-accel * 0.0075, -0.012, 0.03)
    st.dipV += (dipTarget - st.dip) * 190 * dt - st.dipV * 13 * dt
    st.dip += st.dipV * dt
    // Never negative. A body absorbing its own momentum goes DOWN and comes
    // back; letting the spring overshoot upward raised him above what his legs
    // could reach and hung a foot 2 cm in the air for a third of every stance
    // he stood through.
    st.dip = THREE.MathUtils.clamp(st.dip, 0, 0.055)
    // He leans into the walk and unwinds out of it, always a beat behind the feet
    const leanTarget = 0.055 * Math.min(speed / WALK_SPEED, 1) + accel * 0.006
    st.lean += (leanTarget - st.lean) * (1 - Math.exp(-7 * dt))
    st.breath += dt

    // --- place the rig --------------------------------------------------------
    if (st.meshY === null) st.meshY = pos.y
    st.meshY += (pos.y - st.meshY) * (1 - Math.exp(-12 * dt))

    // The pelvis rides the planted feet, not the terrain sample: on a slope, or
    // over a rock, the body follows what he is actually standing on — and it
    // FALLS as the stride opens, because a leg at full stretch cannot also be a
    // leg reaching forward. That fall is the walk's bob, at the amplitude his
    // own leg length implies rather than at one somebody picked.
    let ceiling = -Infinity
    for (const f of gait.feet) if (f.planted) ceiling = Math.max(ceiling, f.pos.y)
    if (ceiling === -Infinity) ceiling = st.meshY
    const support = gait.supportHeight(
      pos,
      heading,
      hipY,
      legReach,
      [ankleLift, ankleLift],
      ceiling,
    )
    // The rig's own rest drop already puts the soles at its origin, so the
    // group's height IS the ground he is standing on. The dip is the settle.
    root.position.set(pos.x, 0, pos.z)
    root.rotation.y = heading
    rig.group.position.y = support - st.dip
    rig.group.updateMatrixWorld(true)

    const pelvis = rig.joints.pelvis
    const chest = rig.joints.chest
    const head = rig.joints.head
    pelvis.rotation.set(st.lean * 0.45, 0, 0)
    // The pelvis rolls toward the loaded leg and the chest counters it, which is
    // most of what makes a walk read as weight rather than as legs alternating.
    const load = gait.feet[0].planted ? 1 : -1
    const swing = Math.sin(gait.phase * Math.PI * 2)
    const gaitAmp = Math.min(speed / WALK_SPEED, 1)
    pelvis.rotation.z = swing * 0.055 * gaitAmp
    pelvis.rotation.y = -swing * 0.09 * gaitAmp
    chest.rotation.set(st.lean, swing * 0.05 * gaitAmp, -swing * 0.03 * gaitAmp)
    void load

    // The head keeps level and looks toward the dog when he is worth looking at.
    const toDog = Math.atan2(
      world.dog.pos.x - pos.x,
      world.dog.pos.z - pos.z,
    )
    const dogRel = THREE.MathUtils.clamp(wrapAngle(toDog - heading), -0.9, 0.9)
    const dogNear = world.dog.visible && pos.distanceTo(world.dog.pos) < 60 ? 1 : 0
    head.rotation.set(
      -st.lean * 0.7 + Math.sin(st.breath * 1.7) * 0.008,
      dogRel * 0.55 * dogNear,
      0,
    )
    rig.group.updateMatrixWorld(true)

    // --- legs: reach for the planted feet ------------------------------------
    _fwdWorld.set(Math.sin(heading), 0, Math.cos(heading))
    for (let i = 0; i < 2; i++) {
      const f = gait.feet[i]
      _foot.set(f.pos.x, f.pos.y + ankleLift, f.pos.z)
      solveChain(chains[i], _foot, _fwdWorld)
      // The shoe stays level with the ground, rolling at heel-strike and
      // toe-off. A foot that keeps the shin's angle is a hoof.
      const ankle = rig.joints[i === 0 ? 'ankleL' : 'ankleR']
      let roll = 0
      if (f.planted) roll = THREE.MathUtils.lerp(-0.22, 0.3, f.stance) * gaitAmp
      else roll = -0.12
      _q.setFromAxisAngle(_up, heading)
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll))
      setWorldQuaternion(ankle, _q)
    }

    // --- arms: they swing against the legs, and lag ---------------------------
    const armSwing = -Math.sin(gait.phase * Math.PI * 2 - 0.35) * 0.62 * gaitAmp
    const rest2 = rig.rest
    rig.joints.shoulderL.rotation.set(
      rest2.shoulderL.x - armSwing,
      0,
      rest2.shoulderL.z,
    )
    rig.joints.shoulderR.rotation.set(
      rest2.shoulderR.x + armSwing,
      0,
      rest2.shoulderR.z,
    )
    // The forearm trails the upper arm: an arm swinging as one stick is a
    // pendulum, and a walking child's elbow is always a little bent.
    rig.joints.elbowL.rotation.x = -0.32 - Math.max(0, armSwing) * 0.55
    rig.joints.elbowR.rotation.x = -0.32 - Math.max(0, -armSwing) * 0.55

    // Where the MESH's soles ended up, not where the plan put them. The plan
    // cannot slide by construction; the thing that CAN is a leg that could not
    // reach what it was asked for, and only the rig knows about that.
    rig.group.updateMatrixWorld(true)
    _hip.setFromMatrixPosition(rig.joints.ankleL.matrixWorld)
    _foot.setFromMatrixPosition(rig.joints.ankleR.matrixWorld)
    recFrame.boyFeet = {
      L: [gait.feet[0].pos.x, gait.feet[0].pos.y, gait.feet[0].pos.z],
      R: [gait.feet[1].pos.x, gait.feet[1].pos.y, gait.feet[1].pos.z],
      plantL: gait.feet[0].planted ? 1 : 0,
      plantR: gait.feet[1].planted ? 1 : 0,
      soleL: [_hip.x, _hip.y - ankleLift, _hip.z],
      soleR: [_foot.x, _foot.y - ankleLift, _foot.z],
    }
  })

  return (
    <group ref={holder}>
      <primitive object={rig.group} />
    </group>
  )
}
