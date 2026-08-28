import * as THREE from 'three'

// Footfall planning and leg IK.
//
// Gate 3 asks for a boy who has weight, whose stopping settles, and whose feet
// do not slide; and for pawprints that match the dog's gait. None of those is a
// tuning problem. They all follow from one decision: a foot is not a limb angle
// that happens to end up near the ground, it is a WORLD POSITION that is put
// down, held while the body passes over it, and picked up again. Swinging a
// rigid leg about the hip drags the contact point along the floor by whatever
// the arc happens to be; planting the contact point and solving the leg to
// reach it cannot slide, because there is nothing left to slide.
//
// It also makes the prints exact. A print is spawned by a plant event, at the
// foot's own world position, facing the way the foot was pointing. "Footprints
// land in step and alternate correctly" stops being something to eyeball.

const _v = new THREE.Vector3()
const _u = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _knee = new THREE.Vector3()
const DOWN = new THREE.Vector3(0, -1, 0)

export type GroundFn = (x: number, z: number, fromY: number) => number

export interface Foot {
  /** Where the sole is, in world space. */
  pos: THREE.Vector3
  /** Which way the foot points, radians. Frozen while planted. */
  heading: number
  planted: boolean
  /** Set for exactly one update when the foot goes down. */
  justPlanted: boolean
  /** 0 at plant, 1 at lift; only meaningful while planted. */
  stance: number
  from: THREE.Vector3
  to: THREE.Vector3
}

export interface GaitSpec {
  /** Phase offset per foot, 0..1. Two feet at 0/0.5 walk; four at 0/0.5/0.5/0 trot. */
  phases: number[]
  /** Hip position in body-local space: [x, z]. */
  hips: [number, number][]
  /** Metres of travel per full cycle at `nominal` speed. */
  strideLen: number
  /** The pace `strideLen` was measured for. Shorter strides below it. */
  nominal: number
  /** Fraction of the cycle a foot spends on the ground. */
  duty: number
  /** Peak height of the swing arc, metres. */
  lift: number
  /** How far the sole sits below its ankle/pastern joint when level. */
  ankleLift: number
  /** The furthest the body may fall below full leg extension, metres. */
  maxDip?: number
  /** Lateral spread of the plant point relative to the hip, metres. */
  track?: number
}

/**
 * The footfall planner. It owns nothing but the feet: where each one is, and
 * whether it is currently carrying weight.
 */
export class Gait {
  readonly feet: Foot[]
  /** 0..1, advanced by DISTANCE travelled rather than by time. */
  phase = 0
  /**
   * The stride this cycle is being walked at. It is re-chosen once per cycle
   * and then HELD, which is the whole trick: the phase advances by distance, so
   * a frozen stride means the body covers exactly `duty * stride` while a foot
   * is down, and the plant can be placed to match. Re-deriving it from the
   * current speed every frame is what dragged the paws 200 mm through the
   * ground during the dog's acceleration out of a wait — the plant had been
   * placed for 0.15 m/s and the stance was then walked at 2.0.
   */
  stride = 0
  private started = false
  private stillFor = 0
  private closing = false

  constructor(readonly spec: GaitSpec) {
    this.feet = spec.phases.map(() => ({
      pos: new THREE.Vector3(),
      heading: 0,
      planted: true,
      justPlanted: false,
      stance: 0,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
    }))
  }

  private hipWorld(i: number, root: THREE.Vector3, heading: number, out: THREE.Vector3) {
    const [hx, hz] = this.spec.hips[i]
    const s = Math.sin(heading)
    const c = Math.cos(heading)
    return out.set(root.x + hx * c + hz * s, root.y, root.z - hx * s + hz * c)
  }

  /**
   * Stage the plan from scratch: a teleport, a spawn, or a walker starting
   * again after standing still.
   *
   * Each foot is placed where its own phase says it should be, not all four
   * under their hips. Planting them all together left the two feet that ought
   * to be mid-swing carrying weight in the wrong place, and the two in stance
   * half a stance-length behind where they belonged — measured, 100 mm of paw
   * error that took most of a second to walk off every time the dog started.
   */
  reset(root: THREE.Vector3, heading: number, ground: GroundFn) {
    this.started = true
    this.phase = 0
    this.stride = this.spec.strideLen
    this.closing = false
    const { duty, phases, lift } = this.spec
    const stride = this.stride
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    for (let i = 0; i < this.feet.length; i++) {
      const f = this.feet[i]
      const p = phases[i] % 1
      this.hipWorld(i, root, heading, _v)
      f.heading = heading
      f.justPlanted = false
      if (p < duty) {
        // in stance: from +duty*stride/2 ahead of the hip down to -that
        const along = stride * (duty * 0.5 - p)
        f.pos.set(_v.x + fx * along, 0, _v.z + fz * along)
        f.pos.y = ground(f.pos.x, f.pos.z, _v.y + 1)
        f.from.copy(f.pos)
        f.to.copy(f.pos)
        f.planted = true
        f.stance = p / duty
      } else {
        const t = (p - duty) / (1 - duty)
        const behind = (p - duty) * stride
        f.from.set(_v.x - fx * (behind + stride * duty * 0.5), 0, _v.z - fz * (behind + stride * duty * 0.5))
        f.from.y = ground(f.from.x, f.from.z, _v.y + 1)
        const ahead = stride * (1 - duty * 0.5) - behind
        f.to.set(_v.x + fx * ahead, 0, _v.z + fz * ahead)
        f.to.y = ground(f.to.x, f.to.z, _v.y + 1)
        const e = t * t * (3 - 2 * t)
        f.pos.lerpVectors(f.from, f.to, e)
        f.pos.y += lift * Math.sin(Math.PI * t)
        f.planted = false
        f.stance = 0
      }
    }
  }

  /**
   * Advance the plan. `speed` is horizontal ground speed in m/s.
   *
   * When the walker stops, the phase keeps turning at a floor rate until every
   * foot is down: a character who freezes mid-swing has one leg hanging in the
   * air, which is the single loudest way to say "this is a puppet". Once they
   * are all down the phase holds, and the settle is the body's business.
   */
  update(
    dt: number,
    speed: number,
    root: THREE.Vector3,
    heading: number,
    ground: GroundFn,
    /** Radians per second the body is turning, so a plant can anticipate it. */
    yawRate = 0,
    /**
     * Freeze the plan entirely. For a pose that OVERRIDES the legs — a sit, a
     * play-bow, the rigid stare — where the planner has no business having an
     * opinion about where the feet are. Without it a sitting dog's feet were
     * being stepped in place by the catch-up logic below: measured, 59 footfall
     * clusters across a hazard-wait with a same-foot stride of 0 cm, which is a
     * dog shuffling on his haunches.
     */
    hold = false,
  ): void {
    if (!this.started) this.reset(root, heading, ground)
    for (const f of this.feet) f.justPlanted = false
    if (hold) {
      this.stillFor = 0
      this.closing = false
      return
    }

    // Standing still leaves the feet wherever they were last put, and the body
    // may have turned or been staged elsewhere meanwhile. Setting off again
    // re-stages the plan rather than dragging the old one into motion.
    if (speed < 0.12) {
      this.stillFor += dt
    } else {
      if (this.stillFor > 0.25) this.restage(root, heading)
      this.stillFor = 0
    }
    const { phases, duty, lift } = this.spec
    // Stride grows with pace: a walker starting from rest takes short steps.
    // Chosen once a cycle and held — see `stride`.
    const wanted =
      this.spec.strideLen *
      THREE.MathUtils.clamp(speed / this.spec.nominal, 0.42, 1.05)
    if (this.stride <= 0) this.stride = wanted

    // 0.3, not 0.12. A dog stopping to look back over his shoulder is capped
    // at 0.15 m/s, which counted as "moving" and advanced the phase at four
    // seconds a cycle — so his feet stayed where they were planted while his
    // hindquarters swung twenty degrees round under him, and his legs simply
    // could not reach: measured at 104 mm of median reach error through the
    // look-back take. A crawl is not walking; it is standing and shuffling.
    const moving = speed > 0.3
    const anyAirborne = this.feet.some((f) => !f.planted)

    // A foot left further behind its hip than the leg can follow has to step,
    // whatever the body thinks it is doing.
    const maxExcursion = duty * this.stride * 0.5 + 0.09
    let overreached = false
    for (let i = 0; i < this.feet.length; i++) {
      if (!this.feet[i].planted) continue
      this.hipWorld(i, root, heading, _v)
      if (Math.hypot(_v.x - this.feet[i].pos.x, _v.z - this.feet[i].pos.z) > maxExcursion) {
        overreached = true
        break
      }
    }

    // Coming to rest is not freezing. A walker stopped mid-stride stands with
    // his feet half a stride apart and one leg at full stretch — which is both
    // a bad pose and, measured, a third of his standing time with a foot he
    // cannot quite reach. So when the stick is released he takes one more step
    // to bring the trailing foot up beside the other, and THEN holds.
    if (!moving) {
      if (overreached) this.closing = true
      if (!this.closing) {
        for (let i = 0; i < this.feet.length; i++) {
          this.hipWorld(i, root, heading, _v)
          if (Math.hypot(_v.x - this.feet[i].pos.x, _v.z - this.feet[i].pos.z) > 0.1) {
            this.closing = true
            break
          }
        }
      }
    } else {
      this.closing = false
    }
    if (this.closing && !anyAirborne) {
      let far = false
      for (let i = 0; i < this.feet.length; i++) {
        this.hipWorld(i, root, heading, _v)
        if (Math.hypot(_v.x - this.feet[i].pos.x, _v.z - this.feet[i].pos.z) > 0.1) far = true
      }
      if (!far) this.closing = false
    }

    // finishing a step you have already started, at the pace you started it
    const advanceSpeed = moving
      ? speed
      : anyAirborne || this.closing
        ? Math.max(0.55, speed)
        : 0
    if (advanceSpeed > 0) {
      const next = this.phase + (advanceSpeed * dt) / this.stride
      // a new cycle is where a new stride length is allowed to take effect
      if (next >= 1) this.stride = wanted
      this.phase = next % 1
    }
    const strideLen = this.stride
    // How long a foot is in the air, which is what a plant has to look ahead by.
    const swingTime = ((1 - duty) * strideLen) / Math.max(speed, 0.45)

    for (let i = 0; i < this.feet.length; i++) {
      const f = this.feet[i]
      const p = (this.phase + phases[i]) % 1
      const stance = p < duty

      if (stance && !f.planted) {
        // touchdown: the plan becomes a fact
        f.planted = true
        f.justPlanted = true
        f.pos.copy(f.to)
        f.pos.y = ground(f.pos.x, f.pos.z, f.pos.y + 0.6)
      } else if (!stance && f.planted) {
        // lift-off: choose where this foot is going and commit to it
        f.planted = false
        f.from.copy(f.pos)
        this.hipWorld(i, root, heading, _v)
        // Where to put it down.
        //
        // The phase advances by DISTANCE, so the hip covers exactly
        // (1 - duty) * stride while this foot is in the air, whatever the speed
        // does meanwhile. Land it half a stance-length ahead of where the hip
        // will be then, and the foot spends the stance travelling from
        // +duty*stride/2 to -duty*stride/2 relative to the hip — which is the
        // excursion the leg length was chosen against. No speed term is needed
        // and putting one in only makes it wrong.
        // A closing step puts the foot straight under the hip: he is stopping,
        // not stepping out.
        const reach = this.closing && !moving ? 0 : strideLen * (1 - duty * 0.5)
        const track = this.spec.track ?? 0
        const side = this.spec.hips[i][0] >= 0 ? 1 : -1
        // Put it down where the body will be POINTING when it lands, not where
        // it points now. Through a bend the two differ by most of a paw width,
        // and the difference is a foot planted off the line of travel that the
        // hip then has to drag round.
        const land = heading + yawRate * swingTime * 0.55
        f.to.set(
          _v.x + Math.sin(land) * reach + Math.cos(land) * track * side,
          0,
          _v.z + Math.cos(land) * reach - Math.sin(land) * track * side,
        )
        f.to.y = ground(f.to.x, f.to.z, _v.y + 1)
        f.heading = heading
      }

      if (f.planted) {
        f.stance = duty > 0 ? p / duty : 0
      } else {
        const t = (p - duty) / (1 - duty)
        const e = t * t * (3 - 2 * t) // smoothstep: no jerk at either end
        f.pos.lerpVectors(f.from, f.to, e)
        f.pos.y += lift * Math.sin(Math.PI * t)
        f.heading = heading
      }
    }
  }

  /**
   * Setting off again after standing still.
   *
   * Nothing MOVES: the feet are where the walker left them and they stay there.
   * All that changes is the phase, so that the foot furthest from under its own
   * hip is the one that takes the first step. Re-planting the feet instead
   * teleported them — measured at 480 mm in a single frame the first time he
   * started walking again, which is the exact thing this whole system exists to
   * prevent.
   */
  restage(root: THREE.Vector3, heading: number): void {
    let worst = -1
    let worstD = -1
    for (let i = 0; i < this.feet.length; i++) {
      this.hipWorld(i, root, heading, _v)
      const d = Math.hypot(_v.x - this.feet[i].pos.x, _v.z - this.feet[i].pos.z)
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst < 0) return
    this.stride = this.spec.strideLen
    this.phase = (1 + this.spec.duty - this.spec.phases[worst]) % 1
  }

  /** How far through its swing a foot is, 0..1. */
  private swingT(i: number): number {
    const p = (this.phase + this.spec.phases[i]) % 1
    return p < this.spec.duty ? 0 : (p - this.spec.duty) / (1 - this.spec.duty)
  }

  /** True while at least one foot carries weight. */
  anyPlanted(): boolean {
    return this.feet.some((f) => f.planted)
  }

  /**
   * How high the body may sit and still have every planted leg reach its foot.
   *
   * This is where the weight comes from, and it is the reason it does not have
   * to be animated: a leg at full stretch cannot also be a leg reaching
   * forward, so the hip FALLS as the stride opens and rises again as the foot
   * passes underneath. That is the bob, at exactly the amplitude the leg
   * length implies, for free, on any ground.
   *
   * Returns a world Y for the rig's origin (which restDrop has already put at
   * sole level). `hipY` and `contactLift` are per-foot measurements off the
   * rest skeleton; `reach` is the straightened bone chain.
   */
  supportHeight(
    root: THREE.Vector3,
    heading: number,
    hipY: number[],
    reach: number[],
    contactLift: number[],
    ceiling: number,
  ): number {
    let best = ceiling
    let lowest = ceiling
    for (let i = 0; i < this.feet.length; i++) {
      const f = this.feet[i]
      // A foot about to land counts too. Considering only what is already down
      // leaves the reaching leg short for the last few frames of its swing —
      // measured at 51 mm on the dog's forelegs — because the body only drops
      // to meet the foot after it has arrived. A real gait dips into the step.
      const landing = !f.planted && f.stance === 0 && this.swingT(i) > 0.78
      if (!f.planted && !landing) continue
      const target = landing ? f.to : f.pos
      if (target.y < lowest) lowest = target.y
      this.hipWorld(i, root, heading, _v)
      const horiz = Math.hypot(_v.x - target.x, _v.z - target.z)
      const r = reach[i]
      const vertical = Math.sqrt(Math.max(0, r * r - horiz * horiz))
      const allow = target.y + contactLift[i] + vertical - hipY[i]
      if (allow < best) best = allow
    }
    // The floor is measured from the LOWEST planted foot, not the highest.
    // Measured from the highest, a boy with one foot up a 27 cm step was held
    // 20 cm above what his low leg could reach, and that leg's sole hung in the
    // air behind him — 153 mm of reach error and the worst slide in the take.
    // On the flat the two are the same number and this costs nothing.
    return Math.max(best, lowest - (this.spec.maxDip ?? 0.08))
  }
}

// --- two-bone IK ------------------------------------------------------------

export interface Chain {
  /** Joint the chain hangs from. Its rotation is solved. */
  root: THREE.Object3D
  /** Second joint. Its rotation is solved. */
  mid: THREE.Object3D
  /** Bone lengths: root->mid, and mid->contact. */
  l1: number
  l2: number
  /** Direction from `mid` to the contact point in `mid`'s local frame, at rest. */
  restDir2: THREE.Vector3
  /** +1 puts the bend forward (a stifle), -1 puts it back (an elbow). */
  pole: number
}

/**
 * Aim a two-bone chain at a world-space target.
 *
 * The bend direction is a per-chain constant rather than something the solver
 * discovers, because it is anatomy: a dog's elbow points back and his stifle
 * points forward, and D27 spent an iteration on the hock being the joint that
 * separates a dog from a cat at a glance. A solver free to choose would lose it
 * on the first frame the leg went straight.
 */
export function solveChain(
  chain: Chain,
  target: THREE.Vector3,
  forward: THREE.Vector3,
): void {
  const { root, mid, l1, l2, pole } = chain
  root.updateWorldMatrix(true, false)
  const hip = _v.setFromMatrixPosition(root.matrixWorld)
  _u.subVectors(target, hip)
  const raw = _u.length()
  if (raw < 1e-5) return
  const len = THREE.MathUtils.clamp(raw, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3)
  _u.multiplyScalar(1 / raw)

  const cosA = THREE.MathUtils.clamp((l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), -1, 1)
  const a = Math.acos(cosA)

  _axis.crossVectors(forward, _u)
  if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0)
  _axis.normalize()
  const dir1 = _u.clone().applyAxisAngle(_axis, -a * pole)

  // bone 1: its geometry hangs along -Y, so aim -Y at dir1
  _q.setFromUnitVectors(DOWN, dir1)
  setWorldQuaternion(root, _q)

  _knee.copy(hip).addScaledVector(dir1, l1)
  const dir2 = _u.clone().subVectors(target, _knee)
  if (dir2.lengthSq() < 1e-8) return
  dir2.normalize()

  // bone 2 is a rigid unit whose contact sits along `restDir2` in its own frame
  root.updateWorldMatrix(false, true)
  mid.getWorldQuaternion(_q2)
  const restWorld = chain.restDir2.clone().applyQuaternion(_q2)
  _q.setFromUnitVectors(restWorld, dir2).multiply(_q2)
  setWorldQuaternion(mid, _q)
}

const _parentQ = new THREE.Quaternion()

/** Set an object's world orientation, whatever its parents are doing. */
export function setWorldQuaternion(obj: THREE.Object3D, world: THREE.Quaternion): void {
  if (obj.parent) {
    obj.parent.getWorldQuaternion(_parentQ)
    obj.quaternion.copy(_parentQ.invert().multiply(world))
  } else {
    obj.quaternion.copy(world)
  }
  obj.updateMatrix()
}
