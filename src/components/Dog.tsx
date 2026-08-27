import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, sampleGround, isDev, type DogActivity } from '../game/world'

// The dog is an actor, not an AI. This component executes the authored node
// route from the chapter manifest and nothing else: no pathfinding, no
// companion simulation. Story rules 1-4 are load-bearing here:
//   1. never in peril, never fleeing — trotting, hard speed cap 3.2 m/s
//   2. waits at danger until the boy is through (hazard-wait)
//   3. looks back constantly — every stretch of movement includes look-backs
//   4. always slightly out of reach; the near-miss is staged, never rubber-banded

const MAX_SPEED = 3.2 // absolute ceiling, ever — trotting, not running
const LEAD = 32 // target lead along the route, keeps him 20-45 m ahead
const CATCH_DIST = 12 // straight-line distance that counts as "caught up"

// The collar is the only red in the game. #D0342C, nowhere else, ever.
const COLLAR_RED = '#D0342C'

const _pos = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _tmp = new THREE.Vector3()

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function angleLerp(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t
}

type NodePhase = 'main' | 'exit-turn' | 'exit-hold' | 'release' | 'nm-beat' | 'nm-escape'

interface DogState {
  init: boolean
  clock: number
  nodeIndex: number
  nodeStart: number
  phase: NodePhase
  phaseStart: number
  s: number
  pos: THREE.Vector3
  heading: number
  // trot
  nextLookBackAt: number
  lookBackUntil: number
  surge: boolean
  caughtCooldownUntil: number
  gentleUntil: number
  // wait / sniff meander
  sniffPos: THREE.Vector3
  sniffTarget: THREE.Vector3
  sniffActive: boolean
  sniffPauseUntil: number
  // look-back node variants (three, so the pattern reads as behavior)
  lbPicked: boolean
  lbCount: number
  lbVariant: number
  lbDuration: number
  // near-miss
  escapeLookDone: boolean
  // idle glances at the player
  nextGlanceAt: number
  glanceUntil: number
  // whistle answer
  lastBounceSeq: number
  bounceKind: 'full' | 'flick' | 'subtle'
  bounceStart: number
  bounceEnd: number
  // smoothed animation params
  look: number
  sit: number
  headPitch: number
  animSpeed: number
  legPhase: number
  tailPhase: number
}

function makeState(): DogState {
  return {
    init: false,
    clock: 0,
    nodeIndex: 0,
    nodeStart: 0,
    phase: 'main',
    phaseStart: 0,
    s: 0,
    pos: new THREE.Vector3(),
    heading: 0,
    nextLookBackAt: 2,
    lookBackUntil: -1,
    surge: false,
    caughtCooldownUntil: 0,
    gentleUntil: -1,
    sniffPos: new THREE.Vector3(),
    sniffTarget: new THREE.Vector3(),
    sniffActive: false,
    sniffPauseUntil: 0,
    lbPicked: false,
    lbCount: 0,
    lbVariant: 0,
    lbDuration: 0.9,
    escapeLookDone: false,
    nextGlanceAt: 3,
    glanceUntil: -1,
    lastBounceSeq: 0,
    bounceKind: 'full',
    bounceStart: -1,
    bounceEnd: -1,
    look: 0,
    sit: 0,
    headPitch: 0,
    animSpeed: 0,
    legPhase: 0,
    tailPhase: 0,
  }
}

export function Dog() {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const legFL = useRef<THREE.Group>(null)
  const legFR = useRef<THREE.Group>(null)
  const legBL = useRef<THREE.Group>(null)
  const legBR = useRef<THREE.Group>(null)
  const st = useRef(makeState()).current

  const mats = useMemo(
    () => ({
      coat: new THREE.MeshLambertMaterial({ color: '#8f8b84' }),
      headM: new THREE.MeshLambertMaterial({ color: '#98948c' }),
      dark: new THREE.MeshLambertMaterial({ color: '#6f6b64' }),
      leg: new THREE.MeshLambertMaterial({ color: '#7a766f' }),
      collar: new THREE.MeshLambertMaterial({ color: COLLAR_RED }),
    }),
    [],
  )

  useFrame((_, delta) => {
    const route = world.route
    const g = root.current
    if (!world.ready || !route || !g) return
    const dt = Math.min(Math.max(delta, 0), 0.05)
    st.clock += dt
    const player = world.player

    if (!st.init) {
      st.init = true
      st.nodeStart = st.clock
      st.phaseStart = st.clock
      const rn0 = route.nodes[0]
      st.s = rn0.s0
      st.pos.copy(rn0.points[0])
      st.sniffPos.copy(rn0.points[0])
      route.directionAt(rn0.s0, _dir)
      st.heading = Math.atan2(_dir.x, _dir.z)
      if (rn0.node.type === 'trot') st.nextLookBackAt = st.clock + 2
    }

    // ---- whistle answer: cosmetic only, never interrupts route logic ----
    if (world.dog.bounceSeq !== st.lastBounceSeq) {
      st.lastBounceSeq = world.dog.bounceSeq
      const a = world.dog.activity
      let kind: 'full' | 'flick' | 'subtle'
      if (a === 'stare' || a === 'near-miss-escape' || (a === 'near-miss-hold' && st.phase === 'nm-beat')) {
        kind = 'subtle' // the staging owns these beats; only a small head-flick
      } else if (a === 'trot' || a === 'look-back') {
        kind = 'flick' // head-flick toward the player without stopping
      } else {
        kind = 'full' // bark-bounce: two quick hops, head snapped to the player
      }
      st.bounceKind = kind
      st.bounceStart = st.clock
      st.bounceEnd = st.clock + (kind === 'full' ? 0.7 : kind === 'flick' ? 0.45 : 0.3)
    }
    const bouncing = st.clock < st.bounceEnd

    // ---- route runner ----
    let activity: DogActivity = 'done'
    let desiredHeading = st.heading
    let lookTarget = 0
    let headPitchTarget = 0
    let sitTarget = 0
    let moveV = 0
    let turnRate = 9

    const distToPlayer = st.pos.distanceTo(player.pos)
    const toPlayerYaw = Math.atan2(player.pos.x - st.pos.x, player.pos.z - st.pos.z)

    const glance = (): boolean => {
      if (st.clock >= st.nextGlanceAt) {
        st.glanceUntil = st.clock + 0.9 + Math.random() * 0.5
        st.nextGlanceAt = st.clock + 4 + Math.random() * 3
      }
      return st.clock < st.glanceUntil
    }

    // Dev-only: jump the actor to a node index (drives the headless staging
    // harness; the field only ever gets set from the ?dev console hook).
    if (isDev && world.dog.devSkipToNode >= 0) {
      const idx = Math.min(world.dog.devSkipToNode, route.nodes.length - 1)
      world.dog.devSkipToNode = -1
      const rn = route.nodes[idx]
      st.nodeIndex = idx
      st.phase = 'main'
      st.nodeStart = st.clock
      st.phaseStart = st.clock
      st.surge = false
      st.lbPicked = false
      st.sniffActive = false
      st.sniffPauseUntil = 0
      st.escapeLookDone = false
      st.s = rn.s0
      st.pos.copy(rn.points[0])
      st.sniffPos.copy(rn.points[0])
      if (rn.node.type === 'trot') st.nextLookBackAt = st.clock + 2
    }

    const advance = () => {
      st.nodeIndex++
      st.phase = 'main'
      st.nodeStart = st.clock
      st.phaseStart = st.clock
      st.surge = false
      st.lbPicked = false
      st.sniffActive = false
      st.sniffPauseUntil = 0
      if (st.nodeIndex < route.nodes.length) {
        const next = route.nodes[st.nodeIndex]
        st.s = Math.max(st.s, next.s0)
        st.sniffPos.copy(next.points[0])
        if (next.node.type === 'trot') st.nextLookBackAt = st.clock + 2
      }
    }

    if (st.nodeIndex >= route.nodes.length) {
      // Past the route's end: he sits facing back up the path toward the
      // player, tail sweeping, and waits forever. He is never gone.
      route.pointAt(route.total, _pos)
      route.directionAt(route.total, _dir)
      desiredHeading = Math.atan2(-_dir.x, -_dir.z)
      activity = 'done'
      sitTarget = 1
      lookTarget = glance() ? 1 : 0.35
    } else {
      const rn = route.nodes[st.nodeIndex]
      const n = rn.node
      switch (n.type) {
        case 'wait': {
          activity = 'wait'
          const at = rn.points[0]
          const idle = n.idle ?? 'stand'
          if (st.phase === 'main') {
            if (idle === 'sniff') {
              // slow meander between random points within 2.5 m, nose down
              headPitchTarget = 0.5
              if (st.clock >= st.sniffPauseUntil) {
                if (!st.sniffActive) {
                  const ang = Math.random() * Math.PI * 2
                  const r = 0.6 + Math.random() * 1.9
                  st.sniffTarget.set(at.x + Math.sin(ang) * r, at.y, at.z + Math.cos(ang) * r)
                  st.sniffActive = true
                }
                _tmp.subVectors(st.sniffTarget, st.sniffPos)
                _tmp.y = 0
                const d = _tmp.length()
                if (d < 0.08) {
                  st.sniffActive = false
                  st.sniffPauseUntil = st.clock + 0.6 + Math.random() * 1.6
                } else {
                  desiredHeading = Math.atan2(_tmp.x, _tmp.z)
                  st.sniffPos.addScaledVector(_tmp.normalize(), Math.min(0.8 * dt, d))
                  moveV = 0.8
                }
              }
              _pos.copy(st.sniffPos)
              if (glance()) lookTarget = 1
            } else {
              // stand facing halfway between the route direction and the player
              _pos.copy(at)
              route.directionAt(rn.s0, _dir)
              const routeYaw = Math.atan2(_dir.x, _dir.z)
              desiredHeading = angleLerp(routeYaw, toPlayerYaw, 0.5)
              lookTarget = glance() ? 1 : 0.15
            }
            const u = n.until
            const elapsed = st.clock - st.nodeStart
            const released =
              (u.time !== undefined && elapsed >= u.time) ||
              (u.proximity !== undefined && distToPlayer <= u.proximity) ||
              (u.trigger !== undefined && world.triggersEntered.has(u.trigger))
            if (released) {
              if (n.exit) {
                st.phase = 'exit-turn'
                st.phaseStart = st.clock
              } else {
                advance()
              }
            }
          } else {
            // exit staging: turn to face, then freeze rigid. In chapter 1 this
            // is the stare up-canyon at nothing before the bolt.
            const exit = n.exit
            _pos.copy(idle === 'sniff' ? st.sniffPos : at)
            if (exit?.face) {
              desiredHeading = Math.atan2(exit.face[0] - _pos.x, exit.face[2] - _pos.z)
            }
            activity = 'stare'
            lookTarget = 0
            turnRate = 14
            if (st.phase === 'exit-turn') {
              if (st.clock - st.phaseStart >= 0.35) {
                st.phase = 'exit-hold'
                st.phaseStart = st.clock
              }
            } else if (st.clock - st.phaseStart >= (exit?.hold ?? 0)) {
              advance()
            }
          }
          break
        }

        case 'hazard-wait': {
          // Story rule 2. He sits at the danger point, calm and patient,
          // facing back toward the boy, and does not move until the boy is
          // through the safety trigger.
          activity = 'hazard-wait'
          _pos.copy(rn.points[0])
          desiredHeading = toPlayerYaw
          if (st.phase === 'main') {
            sitTarget = 1
            lookTarget = glance() ? 1 : 0.3
            if (world.triggersEntered.has(n.safetyTrigger)) {
              st.phase = 'release'
              st.phaseStart = st.clock
            }
          } else {
            // stand, half a second looking at the player, then a gentle start
            sitTarget = 0
            lookTarget = 1
            if (st.clock - st.phaseStart >= 0.5) {
              st.gentleUntil = st.clock + 2 // next trot capped at 2.2 m/s for 2 s
              advance()
            }
          }
          break
        }

        case 'look-back': {
          // Story rule 3, as an authored beat with three visible variants.
          activity = 'look-back'
          _pos.copy(rn.points[0])
          if (!st.lbPicked) {
            st.lbPicked = true
            st.lbVariant = st.lbCount % 3
            st.lbCount++
            st.lbDuration = st.lbVariant === 2 ? 1.3 : 0.9
          }
          const t = st.clock - st.nodeStart
          route.directionAt(rn.s0, _dir)
          const routeYaw = Math.atan2(_dir.x, _dir.z)
          lookTarget = 1
          if (st.lbVariant === 2) {
            // C: full stop, body quarter-turn toward the player, beat, turn back
            desiredHeading = t < st.lbDuration - 0.35 ? angleLerp(routeYaw, toPlayerYaw, 0.6) : routeYaw
          } else {
            // A: head-turn only. B: head-turn + hindquarters shift (in anim below)
            desiredHeading = routeYaw
          }
          if (t >= st.lbDuration) advance()
          break
        }

        case 'trot': {
          activity = 'trot'
          const cap = Math.min(n.speed ?? 2.6, MAX_SPEED)
          let target = THREE.MathUtils.clamp(player.progress + LEAD, rn.s0, rn.s1)
          // Caught up at a clamp: one look-back, then he moves on ahead of the
          // lead target at full speed. The dog moving on, never rubber-banding.
          if (!st.surge && distToPlayer <= CATCH_DIST && st.clock >= st.caughtCooldownUntil) {
            st.surge = true
            st.caughtCooldownUntil = st.clock + 4
            st.lookBackUntil = st.clock + 0.8
          }
          if (st.surge) {
            target = rn.s1
            if (distToPlayer > 24) st.surge = false
          }
          // scheduled look-backs: one ~2 s after the node starts, then every 8-14 s
          if (st.clock >= st.nextLookBackAt && st.clock >= st.lookBackUntil) {
            st.lookBackUntil = st.clock + 0.8
            st.nextLookBackAt = st.clock + 8 + Math.random() * 6
          }
          let sp = cap
          if (st.clock < st.gentleUntil) sp = Math.min(sp, 2.2)
          if (st.clock < st.lookBackUntil) {
            sp = Math.min(sp, 1.2)
            lookTarget = 1
          }
          const ds = Math.min(sp * dt, Math.max(0, target - st.s)) // never backward
          st.s += ds
          moveV = dt > 0 ? ds / dt : 0
          route.pointAt(st.s, _pos)
          route.directionAt(st.s, _dir)
          desiredHeading = Math.atan2(_dir.x, _dir.z)
          if (moveV < 0.05 && glance()) lookTarget = 1 // parked at the clamp: glance back
          if (st.s >= rn.s1 - 1e-3) advance()
          break
        }

        case 'near-miss': {
          // D1: chapter 1's near-miss is staged wide, of sight not touch.
          // He holds regardless of lead discipline — alert and playful, never
          // nervous — lets the player close to the authored approach distance,
          // gives them a generous beat, then breaks away along the escape.
          if (st.phase === 'nm-escape') {
            activity = 'near-miss-escape'
            if (!st.escapeLookDone && st.s - rn.s0 >= 16) {
              st.escapeLookDone = true
              st.lookBackUntil = st.clock + 0.7 // moving look-back mid-escape
            }
            let sp = 2.8
            if (st.clock < st.lookBackUntil) {
              sp = 1.6
              lookTarget = 1
            }
            const ds = Math.min(sp * dt, Math.max(0, rn.s1 - st.s))
            st.s += ds
            moveV = dt > 0 ? ds / dt : 0
            route.pointAt(st.s, _pos)
            route.directionAt(st.s, _dir)
            desiredHeading = Math.atan2(_dir.x, _dir.z)
            if (st.s >= rn.s1 - 1e-3) advance()
          } else {
            activity = 'near-miss-hold'
            _pos.copy(rn.points[0])
            desiredHeading = toPlayerYaw
            if (st.phase === 'nm-beat') {
              lookTarget = 1 // the held beat, looking straight at the player
              if (st.clock - st.phaseStart >= 1.1) {
                st.phase = 'nm-escape'
                st.phaseStart = st.clock
                st.escapeLookDone = false
              }
            } else {
              lookTarget = 0.6
              if (distToPlayer <= n.approach) {
                st.phase = 'nm-beat'
                st.phaseStart = st.clock
              }
            }
          }
          break
        }

        case 'vanish': {
          // not used in chapter 1 — safe no-op skip
          world.dog.visible = false
          _pos.copy(rn.points[0])
          activity = 'idle'
          advance()
          break
        }

        case 'appear': {
          world.dog.visible = true
          _pos.copy(rn.points[0])
          st.pos.copy(rn.points[0])
          activity = 'idle'
          advance()
          break
        }
      }
    }

    // whistle answer steals the head, never the route
    if (bouncing) {
      lookTarget = st.bounceKind === 'subtle' ? Math.max(lookTarget, 0.35) : 1
    }

    // ground snap: stand on walkable ground when there is any, else path height
    const gs = sampleGround(_pos.x, _pos.z, _pos.y + 0.75)
    const groundY = gs && gs.walkable ? gs.y : _pos.y
    st.pos.set(_pos.x, groundY, _pos.z)

    st.heading = angleLerp(st.heading, desiredHeading, 1 - Math.exp(-turnRate * dt))
    st.look += (lookTarget - st.look) * Math.min(1, dt * (lookTarget > st.look ? 10 : 3.5))
    st.sit += (sitTarget - st.sit) * Math.min(1, dt * 4)
    st.headPitch += (headPitchTarget - st.headPitch) * Math.min(1, dt * 6)
    st.animSpeed += (moveV - st.animSpeed) * Math.min(1, dt * 8)

    // publish shared state
    world.dog.pos.copy(st.pos)
    world.dog.heading = st.heading
    world.dog.activity = activity
    world.dog.nodeIndex = st.nodeIndex
    world.dog.s = st.s
    world.dog.lookAtPlayer = st.look

    // ---- cheap grey-box animation ----
    let hop = 0
    let tailFast = false
    if (bouncing && st.bounceKind === 'full') {
      const bt = (st.clock - st.bounceStart) / 0.7
      hop = Math.abs(Math.sin(bt * Math.PI * 2)) * 0.13 // two quick hops
      tailFast = true
    }

    g.visible = world.dog.visible
    g.position.set(st.pos.x, st.pos.y + hop, st.pos.z)
    g.rotation.y = st.heading

    const frozen = activity === 'stare' // exit hold: rigid, tail still, head fixed
    const speedN = THREE.MathUtils.clamp(st.animSpeed / 1.2, 0, 1)
    if (st.animSpeed > 0.05 && !frozen) st.legPhase += dt * (4 + st.animSpeed * 2.6)
    const swing = Math.sin(st.legPhase) * 0.6 * speedN
    if (legFL.current) legFL.current.rotation.x = swing
    if (legBR.current) legBR.current.rotation.x = swing
    if (legFR.current) legFR.current.rotation.x = -swing
    if (legBL.current) legBL.current.rotation.x = -swing

    const b = body.current
    if (b) {
      const bob = frozen ? 0 : Math.abs(Math.sin(st.legPhase)) * 0.03 * speedN
      const breathe = frozen ? 0 : Math.sin(st.clock * 1.6) * 0.004
      b.position.y = bob + breathe - st.sit * 0.03
      b.rotation.x = -0.35 * st.sit // sit: rear down, chest tilted up ~20 deg
      let yawOff = 0
      if (activity === 'near-miss-hold' && st.phase === 'main') {
        // weight shifts every couple of seconds — alert and playful
        yawOff = Math.tanh(2.5 * Math.sin(st.clock * 2.6)) * 0.07
      }
      if (activity === 'look-back' && st.lbVariant === 1) {
        // variant B: hindquarters shift under the head-turn
        const t = THREE.MathUtils.clamp((st.clock - st.nodeStart) / st.lbDuration, 0, 1)
        yawOff += Math.sin(t * Math.PI) * 0.22
      }
      b.rotation.y = yawOff
    }

    const h = head.current
    if (h) {
      const rel = THREE.MathUtils.clamp(wrapAngle(toPlayerYaw - st.heading), -2.1, 2.1)
      h.rotation.y = rel * st.look
      h.rotation.x = st.headPitch * (1 - st.look) // nose-down while sniffing
    }

    const t = tail.current
    if (t) {
      const sitting = st.sit > 0.5
      let rate: number
      let amp: number
      if (frozen) {
        rate = 0
        amp = 0
      } else if (sitting) {
        rate = 1.4 // slow sweep along the ground
        amp = 0.5
      } else if (st.animSpeed > 0.3) {
        rate = 9 // up and swishing at trot
        amp = 0.35
      } else {
        rate = 5
        amp = 0.28
      }
      if (tailFast) {
        rate = 16
        amp = 0.5
      }
      st.tailPhase += dt * rate
      t.rotation.y = Math.sin(st.tailPhase) * amp
      t.rotation.x = THREE.MathUtils.lerp(0.9, 0.1, st.sit) // up at trot, dropped when sitting
    }
  })

  // Grey-box dog, ~0.5 m at the shoulder, nose toward +Z. All greys except
  // the collar band, which must read from behind and the side.
  return (
    <group ref={root}>
      <group ref={body}>
        {/* torso */}
        <mesh material={mats.coat} position={[0, 0.37, -0.02]}>
          <boxGeometry args={[0.22, 0.26, 0.56]} />
        </mesh>
        {/* neck, raised above the shoulder line so the collar clears the torso */}
        <mesh material={mats.coat} position={[0, 0.52, 0.24]}>
          <boxGeometry args={[0.11, 0.18, 0.11]} />
        </mesh>
        {/* the collar — the only red in the game: #D0342C */}
        <mesh material={mats.collar} position={[0, 0.555, 0.24]}>
          <cylinderGeometry args={[0.085, 0.085, 0.05, 12]} />
        </mesh>
        {/* head group: pivot at the neck so yaw/pitch read as the head turning */}
        <group ref={head} position={[0, 0.6, 0.27]}>
          <mesh material={mats.headM} position={[0, 0.06, 0.04]}>
            <boxGeometry args={[0.17, 0.15, 0.17]} />
          </mesh>
          {/* muzzle */}
          <mesh material={mats.dark} position={[0, 0.02, 0.17]}>
            <boxGeometry args={[0.08, 0.07, 0.12]} />
          </mesh>
          {/* ears */}
          <mesh material={mats.dark} position={[-0.055, 0.17, 0]} rotation={[0, 0, 0.12]}>
            <coneGeometry args={[0.035, 0.09, 6]} />
          </mesh>
          <mesh material={mats.dark} position={[0.055, 0.17, 0]} rotation={[0, 0, -0.12]}>
            <coneGeometry args={[0.035, 0.09, 6]} />
          </mesh>
        </group>
        {/* tail: thin and expressive, pivot at the rump */}
        <group ref={tail} position={[0, 0.44, -0.3]}>
          <mesh material={mats.coat} position={[0, 0, -0.13]}>
            <boxGeometry args={[0.04, 0.04, 0.26]} />
          </mesh>
        </group>
        {/* legs: pivot at the hip so rotation.x swings like a limb */}
        <group ref={legFL} position={[-0.08, 0.26, 0.18]}>
          <mesh material={mats.leg} position={[0, -0.13, 0]}>
            <boxGeometry args={[0.07, 0.26, 0.07]} />
          </mesh>
        </group>
        <group ref={legFR} position={[0.08, 0.26, 0.18]}>
          <mesh material={mats.leg} position={[0, -0.13, 0]}>
            <boxGeometry args={[0.07, 0.26, 0.07]} />
          </mesh>
        </group>
        <group ref={legBL} position={[-0.08, 0.26, -0.2]}>
          <mesh material={mats.leg} position={[0, -0.13, 0]}>
            <boxGeometry args={[0.07, 0.26, 0.07]} />
          </mesh>
        </group>
        <group ref={legBR} position={[0.08, 0.26, -0.2]}>
          <mesh material={mats.leg} position={[0, -0.13, 0]}>
            <boxGeometry args={[0.07, 0.26, 0.07]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
