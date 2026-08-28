import * as THREE from 'three'
import { advance } from '@react-three/fiber'
import { beginRecording, tickVirtualClock } from './clock'
import { world } from './world'
import { setJoystick, requestWhistle } from './input'
import { perfStats } from '../components/PerfHud'
import { drainPrintLog } from './trail'

// The recording harness's console hook.
//
// Gate 3 is judged from a recording, and a recording is only evidence if two
// iterations of the critic loop can be compared frame for frame. So the record
// path takes the frameloop away from the browser entirely: `tools/record.mjs`
// steps a fixed timestep, drives a scripted input timeline, and screenshots
// every frame. Same seed, same script, same pixels.
//
// `?rec=` is dev-only, exactly like `?dev`. Nothing here is reachable in play.

const _p = new THREE.Vector3()

export interface RecProbe {
  t: number
  player: { pos: number[]; heading: number; speed: number; progress: number }
  dog: { pos: number[]; heading: number; activity: string; node: number; look: number }
  whistle: { lastAt: number; pendingAt: number; answerSeq: number }
  perf: { drawCalls: number; triangles: number }
  /** The dog in SCREEN space: x, y, and his projected height in pixels. */
  dogScreen: [number, number, number]
  /** 1 on a frame where the harness teleported somebody. Not a game frame. */
  staged?: number
  /** 1 while a pose overrides the dog's legs, so the plan does not own them. */
  dogHeld?: number
  /** Prints laid down since the last probe. */
  printsLaid?: { kind: string; x: number; y: number; z: number; heading: number }[]
  /** Filled by the character rigs; see src/art/rig.ts. */
  boyFeet?: {
    L: number[]
    R: number[]
    plantL: number
    plantR: number
    /** Where the MESH's sole actually is, which is what can slide. */
    soleL: number[]
    soleR: number[]
  }
  dogPaws?: { at: number[]; plant: number; leg: string; sole: number[] }[]
  /**
   * The height the boy is SEEN standing at (what the camera frames on), the
   * settle dip subtracted from it, and how many feet are planted. A jump here
   * with the boy at rest is a camera jolt, and there was an 8 px one inside the
   * settle beat.
   */
  boyY?: { support: number; dip: number; planted: number }
  /**
   * The boy's hands, in his own frame: how far each sits across his body axis
   * and how far fore-aft. The camera in this game sits directly behind him, so
   * `across` is the part of an arm swing a player can actually see, and the
   * fore-aft part is nearly all depth.
   */
  boyArms?: { acrossL: number; acrossR: number; aheadL: number; aheadR: number }
  dogAnim?: {
    sit: number
    look: number
    tailAmp: number
    tailRate: number
    lbVariant: number
    bow: number
    speed: number
    gaitPhase: number
  }
  /**
   * The whistle answer's visual correlate, measured rather than asserted: how
   * many birds are up, the widest one's on-screen span in pixels, and the
   * material opacity. The must-confirm is that the answer is legible with sound
   * off, and a bird that is two pixels wide at 0.1 opacity is not.
   */
  cue?: { birds: number; puffs: number; maxPx: number; opacity: number }
  prints?: { kind: string; at: number[]; side: number; t: number }[]
  lookBack?: { variant: number; t: number }
}

/** Systems push their per-frame measurements here; the probe reads them out. */
export const recFrame: Partial<RecProbe> = {}

/**
 * The harness's autopilot. It is not an AI and it is not a system the game
 * ships: it is the recording script holding the stick, so a take can be
 * repeated exactly. `route` walks the boy along the dog's route the way a
 * player following the trail would; `dog` steers straight at him; `stop`
 * releases the stick so the deceleration and the settle can be watched.
 */
type Steer = 'stop' | 'route' | 'dog'

const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _target = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Where the dog is on screen, and how big. The critic loop reads a contact
 * sheet, and a dog twenty pixels tall in a 1280 px frame cannot be judged from
 * one — so the harness crops a second sheet around him, and this is what tells
 * it where to crop.
 */
const _sp = new THREE.Vector3()
function dogOnScreen(): [number, number, number] {
  const cam = (window as unknown as { __cam?: THREE.PerspectiveCamera }).__cam
  if (!cam) return [0, 0, 0]
  const w = window.innerWidth
  const h = window.innerHeight
  _sp.copy(world.dog.pos).project(cam)
  const x = ((_sp.x + 1) / 2) * w
  const y = ((1 - _sp.y) / 2) * h
  _sp.copy(world.dog.pos)
  _sp.y += 0.74
  _sp.project(cam)
  const top = ((1 - _sp.y) / 2) * h
  return [Math.round(x), Math.round(y), Math.max(1, Math.round(y - top))]
}

export function installRecorder(seed: number): void {
  beginRecording(seed)
  let elapsed = 0
  let steer: Steer = 'stop'
  let lookahead = 4

  const driveStick = () => {
    if (steer === 'stop') {
      setJoystick(false)
      return
    }
    const cam = (window as unknown as { __cam?: THREE.Camera }).__cam
    const route = world.route
    if (!cam || !route) return
    if (steer === 'dog') _target.copy(world.dog.pos)
    else route.pointAt(Math.min(route.total, world.player.progress + lookahead), _target)
    _dir.subVectors(_target, world.player.pos)
    _dir.y = 0
    if (_dir.lengthSq() < 1e-6) return
    _dir.normalize()
    cam.getWorldDirection(_fwd)
    _fwd.y = 0
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1)
    _fwd.normalize()
    _right.crossVectors(_fwd, UP)
    setJoystick(true, _dir.dot(_right), _dir.dot(_fwd))
  }

  const api = {
    ready: () => world.ready,

    /** Advance the simulation by `ms` and render exactly one frame. */
    step(ms: number) {
      driveStick()
      elapsed = tickVirtualClock(ms)
      advance(elapsed / 1000)
    },

    /**
     * One captured frame: `n` simulation substeps of `ms`, then the probe.
     * The harness screenshots after this returns. Substeps exist so the gait
     * and the damping are always integrated at 60 Hz whatever the capture rate
     * is — stepping them at the video's frame rate would measure the harness.
     */
    frame(n: number, ms: number): RecProbe {
      for (let i = 0; i < n; i++) api.step(ms)
      return api.probe()
    },

    /** Hold the stick toward the route, toward the dog, or not at all. */
    steer(mode: Steer, ahead = 4) {
      steer = mode
      lookahead = ahead
      if (mode === 'stop') setJoystick(false)
    },

    /** Scripted walk intent, in camera-relative units, exactly as a stick would. */
    move(x: number, z: number) {
      setJoystick(x !== 0 || z !== 0, x, z)
    },

    whistle() {
      requestWhistle()
    },

    /** Put the boy at arc length `s` along the dog's route. */
    placeAt(s: number) {
      world.player.teleportTo = s
    },

    /** Put the boy `offset` metres from where route node `n` begins. */
    placeAtNode(n: number, offset: number) {
      const r = world.route
      if (!r) return
      const s = r.nodes[Math.max(0, Math.min(n, r.nodes.length - 1))].s0
      world.player.teleportTo = Math.max(0, Math.min(r.total, s + offset))
    },

    /**
     * Jump the dog actor to a route node, so a beat can be staged directly.
     * `offset` moves him that many metres further along the route from the
     * node's start, which is how a take opens with him already at reading size
     * instead of thirty metres up the canyon.
     */
    dogTo(n: number, offset = 0) {
      world.dog.devSkipToNode = n
      world.dog.devSkipOffset = offset
    },

    /** Turn the manifest's framed moments off for a take. */
    framed(on: boolean) {
      world.framedCameras = on
    },

    /** Arc length of the first node of a given index, for scripting. */
    nodeS(n: number): number {
      const r = world.route
      if (!r) return 0
      return r.nodes[Math.max(0, Math.min(n, r.nodes.length - 1))].s0
    },

    routeTotal: () => world.route?.total ?? 0,

    probe(): RecProbe {
      const d = world.dog
      const p = world.player
      _p.copy(p.pos)
      return {
        t: elapsed / 1000,
        player: {
          pos: [+p.pos.x.toFixed(4), +p.pos.y.toFixed(4), +p.pos.z.toFixed(4)],
          heading: +p.heading.toFixed(4),
          speed: +p.speed.toFixed(4),
          progress: +p.progress.toFixed(3),
        },
        dog: {
          pos: [+d.pos.x.toFixed(4), +d.pos.y.toFixed(4), +d.pos.z.toFixed(4)],
          heading: +d.heading.toFixed(4),
          activity: d.activity,
          node: d.nodeIndex,
          look: +d.lookAtPlayer.toFixed(3),
        },
        whistle: {
          lastAt: world.whistle.lastAt,
          pendingAt: world.whistle.pendingAnswerAt,
          answerSeq: world.whistle.answerSeq,
        },
        perf: { drawCalls: perfStats.drawCalls, triangles: perfStats.triangles },
        dogScreen: dogOnScreen(),
        printsLaid: drainPrintLog(),
        ...recFrame,
      }
    },
  }

  ;(window as unknown as Record<string, unknown>).__rec = api
}
