import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world, sampleGround, artGround, isDev, type DogActivity } from '../game/world'
import { rand } from '../game/clock'
import { pushPrint } from '../game/trail'
import { recFrame } from '../game/record'
import { buildDogRig, dogRest, DOG_GAIT, DOG_LEGS } from '../art/characters'
import { DOG } from '../art/palette'
import { Gait, solveChain, setWorldQuaternion, type Chain } from '../game/gait'

// The dog is an actor, not an AI. This component executes the authored node
// route from the chapter manifest and nothing else: no pathfinding, no
// companion simulation. Story rules 1-4 are load-bearing here:
//   1. never in peril, never fleeing — trotting, hard speed cap 3.2 m/s
//   2. waits at danger until the boy is through (hazard-wait)
//   3. looks back constantly — every stretch of movement includes look-backs
//   4. always slightly out of reach; the near-miss is staged, never rubber-banded
//
// The mesh is the art bible's dog, rigged — the Gate 1 grey box is gone. His
// feet are planted by the same footfall planner the boy's are (src/game/gait.ts),
// on a diagonal trot, and every pawprint in the game is spawned by one of those
// plants. "Pawprints match his gait" is therefore not a claim, it is the only
// way a pawprint can come into existence.

const MAX_SPEED = 3.2 // absolute ceiling, ever — trotting, not running
// A dog going from a look-back to a surge used to cross 3 m/s in an eighth of a
// second — 23 m/s^2, which is not an animal, and it showed up in the gait as
// paws sliding 26 mm a frame while the plan raced away from the legs. It also
// reads as a teleport rather than as "he moves on", which is story rule 4.
const ACCEL = 3.4 // m/s^2
const DECEL = 5.0 // m/s^2
const LEAD = 32 // target lead along the route, keeps him 20-45 m ahead
const CATCH_DIST = 12 // straight-line distance that counts as "caught up"
/** How far off the route line he waits, in metres. See `asideDir`. */
const WAIT_ASIDE = 0.95
/** And how fast he steps on and off that verge. A dog's sidestep, not a jump. */
const ASIDE_RATE = 0.55
/** The trot weave: amplitude in metres, and its wavelength in metres of route. */
const WEAVE_AMP = 0.75
const WEAVE_LEN = 5.2
/** How fast the weave fades in and out at a node boundary, per second. */
const WEAVE_EASE = 1.1
/**
 * How long his head stays home after a look-back before another may start.
 * Long enough that the return is visible as a return, at the sizes this chapter
 * stages him. See the note at the refractory itself.
 */
const LOOK_REFRACTORY = 1.25
/** D21's floor, and the share of the dog it may never exceed. See the note at
 * `collarMat`: a floor in pixels is a growing fraction of a shrinking dog. */
const COLLAR_FLOOR_PX = 4.0
const COLLAR_STROKE_PX = 4.4
const COLLAR_MAX_FRAC = 0.26

const _pos = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _foot = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _fwdWorld = new THREE.Vector3()
const _sitQ = new THREE.Quaternion()
const _aside = new THREE.Vector3()
const _asideDir = new THREE.Vector3()

/**
 * The unit vector to the right of travel at arc length `s`, and which side of
 * the line has ground on it. Chapters 2 to 4 are manifests, so a waiting dog has
 * to find the verge from the route alone rather than from a hand-placed position
 * per hazard.
 */
function asideDir(
  route: NonNullable<typeof world.route>,
  s: number,
  want: number,
  out: THREE.Vector3,
): number {
  route.pointAt(s, _tmp)
  route.directionAt(s, _asideDir)
  out.set(_asideDir.z, 0, -_asideDir.x)
  if (out.lengthSq() < 1e-6) return 0
  out.normalize()
  for (const side of [1, -1]) {
    const x = _tmp.x + out.x * want * side
    const z = _tmp.z + out.z * want * side
    const ag = artGround(x, z)
    if (ag !== null || sampleGround(x, z, _tmp.y + 0.75)?.walkable) return side
  }
  return 0
}
const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function angleLerp(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t
}

/**
 * The sit, as joint angles rather than as one body rotation.
 *
 * A dog sitting is not a dog pitched backward: the hocks fold flat under him,
 * the front legs stay vertical under a chest that has risen, and the tail comes
 * down and sweeps along the ground. He sits at every hazard-wait — story rule 2,
 * the most visible thing in the game — so it has to be a real pose.
 */
/**
 * The play-bow: forequarters down, elbows nearly on the ground, rear high, tail
 * up and going. It is the least ambiguous thing a dog can do, and it is what
 * the near-miss needs to READ as staged rather than as the game cheating: a dog
 * who bows and then goes is playing, and story rule 4 says the chase is a game
 * he is playing, in hindsight. Nothing about it is reactive — he bows at the
 * authored approach distance and breaks away on the authored beat.
 */
const BOW = {
  bodyPitch: 0.42, // chest down, croup up; the pivot is at the croup
  drop: 0.05,
  front: [0.62, 0.72, -0.55] as [number, number, number], // U, L, P offsets
  rear: [-0.12, 0.1, 0.0] as [number, number, number],
  // The neck comes back UP out of the bow, and further than the body went down.
  //
  // This is not a flourish. A play bow is chest down and eyes ON you — a dog
  // who drops his head as well is a dog eating. And the body pitch alone
  // carried the neck over far enough that the collar tucked under his own back
  // from a camera 18 degrees above: the red audit found ZERO red pixels for
  // 0.93 s across the payoff beat of the near-miss, which is the one moment
  // that has to read. Net of the body, the neck ends up 0.18 rad above rest,
  // which opens the ring toward the camera instead of closing it.
  neckLift: -0.6,
  headLift: -0.28,
}

const SIT = {
  bodyPitch: -0.52, // chest up, croup down; the body pivot is AT the croup
  drop: 0.135, // and the whole animal settles by this much onto his haunches
  front: [0.52, -0.06, 0.0] as [number, number, number], // U, L, P offsets
  rear: [0.95, -0.62, 0.62] as [number, number, number],
  tail: [1.05, -0.25, -0.2] as [number, number, number],
}

/**
 * The three look-back variants, and what makes them VISIBLY different rather
 * than three timings of the same move. Gate 3 asks for three that read apart in
 * a single recording, so they differ in the body, not only in the head.
 */
//
// At the size this chapter stages him -- eleven to twenty-five pixels tall --
// pose DETAIL does not survive; only silhouette and motion do. The first pass
// separated the three by degree along one axis (body yaw 0 / 0.34 / 0.95) and
// A and B came back indistinguishable: 0.34 rad of hip yaw and a 5.5 cm paw on
// a 25 px dog is one to two pixels. So they are separated by what the LEGS are
// doing, which reads at any size, and only then by pose:
//
//   A  keeps trotting        head over the shoulder, nothing else changes
//   B  stops, paw up         gathered and lowered, deciding whether to wait
//   C  stops, turns, wags    square to the boy, tail high: an invitation
//
// `speed` is the cap in m/s while the variant runs, and it is the difference
// that carries.
const LOOK_BACKS = [
  // A — the glance. Head and neck only, over the shoulder, without breaking
  // stride. The cheapest and by far the most frequent.
  { duration: 0.85, neck: 0.42, head: 0.66, bodyYaw: 0, pitch: 0.06, tailRate: 7, tailAmp: 0.34, pawLift: 0, speed: 1.2 },
  // B — the check. He pulls up, swings his hindquarters round under the turn,
  // drops his head and holds a forepaw off the ground: the shape a dog makes
  // when he is deciding whether to wait for you. The stop is the read.
  { duration: 1.15, neck: 0.58, head: 0.74, bodyYaw: 0.62, pitch: 0.26, tailRate: 4, tailAmp: 0.45, pawLift: 0.13, speed: 0.18 },
  // C — the stop. Full quarter-turn back toward the boy, head level, tail
  // sweeping hard and high, held long enough to be an invitation.
  { duration: 1.6, neck: 0.7, head: 0.85, bodyYaw: 0.95, pitch: 0.14, tailRate: 11, tailAmp: 0.62, pawLift: 0, speed: 0.15 },
]

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
  lookBackVariant: number
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
  trotLbCount: number
  lbDuration: number
  // near-miss
  escapeNextLookAt: number
  /** Metres currently offset from the route line, and which side. See asideDir. */
  aside: number
  asideSide: number
  weaveMix: number
  prevLookTarget: number
  lookRefractoryUntil: number
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
  bow: number
  headPitch: number
  animSpeed: number
  cmdSpeed: number
  legPhase: number
  tailPhase: number
  tailAmp: number
  tailRate: number
  bodyYaw: number
  lastHeading: number
  meshY: number | null
  breath: number
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
    lookBackVariant: 0,
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
    trotLbCount: 0,
    lbDuration: 0.9,
    escapeNextLookAt: 0,
    aside: 0,
    asideSide: 0,
    weaveMix: 0,
    prevLookTarget: 0,
    lookRefractoryUntil: 0,
    nextGlanceAt: 3,
    glanceUntil: -1,
    lastBounceSeq: 0,
    bounceKind: 'full',
    bounceStart: -1,
    bounceEnd: -1,
    look: 0,
    sit: 0,
    bow: 0,
    headPitch: 0,
    animSpeed: 0,
    cmdSpeed: 0,
    legPhase: 0,
    tailPhase: 0,
    tailAmp: 0.3,
    tailRate: 5,
    bodyYaw: 0,
    lastHeading: 0,
    meshY: null,
    breath: 0,
  }
}

export function Dog() {
  const holder = useRef<THREE.Group>(null)
  const st = useRef(makeState()).current

  const rig = useMemo(() => buildDogRig(), [])
  // The collar's pixel floor (D21) keeps it findable at range. But a floor in
  // PIXELS is a growing FRACTION of a shrinking dog: at 17 px of dog the 4.4 px
  // stroke made the strap 41% of his height, which reads as a bib and not as a
  // collar, and Gate 2 banked "the collar is a strap". So the floor is also
  // capped as a share of him. Both ends matter -- findable at thirty metres,
  // still a strap at ten.
  const collarMat = useMemo(
    () =>
      rig.materials.find(
        (m) => (m as THREE.Material).name === DOG.collar.id,
      ) as THREE.ShaderMaterial | undefined,
    [rig],
  )
  const rest = useMemo(() => dogRest(), [])
  const gait = useMemo(() => new Gait(DOG_GAIT), [])
  const chains = useMemo<Chain[]>(
    () =>
      DOG_LEGS.map((leg) => ({
        root: rig.joints[leg + 'U'],
        mid: rig.joints[leg + 'L'],
        l1: rest[leg + 'U'].pos.distanceTo(rest[leg + 'L'].pos),
        l2: rest[leg + 'L'].pos.distanceTo(rest[leg + 'P'].pos),
        restDir2: new THREE.Vector3(0, -1, 0),
        // A foreleg bends BACK at the elbow and a hind leg bends FORWARD at the
        // stifle. This is the difference D27 spent an iteration on: the hock is
        // the joint that separates a dog's back leg from a cat's at a glance,
        // and a solver free to pick its own bend would lose it on frame one.
        pole: leg[0] === 'f' ? -1 : 1,
      })),
    [rig, rest],
  )
  /** Rest height of each pastern joint with the paw flat. Measured, not guessed. */
  const pawLift = useMemo(() => DOG_LEGS.map((l) => rest[l + 'P'].pos.y), [rest])
  const legReach = useMemo(() => chains.map((c) => c.l1 + c.l2), [chains])
  const hipY = useMemo(() => DOG_LEGS.map((l) => rest[l + 'U'].pos.y), [rest])
  const restP = useMemo(() => DOG_LEGS.map((l) => rest[l + 'P'].quat.clone()), [rest])
  /** The body joint's authored LOCAL rest transform, which the sit moves from. */
  const bodyRest = useMemo(
    () => ({ pos: rig.joints.body.position.clone(), rot: rig.joints.body.rotation.clone() }),
    [rig],
  )
  useFrame((state, delta) => {
    const route = world.route
    if (!world.ready || !route) return
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
      } else if (a === 'look-back') {
        kind = 'flick' // already turned toward the player; only the head snaps
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
    let bowTarget = 0
    let moveV = 0
    let turnRate = 9
    let holdSway = 0
    let asideTarget = 0
    /** 1 in the nodes he weaves through, 0 where he holds a position. */
    let weave = 0
    // Look-back staging, read by the rig below. Every look-back in the game —
    // the authored node and the ones the trot schedules for itself — comes out
    // of the same three variants, so the pattern reads as behaviour.
    let neckShare = 0.38
    let lbPitch = 0
    let lbTailRate = 0
    let lbTailAmp = 0
    let lbPawLift = 0
    let bodyYawTarget = 0

    const distToPlayer = st.pos.distanceTo(player.pos)
    const toPlayerYaw = Math.atan2(player.pos.x - st.pos.x, player.pos.z - st.pos.z)

    /** Ramp toward a commanded pace instead of jumping to it. */
    const pace = (want: number): number => {
      const lo = st.cmdSpeed - DECEL * dt
      const hi = st.cmdSpeed + ACCEL * dt
      st.cmdSpeed = Math.max(lo, Math.min(hi, want))
      return Math.max(0, st.cmdSpeed)
    }

    const glance = (): boolean => {
      if (st.clock >= st.nextGlanceAt) {
        st.glanceUntil = st.clock + 0.9 + rand() * 0.5
        st.nextGlanceAt = st.clock + 4 + rand() * 3
      }
      return st.clock < st.glanceUntil
    }

    // Dev-only: jump the actor to a node index (drives the headless staging
    // harness; the field only ever gets set from the ?dev console hook).
    if (isDev && world.dog.devSkipToNode >= 0) {
      const idx = Math.min(world.dog.devSkipToNode, route.nodes.length - 1)
      world.dog.devSkipToNode = -1
      const rn = route.nodes[idx]
      const off = world.dog.devSkipOffset
      world.dog.devSkipOffset = 0
      st.nodeIndex = idx
      st.phase = 'main'
      st.nodeStart = st.clock
      st.phaseStart = st.clock
      st.surge = false
      st.lbPicked = false
      st.sniffActive = false
      st.sniffPauseUntil = 0
      st.escapeNextLookAt = 0
      st.weaveMix = 0
      st.s = Math.min(rn.s1, rn.s0 + off)
      route.pointAt(st.s, _pos)
      st.pos.copy(_pos)
      st.sniffPos.copy(_pos)
      route.directionAt(st.s, _dir)
      st.heading = Math.atan2(_dir.x, _dir.z)
      st.meshY = null
      gait.reset(st.pos, st.heading, (x, z, y) => {
        const a = artGround(x, z)
        if (a !== null) return a
        const s = sampleGround(x, z, y)
        return s && s.walkable ? s.y : y
      })
      if (rn.node.type === 'trot') st.nextLookBackAt = st.clock + 2
      recFrame.staged = 1
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
                  const ang = rand() * Math.PI * 2
                  const r = 0.6 + rand() * 1.9
                  st.sniffTarget.set(at.x + Math.sin(ang) * r, at.y, at.z + Math.cos(ang) * r)
                  st.sniffActive = true
                }
                _tmp.subVectors(st.sniffTarget, st.sniffPos)
                _tmp.y = 0
                const d = _tmp.length()
                if (d < 0.08) {
                  st.sniffActive = false
                  st.sniffPauseUntil = st.clock + 0.6 + rand() * 1.6
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
          // Beside the path, not on it.
          //
          // Sitting exactly on rn.points[0] puts him on the line the boy is
          // walking, so the boy arrives THROUGH him: measured at the ford, the
          // dog's paws at screen y=270 and the boy's crown at y=269, the two of
          // them fused into one shape. That is the same mis-staging Gate 2
          // handed forward from the hero shot, reproduced by the actor rather
          // than by a camera. It is also wrong about the animal -- a dog waiting
          // at water waits at the edge of it.
          _pos.copy(rn.points[0])
          asideTarget = WAIT_ASIDE
          // The near-miss hold got an authored weight shift and this node did
          // not, so the node that carries story rule 2 -- he waits at danger
          // until the boy is through, which is the most visible thing in the
          // game -- held a single position to four decimal places for all 382
          // frames of the ford wait. A sitting dog watching for you is not a
          // bollard.
          holdSway = 0.7
          const waited = st.clock - st.nodeStart
          desiredHeading = toPlayerYaw + Math.sin(waited * 0.41) * 0.075
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
          if (!st.lbPicked) {
            st.lbPicked = true
            st.lbVariant = st.lbCount % 3
            st.lbCount++
            st.lbDuration = LOOK_BACKS[st.lbVariant].duration
          }
          const v = LOOK_BACKS[st.lbVariant]
          const t = st.clock - st.nodeStart
          weave = 1
          // He carries the variant's own pace through the node instead of being
          // pinned to its first point.
          //
          // Pinning meant all three variants played from a dead stop, so the
          // one thing that tells them apart at this size -- whether his LEGS
          // are still going -- was thrown away exactly where the chapter stages
          // the beat on purpose. A is a glance without breaking stride; it has
          // to actually not break stride.
          // Not clamped to rn.s1: node 4 is a POINT node, so it has no arc
          // length of its own to walk along, and the route's parameter is
          // continuous across nodes. advance() takes st.s forward with
          // Math.max, so walking on through costs nothing and snaps nothing.
          const sp = pace(v.speed)
          st.s = Math.min(st.s + sp * dt, route.total)
          route.pointAt(st.s, _pos)
          moveV = dt > 0 ? sp : 0
          route.directionAt(st.s, _dir)
          desiredHeading = Math.atan2(_dir.x, _dir.z)
          lookTarget = 1
          // The turn eases in and back out across the beat rather than snapping
          // to a held pose: what separates the three is the shape of the whole
          // move, not the angle at its peak.
          const shape = Math.sin(Math.PI * THREE.MathUtils.clamp(t / st.lbDuration, 0, 1))
          neckShare = v.neck / (v.neck + v.head)
          lbPitch = v.pitch
          lbTailRate = v.tailRate
          lbTailAmp = v.tailAmp
          bodyYawTarget = v.bodyYaw * shape
          lbPawLift = v.pawLift * shape
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
            // Caught up, so he gives the boy the big one: variant C, the stop.
            st.lookBackVariant = 2
            st.lookBackUntil = st.clock + LOOK_BACKS[2].duration
          }
          if (st.surge) {
            target = rn.s1
            if (distToPlayer > 24) st.surge = false
          }
          // scheduled look-backs: one ~2 s after the node starts, then every 8-14 s
          if (st.clock >= st.nextLookBackAt && st.clock >= st.lookBackUntil) {
            // A and B while he is moving; C belongs to a full stop. Its own
            // counter, because sharing the node's would mean a trot look-back
            // silently advanced which variant the next NODE plays — and the
            // whole point of the node's three is that they cycle in order.
            st.lookBackVariant = st.trotLbCount % 2
            st.trotLbCount++
            st.lookBackUntil = st.clock + LOOK_BACKS[st.lookBackVariant].duration
            st.nextLookBackAt = st.clock + 8 + rand() * 6
          }
          let sp = cap
          if (st.clock < st.gentleUntil) sp = Math.min(sp, 2.2)
          // The answer is a BODY event, not a head flick.
          //
          // story.md gives Chapter 1 answers that are "clean, close and
          // honest", and game-design.md requires a visual correlate legible
          // with sound off. A 0.45 s head yaw on a dog fifteen pixels tall is
          // about two pixels of change: measured, the whole on-screen answer
          // was the birds and nothing else. He stops, turns his head all the
          // way back and barks it. That is the direction the answer is supposed
          // to give, and it is the one moment in a trot node where the gap
          // closes instead of opening.
          if (bouncing && st.bounceKind === 'full') sp = Math.min(sp, 0.12)
          if (st.clock < st.lookBackUntil) {
            const v = LOOK_BACKS[st.lookBackVariant]
            // Each variant carries its own cap: A keeps trotting, B and C pull
            // up. A dog does not check over his shoulder at full trot, and at
            // this range the stop is the only part of B that reads.
            sp = Math.min(sp, v.speed)
            lookTarget = 1
            const left = st.lookBackUntil - st.clock
            const shape = Math.sin(Math.PI * THREE.MathUtils.clamp(1 - left / v.duration, 0, 1))
            neckShare = v.neck / (v.neck + v.head)
            lbPitch = v.pitch
            lbTailRate = v.tailRate
            lbTailAmp = v.tailAmp
            bodyYawTarget = v.bodyYaw * shape
            lbPawLift = v.pawLift * shape
          }
          // He does not trot down the exact centre of the path.
          //
          // A dog holding a ruler-straight line is wrong about the animal, and
          // it is also what welds him to the boy in frame: the camera sits
          // directly behind the boy on the same route, so a dog on the
          // centreline is in the boy's own screen column at every distance, and
          // measured across four takes the two came within 0 to 8 px of each
          // other while the dog's body was 15 to 38 px. The weave is a function
          // of ARC LENGTH, not of time, so it is the same weave on every replay
          // and the prints it lays curve with it -- which is also the end of the
          // trail reading as an evenly spaced dotted line ruled up the middle of
          // the frame.
          weave = 1
          sp = pace(sp)
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
            // He looks back THROUGHOUT the escape, not once in the middle of
            // it. Rule 3 of the dog is that he looks back constantly, and the
            // first pass ran six unbroken seconds without a single one --
            // exactly the stretch where the player most needs to be told he is
            // playing rather than fleeing.
            if (st.clock >= st.escapeNextLookAt && st.clock >= st.lookBackUntil) {
              st.escapeNextLookAt = st.clock + 2.2 + rand() * 1.4
              st.lookBackUntil = st.clock + 0.7
            }
            // A break-away is not a treadmill. `sp = 2.8` held flat to three
            // digits for ten seconds in a straight open corridor is what makes
            // an escape read as the game cheating rather than as a dog playing,
            // and game-design.md is explicit that the fix for that is staging
            // and timing, never speed. So the speed has a SHAPE: he goes hard
            // off the mark, eases as the gap opens, and gives it back whenever
            // he looks round. Peak is unchanged; the average is lower.
            const run = st.clock - st.phaseStart
            let sp = run < 0.9 ? 1.9 + run * 1.0 : 2.8 - Math.min(0.75, (run - 0.9) * 0.24)
            // and a slow breath in it, so no two seconds are the same speed
            sp += Math.sin(run * 1.15) * 0.22
            if (st.clock < st.lookBackUntil) {
              sp = Math.min(sp, 1.45)
              lookTarget = 1
            }
            sp = pace(sp)
            const ds = Math.min(sp * dt, Math.max(0, rn.s1 - st.s))
            st.s += ds
            moveV = dt > 0 ? ds / dt : 0
            route.pointAt(st.s, _pos)
            route.directionAt(st.s, _dir)
            desiredHeading = Math.atan2(_dir.x, _dir.z)
            if (st.s >= rn.s1 - 1e-3) advance()
          } else {
            activity = 'near-miss-hold'
            // He waits, he does not freeze. The first pass copied him onto
            // rn.points[0] every frame with look pinned at 0.600 and the tail
            // at one rate for 3.6 s: speed 0.000 to three decimals, no weight
            // shift, no head drift, a statue with a wagging tail. A dog holding
            // a bow-tease shifts his weight and swings his head across you.
            //
            // Small on purpose. This is an authored hold, not an idle system:
            // eight centimetres of sway and a slow head drift, both derived
            // from his own clock so the take stays deterministic.
            // The sway rides the BODY over his planted feet, not the route
            // position: shifting the root would drag four fixed paws across the
            // ground and buy the idle back in foot-slide. See `holdSway` below.
            const held = st.clock - st.phaseStart
            _pos.copy(rn.points[0])
            holdSway = 1
            desiredHeading = toPlayerYaw + Math.sin(held * 0.47) * 0.09
            if (st.phase === 'nm-beat') {
              lookTarget = 1 // the held beat, looking straight at the player
              // Down into the bow, hold it, and up again on the way out. The
              // shape of the whole move is the invitation.
              const t = (st.clock - st.phaseStart) / 1.9
              bowTarget = t < 0.28 ? t / 0.28 : t < 0.76 ? 1 : Math.max(0, 1 - (t - 0.76) / 0.24)
              if (st.clock - st.phaseStart >= 1.9) {
                st.phase = 'nm-escape'
                st.phaseStart = st.clock
                // He breaks away first and looks round after: a dog who checks
                // over his shoulder before he has moved is not breaking away.
                st.escapeNextLookAt = st.clock + 1.2
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

    // A look-back is an EVENT, which means his head has to come back.
    //
    // Measured across the whole 13 s lookbacks take, `look` never dropped below
    // 0.122 and sat at or above 0.9 on four frames in five: the node's own
    // look-back, the catch-up surge that fires whenever the boy is inside
    // CATCH_DIST, and the parked-at-the-clamp glance were overlapping into one
    // continuous stare. A head welded backwards has no variants, however many
    // ways it got there -- there is no event for them to be variants of.
    //
    // So every look-back is followed by a refractory in which the head returns
    // to neutral and stays there. The whistle answer below is deliberately
    // exempt: an answer the player asked for must always reach the head.
    if (lookTarget >= 0.9 && st.prevLookTarget < 0.9) st.lookRefractoryUntil = 0
    if (st.prevLookTarget >= 0.9 && lookTarget < 0.9)
      st.lookRefractoryUntil = st.clock + LOOK_REFRACTORY
    st.prevLookTarget = lookTarget
    if (st.clock < st.lookRefractoryUntil) lookTarget = 0

    // whistle answer steals the head, never the route
    if (bouncing) {
      lookTarget = st.bounceKind === 'subtle' ? Math.max(lookTarget, 0.35) : 1
    }

    // The verge offset is a QUANTITY he walks on and off, never a position he
    // is placed at.
    //
    // Applying it inside the hazard-wait and letting the next node read
    // route.pointAt() meant advance() snapped him back onto the line: measured,
    // 0.95 m in one frame at the ford, 44 px sideways on a dog 34 px tall, in
    // the open, with a pose change on the same frame. game-design.md is
    // unambiguous -- "he only teleports while fully occluded, never on screen"
    // -- and that was my own beside-the-route fix creating the thing it was
    // meant to prevent. So the offset eases toward whatever the current node
    // wants at a walking rate, and stepping off the verge is a step.
    if (asideTarget !== 0 && st.asideSide === 0) {
      st.asideSide = asideDir(route, st.s, asideTarget, _aside)
    }
    const asideWant = asideTarget * st.asideSide
    st.aside += THREE.MathUtils.clamp(asideWant - st.aside, -ASIDE_RATE * dt, ASIDE_RATE * dt)
    if (Math.abs(st.aside) < 1e-4) {
      st.aside = 0
      st.asideSide = 0
    }
    // The weave eases in and out at node boundaries rather than switching.
    //
    // Applied raw it stepped the lateral position by up to 0.75 m in a single
    // frame every time he entered or left a trot -- measured as 498 mm of paw
    // slide and 513 mm of reach error in the lookbacks take, which is the same
    // class of fault as the on-screen teleport this iteration set out to fix,
    // and the gait instrument caught it within one recording of it landing.
    st.weaveMix += THREE.MathUtils.clamp(weave - st.weaveMix, -WEAVE_EASE * dt, WEAVE_EASE * dt)
    const lateral =
      st.aside + Math.sin(st.s / WEAVE_LEN) * WEAVE_AMP * st.weaveMix
    if (Math.abs(lateral) > 1e-4) {
      route.directionAt(st.s, _asideDir)
      _aside.set(_asideDir.z, 0, -_asideDir.x)
      if (_aside.lengthSq() > 1e-6) {
        _aside.normalize()
        _pos.x += _aside.x * lateral
        _pos.z += _aside.z * lateral
      }
    }

    // Ground snap onto the ART surface where there is one, so he wades the ford
    // instead of standing on the water the way the grey box let him.
    const ag = artGround(_pos.x, _pos.z)
    const gs = ag === null ? sampleGround(_pos.x, _pos.z, _pos.y + 0.75) : null
    const groundY = ag !== null ? ag : gs && gs.walkable ? gs.y : _pos.y
    st.pos.set(_pos.x, groundY, _pos.z)

    st.heading = angleLerp(st.heading, desiredHeading, 1 - Math.exp(-turnRate * dt))
    st.look += (lookTarget - st.look) * Math.min(1, dt * (lookTarget > st.look ? 10 : 3.5))
    st.sit += (sitTarget - st.sit) * Math.min(1, dt * 4)
    st.bow += (bowTarget - st.bow) * Math.min(1, dt * 9)
    st.headPitch += (headPitchTarget - st.headPitch) * Math.min(1, dt * 6)
    if (moveV <= 0.001) st.cmdSpeed = Math.max(0, st.cmdSpeed - DECEL * dt)
    st.animSpeed += (moveV - st.animSpeed) * Math.min(1, dt * 9)
    st.bodyYaw += (bodyYawTarget - st.bodyYaw) * (1 - Math.exp(-9 * dt))

    // publish shared state
    world.dog.pos.copy(st.pos)
    world.dog.heading = st.heading
    world.dog.activity = activity
    world.dog.nodeIndex = st.nodeIndex
    world.dog.s = st.s
    world.dog.lookAtPlayer = st.look
    // ---- the rig ------------------------------------------------------------
    // The look-back variants swing his hindquarters round under the turn, so
    // the body's heading is not the route's heading. The footfall plan has to
    // use the body's: planning against the route while the hips are twenty
    // degrees off it puts every plant off the line the legs actually reach
    // along, and that showed up as one diagonal pair sliding and the other not.
    const heading = st.heading + st.bodyYaw
    const groundFn = (x: number, z: number, fromY: number) => {
      const a = artGround(x, z)
      if (a !== null) return a
      const g = sampleGround(x, z, fromY)
      return g && g.walkable ? g.y : fromY
    }

    const frozen = activity === 'stare' // exit hold: rigid, tail still, head fixed
    const sitting = st.sit > 0.02 || st.bow > 0.02

    // The bark-bounce: two quick hops off the front, which is what a dog
    // actually does when he answers. It is cosmetic and never touches the route.
    let hop = 0
    let bounceReach = 0
    if (bouncing && st.bounceKind === 'full') {
      const bt = (st.clock - st.bounceStart) / 0.7
      hop = Math.abs(Math.sin(bt * Math.PI * 2)) * 0.11
      bounceReach = Math.sin(bt * Math.PI * 2) * 0.16
    }

    // --- footfalls -----------------------------------------------------------
    // The planner only runs while he is actually covering ground. Standing,
    // sitting and the held beats keep the feet exactly where they were put,
    // which is the whole reason a sitting dog does not shuffle.
    const yawRate = wrapAngle(heading - st.lastHeading) / Math.max(dt, 1e-4)
    st.lastHeading = heading
    gait.update(
      dt,
      frozen || sitting ? 0 : st.animSpeed,
      st.pos,
      heading,
      groundFn,
      yawRate,
      // Sitting, bowing and the rigid stare all OVERRIDE the leg solve, so the
      // planner is told to hold rather than to plan for feet it does not own.
      frozen || sitting,
    )
    if (!sitting && !frozen) {
      // The FORE feet only. A trotting dog direct-registers: the hind foot lands
      // in the print the fore foot just made, so a trot track is two visible
      // prints per stride cycle, not four.
      //
      // Laying all four put 212 prints down in 15.8 s at a 26.9 cm median gap,
      // which renders as an unbroken serrated ribbon running the full depth of
      // frame -- a drawn route line. Tracking IS the navigation system here, but
      // a solid dotted line laid on the ground is waypoint grammar, and
      // quality-bar.md bans that outright. Registering them halves the count and
      // is what the animal actually does.
      for (let i = 0; i < gait.feet.length; i++) {
        const f = gait.feet[i]
        if (f.justPlanted && DOG_LEGS[i][0] === 'f')
          pushPrint('dog', f.pos.x, f.pos.y, f.pos.z, f.heading)
      }
    }

    const g2 = holder.current
    if (!g2) return
    g2.visible = world.dog.visible

    if (collarMat?.uniforms.uMinScreenPx) {
      const cam = state.camera as THREE.PerspectiveCamera
      const perPx = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(state.size.height, 1)
      const dogPx = 0.74 / Math.max(st.pos.distanceTo(cam.position), 0.01) / perPx
      collarMat.uniforms.uMinScreenPx.value = Math.min(
        COLLAR_FLOOR_PX,
        dogPx * COLLAR_MAX_FRAC * 0.5,
      )
      collarMat.uniforms.uMinScreenWidthPx.value = Math.min(
        COLLAR_STROKE_PX,
        dogPx * COLLAR_MAX_FRAC,
      )
    }

    // The body rides the planted feet, so a trot over broken ground rises and
    // falls with what he is standing on rather than with a terrain sample.
    let ceiling = -Infinity
    for (const f of gait.feet) if (f.planted) ceiling = Math.max(ceiling, f.pos.y)
    if (ceiling === -Infinity) ceiling = st.pos.y
    // Same as the boy: the chest drops as the stride opens and comes back up as
    // the diagonal passes under him, twice a cycle. That is what a trot is.
    // Used directly, not smoothed. The solve is already a smooth function of the
    // gait phase, and low-passing it at 26/s put the body up to 15 mm away from
    // the height the legs had just been solved for — which is a paw hanging
    // 15 mm off the ground for the last fifth of every stance, on every foot.
    st.meshY = gait.supportHeight(st.pos, heading, hipY, legReach, pawLift, ceiling)

    st.breath += dt
    const speedN = THREE.MathUtils.clamp(st.animSpeed / 2.2, 0, 1)
    // No authored bob. The chest already rises and falls because
    // `supportHeight` drops it as each diagonal's stride opens and lets it back
    // up as the pair passes underneath — that IS the trot's bounce, at the
    // amplitude his own legs imply. An 18 mm sine ON TOP of it was pure error:
    // the legs were solved for one body height and then the body was moved to
    // another, and the paws came off the ground by exactly that much.
    const breathe = frozen || speedN > 0.05 ? 0 : Math.sin(st.breath * 2.1) * 0.006

    g2.position.set(st.pos.x, st.meshY + hop, st.pos.z)
    g2.rotation.y = heading

    const body = rig.joints.body
    body.position.set(
      bodyRest.pos.x,
      bodyRest.pos.y - st.sit * SIT.drop - st.bow * BOW.drop + breathe,
      bodyRest.pos.z,
    )
    // The weight shift of a dog standing and waiting: his mass moves across his
    // feet, which is a body roll and a small lateral offset, not a step.
    const swayT = st.clock * 0.85
    const sway = holdSway * 0.055
    body.position.x += Math.sin(swayT) * sway
    body.position.z += Math.sin(swayT * 0.72 + 1.9) * sway * 0.7
    body.rotation.set(
      bodyRest.rot.x + st.sit * SIT.bodyPitch + st.bow * BOW.bodyPitch + bounceReach * 0.5,
      0,
      (frozen ? 0 : Math.sin(gait.phase * Math.PI * 2) * 0.035 * speedN) +
        Math.sin(swayT) * holdSway * 0.06,
    )
    rig.group.updateMatrixWorld(true)

    // --- legs ----------------------------------------------------------------
    _fwdWorld.set(Math.sin(heading), 0, Math.cos(heading))
    for (let i = 0; i < DOG_LEGS.length; i++) {
      const leg = DOG_LEGS[i]
      const f = gait.feet[i]
      _foot.set(f.pos.x, f.pos.y + pawLift[i], f.pos.z)
      // A hop takes the whole animal off the ground, so the legs tuck under him
      // rather than stretching down after feet that are no longer load-bearing.
      if (hop > 0) _foot.y += hop * 0.8
      if (i === 0 && lbPawLift > 0) _foot.y += lbPawLift
      solveChain(chains[i], _foot, _fwdWorld)
      // The paw keeps the orientation it has at rest, turned by his heading, so
      // a foot is flat on the ground at every point of the stride instead of
      // taking whatever angle the leg above it happens to end at.
      const P = rig.joints[leg + 'P']
      _q.setFromAxisAngle(AXIS_Y, heading).multiply(restP[i])
      setWorldQuaternion(P, _q)

      // Sitting and bowing override the solve rather than blending against it:
      // a folded hock is not a stretched one part of the way back.
      for (const [amount, pose, pitch] of [
        [st.sit, SIT, SIT.bodyPitch],
        [st.bow, BOW, BOW.bodyPitch],
      ] as const) {
        if (amount <= 0.001) continue
        const front = leg[0] === 'f'
        const set = front ? pose.front : pose.rear
        const names = [leg + 'U', leg + 'L', leg + 'P']
        for (let k = 0; k < 3; k++) {
          const j = rig.joints[names[k]]
          const r = rig.rest[names[k]]
          // the legs that are NOT carrying the pitch take it back out of
          // themselves, so a sitting dog's forelegs stay vertical and a bowing
          // dog's hind legs stay standing
          const carries = pose === SIT ? !front : front
          const extra = !carries && k === 0 ? -amount * pitch : 0
          _sitQ.setFromAxisAngle(AXIS_X, r.x + set[k] + extra)
          j.quaternion.slerp(_sitQ, amount)
        }
      }
    }

    // --- neck and head -------------------------------------------------------
    // A look-back bends the NECK first; the head only finishes the turn. D27:
    // a head yawed a hundred degrees on a neck still pointing down the canyon
    // puts the muzzle out sideways from the skull like a spur.
    const rel = THREE.MathUtils.clamp(wrapAngle(toPlayerYaw - heading), -2.1, 2.1)
    const neck = rig.joints.neck
    const head = rig.joints.head
    neck.rotation.set(
      rig.rest.neck.x + st.sit * -0.16 + st.bow * BOW.neckLift + st.headPitch * 0.45,
      rig.rest.neck.y + rel * st.look * neckShare,
      0,
    )
    head.rotation.set(
      rig.rest.head.x +
        st.bow * BOW.headLift +
        st.headPitch * (1 - st.look) +
        lbPitch * st.look -
        bounceReach * 0.8,
      rig.rest.head.y + rel * st.look * (1 - neckShare),
      0,
    )

    // --- the tail ------------------------------------------------------------
    // Tail language, at trot and at wait, is a Gate 3 must-confirm. It is a
    // CHAIN: the sweep starts at the croup and arrives at the tip a beat later,
    // which is the difference between a tail and a stick being waved.
    let rate: number
    let amp: number
    let lift: number
    if (frozen) {
      rate = 0
      amp = 0
      lift = 0.15 // held out level and still: the stare before the bolt
    } else if (sitting) {
      // WIDE and slow, against the trot's narrow and fast. The two used to
      // arrive at exactly 0.42 rad from opposite directions -- the sit's
      // constant and the trot's 0.3 + speedN * 0.12 at full speed -- which is a
      // coincidence, not a design, and it left rate as the only thing telling
      // them apart. At the sizes this chapter stages him a difference that
      // exists only in frequency is a difference nobody sees.
      rate = 2.4
      amp = 0.66
      lift = -0.55
    } else if (activity === 'near-miss-hold') {
      rate = st.phase === 'nm-beat' ? 14 : 8 // high and fast: this is play
      amp = st.phase === 'nm-beat' ? 0.65 : 0.42
      lift = 0.22 + st.bow * 0.5 // the bow carries it right up
    } else if (st.animSpeed > 0.4) {
      rate = 8.5 + speedN * 3
      amp = 0.3 + speedN * 0.12
      lift = 0.1
    } else {
      rate = 4.2
      amp = 0.26
      lift = 0
    }
    if (lbTailRate > 0) {
      rate = lbTailRate
      amp = lbTailAmp
      lift = 0.18
    }
    if (bouncing && st.bounceKind === 'full') {
      rate = 16
      amp = 0.52
      lift = 0.25
    }
    st.tailRate += (rate - st.tailRate) * (1 - Math.exp(-8 * dt))
    st.tailAmp += (amp - st.tailAmp) * (1 - Math.exp(-6 * dt))
    st.tailPhase += dt * st.tailRate
    for (let i = 0; i < 3; i++) {
      const j = rig.joints['tail' + (i + 1)]
      const r = rig.rest['tail' + (i + 1)]
      // each segment lags the one before it: that lag IS the whip
      const sweep = Math.sin(st.tailPhase - i * 0.55) * st.tailAmp * (0.45 + i * 0.32)
      const drop = st.sit * SIT.tail[i]
      j.rotation.set(r.x + drop - (i === 0 ? lift : lift * 0.4), r.y + sweep, r.z)
    }

    rig.group.updateMatrixWorld(true)
    recFrame.dogPaws = gait.feet.map((f, i) => {
      _foot.setFromMatrixPosition(rig.joints[DOG_LEGS[i] + 'P'].matrixWorld)
      return {
        at: [+f.pos.x.toFixed(4), +f.pos.y.toFixed(4), +f.pos.z.toFixed(4)],
        plant: f.planted ? 1 : 0,
        leg: DOG_LEGS[i],
        // The rendered paw, so a leg that could not reach its plant shows up as
        // a slide rather than as a number nobody looked at.
        sole: [+_foot.x.toFixed(4), +(_foot.y - pawLift[i]).toFixed(4), +_foot.z.toFixed(4)],
      }
    })
    recFrame.dogHeld = frozen || sitting ? 1 : 0
    recFrame.dogAnim = {
      sit: +st.sit.toFixed(3),
      look: +st.look.toFixed(3),
      tailAmp: +st.tailAmp.toFixed(3),
      tailRate: +st.tailRate.toFixed(2),
      // The trot schedules look-backs of its own, and they are the ones most of
      // the game is made of; reporting only the node's leaves the reel looking
      // as though he never looked back at all.
      lbVariant:
        activity === 'look-back'
          ? st.lbVariant
          : st.clock < st.lookBackUntil
            ? st.lookBackVariant
            : -1,
      bow: +st.bow.toFixed(3),
      speed: +st.animSpeed.toFixed(3),
      gaitPhase: +gait.phase.toFixed(4),
    }
  })

  return (
    <group ref={holder}>
      <primitive object={rig.group} />
    </group>
  )
}
