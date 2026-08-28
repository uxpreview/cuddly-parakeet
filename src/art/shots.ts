import * as THREE from 'three'
import type { ArtTerrain } from './artTerrain'
import type { CameraDef } from '../game/types'

// The art bible's fixed viewpoints. Gate 2 is one static scene, but a static
// scene has to be judged from the places the game is actually seen from, so the
// gameplay camera's own rig parameters (18 degrees, 6.5 m, 1.0 m look height)
// are reproduced here rather than invented.

export const RIG = { pitchDeg: 18, dist: 6.5, lookHeight: 1.0, fov: 55 }

export interface Shot {
  id: string
  label: string
  position: [number, number, number]
  lookAt: [number, number, number]
  fov: number
}

export interface Stage {
  boy: { at: THREE.Vector3; heading: number }
  dog: { at: THREE.Vector3; heading: number }
  boyPrints: { at: [number, number, number]; heading: number; fade: number }[]
  dogPrints: { at: [number, number, number]; heading: number; fade: number }[]
}

/**
 * Where the two of them stand. The canyon staging is the art bible proper; the
 * rim staging exists so the manifest's own town-reveal camera can be judged
 * with its subject in it, which is what the Gate 1 critic's note about the town
 * reading only marginally actually asks for.
 */
/**
 * Staged on the river bank below the ford.
 *
 * The river on one side and the tall wall on the other is the composition this
 * chapter is built around: water, path, cliff, rim pines, sky, all in one
 * frame, with the trail running up the middle of it. The gravel bar has walls
 * both sides and no water, and the banks past the ford put the cliff four
 * metres from the camera; this is the one stretch that shows the whole canyon.
 */
export const STAGE_SAMPLES = { boy: 79, dog: 93, trailFrom: 60 }

// far enough along the switchback that the portrait crop does not slice him in
// half at the frame edge — in portrait the reveal had three red pixels
export const RIM_STAGE = { boy: 319, dog: 330, trailFrom: 306 }

/**
 * The ford. The chapter's water moment is a hazard-wait: he waits on the far
 * side while the boy is in the crossing. Submitting the river empty of both of
 * them describes the material and not the beat.
 *
 * These two stand exactly here — the ford is the one shot the light search is
 * turned off for. The whole reach is in terrain shadow, so the search has
 * nothing to find and wanders: it put the boy nine samples upstream, which is
 * two and a half metres BEHIND the camera, and the frame that is supposed to
 * show a boy in the crossing had no boy in it at all. Sample 99 is mid-channel.
 */
export const FORD_STAGE = { boy: 99, dog: 106, trailFrom: 88 }

type Ground = (x: number, z: number, fromY: number) => { y: number } | null
/**
 * How lit a place is to stand, 0 = perfect. Sun occlusion plus the ground's
 * own sky visibility: `hero` staged the boy on ground at 99% of the frame's
 * lit-floor value and the dog, in the frame named for him, at 91%, and both
 * were in full sun. The difference was contact darkening — the dog was closer
 * in under the wall — so a search that only asks about the sun cannot see it.
 */
type SunOcc = (x: number, y: number, z: number) => number

function sampleAt(art: ArtTerrain, i: number) {
  const c = art.centerline[Math.max(0, Math.min(art.centerline.length - 1, Math.round(i)))]
  return { x: c[0], y: c[1], z: c[2], h: c[3] }
}

/**
 * The centreline's heading as a three.js YAW.
 *
 * They are not the same number and the difference is a right angle. The art
 * terrain stores `h` such that the cross-section's lateral axis is
 * (sin h, -cos h) — so travel is (cos h, sin h) — while a yaw in this engine
 * means travel is (sin yaw, cos yaw). Every conversion between them is
 * `PI/2 - h`, and doing it by hand at each call site is how the dog came to be
 * staged square across the canyon for the whole of Gate 2 with a comment
 * saying his body pointed the way he was going.
 */
const routeYaw = (art: ArtTerrain, i: number) => Math.PI / 2 - sampleAt(art, i).h

function offset(art: ArtTerrain, i: number, lateral: number, ground: Ground) {
  const s = sampleAt(art, i)
  const x = s.x + Math.sin(s.h) * lateral
  const z = s.z - Math.cos(s.h) * lateral
  const g = ground(x, z, s.y + 2)
  return new THREE.Vector3(x, g ? g.y : s.y, z)
}

/**
 * Nudge an actor to the nearest spot the key light actually reaches.
 *
 * The canyon floor is about two thirds lit at this chapter's morning sun —
 * measured, not assumed — and the other third is the long shadow bands the
 * palette section wants. Standing the SUBJECT in one of them is a staging
 * accident, and it was not a small one: the dog measured fully occluded in all
 * six shots, so his coat rendered its shade value everywhere and never once
 * rendered the documented #E5D5BC. That read as a palette failure and as the
 * dog being invisible against the ground, and it was neither. It was where he
 * was put.
 *
 * The search is deliberately short and prefers standing still: a couple of
 * metres along the route and a small lateral shift, nearest first. If nothing
 * within reach is lit, the original staging stands rather than the actor being
 * teleported somewhere the shot was not composed for.
 */
/**
 * A staged spot, and how to point at another one. `headingTo` is what the hero
 * camera's yaw is built from, so it lives with the spot rather than being
 * re-derived at every call site.
 */
interface Spot {
  at: THREE.Vector3
  i: number
  lat: number
  headingTo: (other: THREE.Vector3) => number
}

const spot = (at: THREE.Vector3, i: number, lat: number): Spot => ({
  at,
  i,
  lat,
  headingTo: (other) => Math.atan2(other.x - at.x, other.z - at.z),
})

/** The hero camera, and the horizontal bearing of a world point through it. */
function rigCamera(at: THREE.Vector3, yaw: number) {
  const pitch = (RIG.pitchDeg * Math.PI) / 180
  const hd = RIG.dist * Math.cos(pitch)
  const vd = RIG.dist * Math.sin(pitch)
  const pos = new THREE.Vector3(
    at.x - Math.sin(yaw) * hd,
    at.y + RIG.lookHeight + vd,
    at.z - Math.cos(yaw) * hd,
  )
  return {
    pos,
    yaw,
    bearing: (p: THREE.Vector3) => Math.atan2(p.x - pos.x, p.z - pos.z) - yaw,
  }
}

function stageInLight(
  art: ArtTerrain,
  i: number,
  lat: number,
  ground: Ground,
  sun: SunOcc | undefined,
  eyeHeight: number,
  span: number,
  sky?: SunOcc,
  /** Extra cost for a spot, in the same units as occlusion. Staging, not light. */
  extra?: (p: THREE.Vector3) => number,
): Spot {
  const at = offset(art, i, lat, ground)
  if (!sun) return spot(at, i, lat)
  // Contact darkening reaches its floor at 0.34 of sky view and stops mattering
  // above it, so that is where the penalty is measured from.
  const _c = new THREE.Vector3()
  const cost = (x: number, y: number, z: number) =>
    sun(x, y + eyeHeight, z) +
    (sky ? Math.max(0, 0.34 - sky(x, y + 0.25, z)) * 1.6 : 0) +
    (extra ? extra(_c.set(x, y, z)) : 0)
  let best = { at, i, lat, occ: cost(at.x, at.y, at.z) }
  if (best.occ <= 0.01) return spot(best.at, best.i, best.lat)

  // Nearest first, so the actor moves as little as the light allows.
  const order: number[] = [0]
  for (let d = 1; d <= span; d++) order.push(d, -d)
  for (const di of order) {
    // Wider than it was: separating the two of them in the frame is a lateral
    // problem, and half a metre of shuffle cannot solve it at fourteen metres.
    for (const dl of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9, 2.5, -2.5]) {
      const ii = i + di
      const ll = lat + dl
      const p = offset(art, ii, ll, ground)
      // Never climb. Without this the search treats the canyon WALL as a
      // splendid sunlit spot and puts the dog fourteen metres up it, out of the
      // shot the camera was composed for. He walks a route on the floor; the
      // only staging freedom here is along it.
      if (Math.abs(p.y - at.y) > 1.2) continue
      const occ = cost(p.x, p.y, p.z)
      if (occ < best.occ) best = { at: p, i: ii, lat: ll, occ }
      // Only FULL sun ends the search. Stopping at the penumbra is what left the
      // dog a third occluded in every canyon shot: a third occluded still costs
      // his coat thirty percent of the distance to its shade value, and the
      // documented #E5D5BC then never renders anywhere in the bible.
      if (best.occ <= 0.01) return spot(best.at, best.i, best.lat)
    }
  }
  return spot(best.at, best.i, best.lat)
}

export function buildStage(
  art: ArtTerrain,
  ground: Ground,
  samples: { boy: number; dog: number; trailFrom: number } = STAGE_SAMPLES,
  sun?: SunOcc,
  /**
   * How far along the route an actor may be moved to find light, in samples.
   * Generous in the canyon, where the camera is composed around wherever they
   * end up; tight on the rim, where the town-reveal camera is the manifest's
   * own and the actors have to stay inside its frame.
   */
  span = 34,
  sky?: SunOcc,
): Stage {
  const { boy: bi0, dog: di0, trailFrom } = samples
  const boyLat0 = -0.55
  const dogLat0 = 0.85

  // The dog first: he is the subject, so he gets the pick of the light.
  let dogSpot = stageInLight(art, di0, dogLat0, ground, sun, 0.4, span, sky)
  const boySpot = stageInLight(art, bi0, boyLat0, ground, sun, 0.9, span, sky)

  // Then again, with the frame in the argument.
  //
  // In the Gate 2 set the dog stood directly ON the boy's head in both aspect
  // ratios — `hero-portrait` had the dog at y 800-910 and the boy's crown at
  // 915 — because the hero camera looks down the boy's line of travel and the
  // dog is staged straight ahead on it. That is not an art failure and it does
  // not fix itself by moving the camera: both characters move together when the
  // camera does. The dog has to stand off the line.
  //
  // So the second pass costs the light AND the horizontal angle between the two
  // of them as the hero camera sees it. A tenth of a radian is about six
  // degrees, which at the distances this shot stages is comfortably more than
  // the boy's own silhouette is wide.
  {
    const bh = routeYaw(art, boySpot.i)
    const cam = rigCamera(boySpot.at, bh)
    const boyBear = cam.bearing(boySpot.at)
    dogSpot = stageInLight(art, di0, dogLat0, ground, sun, 0.4, span, sky, (p) => {
      const bear = Math.abs(cam.bearing(p) - boyBear)
      const d = p.distanceTo(boySpot.at)
      let c = 0
      // Clear of the boy, and still inside the narrower of the two frames. The
      // portrait crop is 19.5:9 with a 55-degree VERTICAL field, which is only
      // 27 degrees across — 0.24 rad from the axis to the frame edge — so a
      // separation that reads on the desktop can put him off the phone entirely.
      // He was at x = -325 the first time this ran.
      if (bear < 0.085) c += (0.085 - bear) * 12
      if (bear > 0.165) c += (bear - 0.165) * 12
      // And AHEAD on the trail, measured along the way the boy is going — not
      // merely far from him. Straight-line distance let the search park him
      // four metres behind the camera, which satisfies every framing test and
      // is not a chase.
      void d
      const ahead = (p.x - boySpot.at.x) * Math.sin(bh) + (p.z - boySpot.at.z) * Math.cos(bh)
      if (ahead < 8) c += (8 - ahead) * 0.5
      if (ahead > 11) c += (ahead - 11) * 0.35
      return c
    })
  }
  const di = dogSpot.i
  const bi = boySpot.i
  const boyLat = boySpot.lat
  const dogLat = dogSpot.lat

  const boyAt = boySpot.at
  const dogAt = dogSpot.at
  // The boy faces the way he is GOING, not at the dog.
  //
  // He used to face the dog, and the hero camera settles behind the boy's
  // heading — so the camera was always aimed exactly at the dog, and no amount
  // of moving either of them could separate them: the dog stood on the boy's
  // head at a measured horizontal gap of 0 px in both aspect ratios. It is also
  // not what the game does. `CameraRig` settles behind the direction of travel
  // and biases the composition toward the dog by a quarter; it never points at
  // him.
  const boyHeading = routeYaw(art, bi)
  // he has stopped and turned his head back up the path; the body still points
  // the way he was going
  const dogHeading = routeYaw(art, di)

  // Prints. Spacing is stride, not sample spacing: the boy's stride is ~0.62 m
  // and the dog's trotting print pairs land about every 0.7 m, per
  // docs/game-design.md. They fade by strength only.
  const boyPrints: Stage['boyPrints'] = []
  const dogPrints: Stage['dogPrints'] = []
  const step = 0.1 // in sample units, ~0.15 m: dense sampling, then thinned
  let sinceBoy = 99
  let sinceDog = 99
  let side = 1
  let prev: THREE.Vector3 | null = null
  for (let i = trailFrom; i <= di; i += step) {
    const t = (i - trailFrom) / (di - trailFrom)
    const lat = boyLat + (dogLat - boyLat) * t
    const p = offset(art, i, lat, ground)
    const d = prev ? p.distanceTo(prev) : 0
    prev = p
    sinceBoy += d
    sinceDog += d
    const h = sampleAt(art, i).h
    const heading = Math.atan2(Math.cos(h), Math.sin(h)) // decal +Z faces travel

    // the dog's trail runs the whole way; the boy's stops where he is standing
    if (sinceDog >= 0.42) {
      sinceDog = 0
      side = -side
      const px = p.x + Math.sin(h) * 0.1 * side
      const pz = p.z - Math.cos(h) * 0.1 * side
      dogPrints.push({
        at: [px, p.y + 0.012, pz],
        heading,
        // 40 s of life at a trot: the oldest end of this trail is nearly gone
        fade: 0.55 + 0.45 * t,
      })
    }
    if (i <= bi && sinceBoy >= 0.46) {
      sinceBoy = 0
      // The boy walks BESIDE the dog's line, not down the middle of it.
      //
      // Both trails were being stamped on the same interpolated centreline with
      // lateral offsets of 0.10 and 0.09 m, so wherever the two stride counters
      // came due within a few centimetres of each other a pawprint and a
      // bootprint landed one centimetre apart. That is the doubled decal in
      // `dog-read-desktop.png`: two overlapping stamps about 15 px apart with a
      // bright gap between them, which read as a printing error and as a bar
      // across the centre pad. It is also untrue — nobody walks in their dog's
      // tracks.
      const lateral = -0.32 + 0.07 * (side > 0 ? 1 : -1)
      const px = p.x + Math.sin(h) * lateral
      const pz = p.z - Math.cos(h) * lateral
      boyPrints.push({
        at: [px, p.y + 0.01, pz],
        heading,
        fade: 0.45 + (0.55 * (i - trailFrom)) / (bi - trailFrom),
      })
    }
  }

  return {
    boy: { at: boyAt, heading: boyHeading },
    dog: { at: dogAt, heading: dogHeading },
    boyPrints,
    dogPrints,
  }
}

/** The gameplay follow camera, parked. This is the frame the game is played in. */
function rigShot(stage: Stage, art: ArtTerrain): Shot {
  const p = stage.boy.at
  const cam = rigCamera(p, stage.boy.heading)
  void art
  // The rig's own lead, and the rig's own dog bias: when the dog is near and
  // roughly in front, the look target lerps a quarter of the way toward the
  // midpoint of the two of them. Reproducing that here is what makes this shot
  // the frame the game is actually played in rather than a viewpoint that
  // resembles it.
  const look = new THREE.Vector3(
    p.x + Math.sin(stage.boy.heading) * 1.8,
    p.y + RIG.lookHeight,
    p.z + Math.cos(stage.boy.heading) * 1.8,
  )
  const mid = p.clone().add(stage.dog.at).multiplyScalar(0.5)
  mid.y += 0.6
  look.lerp(mid, 0.25)
  return {
    id: 'hero',
    label: 'Hero: the frame the game is played in',
    position: [cam.pos.x, cam.pos.y, cam.pos.z],
    lookAt: [look.x, look.y, look.z],
    fov: RIG.fov,
  }
}

export function buildShots(art: ArtTerrain, stage: Stage, cameras: CameraDef[]): Shot[] {
  const shots: Shot[] = [rigShot(stage, art)]
  const s = (i: number) => sampleAt(art, i)

  // Vista: up on the sunlit wall, looking down the canyon. This is the shot
  // that has to carry the palette on its own — walls, water, pines, sky.
  {
    // Shot from the shadow side looking across at the lit wall, which is the
    // only arrangement in which both documented limestone values are in frame
    // at once. Low enough that the rim and the sky above it are in shot too.
    // Tucked against the shadow wall and aimed across it, so the frame is
    // mostly the sunlit side. The cool wall is the accent here, not the ground
    // state: a limestone canyon at morning that renders grey-green everywhere
    // has lost the chapter, whatever its individual hexes measure.
    const a = s(68)
    const b = s(100)
    const lx = Math.sin(a.h)
    const lz = -Math.cos(a.h)
    shots.push({
      id: 'vista',
      label: 'Vista: both limestone values, rim and sky',
      position: [a.x - lx * 6.5 - Math.cos(a.h) * 14, a.y + 6.0, a.z - lz * 6.5 - Math.sin(a.h) * 14],
      lookAt: [b.x + lx * 7, b.y + 5.5, b.z + lz * 7],
      fov: 52,
    })
  }

  // Dog read: he is 24 m off on pale gravel with the wall behind him. If the
  // collar does not take the eye here, the whole search mechanic is broken.
  {
    // He is fourteen metres off on pale gravel with the wall behind him, and
    // the camera is where the boy's eyes would be. If the collar does not take
    // the eye here the whole search mechanic is broken.
    const d = stage.dog.at
    const a = s(STAGE_SAMPLES.dog - 10)
    const lx = Math.sin(a.h)
    const lz = -Math.cos(a.h)
    shots.push({
      id: 'dog-read',
      label: 'Dog read: the collar at trail distance',
      position: [a.x - lx * 0.6, a.y + 1.45, a.z - lz * 0.6],
      lookAt: [d.x, d.y + 0.34, d.z],
      // A long lens on purpose. The question this frame asks is whether the eye
      // finds him at trail distance, and it cannot be asked of a twenty-pixel
      // dog in the middle of an empty plate.
      fov: 32,
    })
  }

  // Ford: the river close up. No reflection, no specular, no normal map.
  {
    const f = s(99)
    const lx = Math.sin(f.h)
    const lz = -Math.cos(f.h)
    shots.push({
      id: 'ford',
      label: 'Ford: water as flat colour',
      position: [
        f.x - Math.cos(f.h) * 11 + lx * 1.5,
        f.y + 2.6,
        f.z - Math.sin(f.h) * 11 + lz * 1.5,
      ],
      lookAt: [f.x + Math.cos(f.h) * 2 + lx * 2, f.y - 0.3, f.z + Math.sin(f.h) * 2 + lz * 2],
      fov: 50,
    })
  }

  // Prints: the trail spec at reading distance, and the grain at close range.
  {
    // The trail as the game asks you to read it: low, along the line of it, with
    // the dog it leads to in the same frame. A camera pointed straight down at
    // one print tells you what a print looks like and nothing about whether a
    // trail can be followed.
    const idx = Math.floor(stage.dogPrints.length * 0.3)
    const p = stage.dogPrints[idx]
    const a = p ? p.at : [stage.boy.at.x, stage.boy.at.y, stage.boy.at.z]
    const h = p ? p.heading : 0
    shots.push({
      id: 'prints',
      label: 'Prints: the trail the game asks you to read',
      position: [a[0] - Math.sin(h) * 2.2, a[1] + 1.05, a[2] - Math.cos(h) * 2.2],
      lookAt: [a[0] + Math.sin(h) * 7, a[1] + 0.35, a[2] + Math.cos(h) * 7],
      fov: 46,
    })
  }

  // Town reveal: the manifest's own framed camera, not a generic viewpoint.
  // Gate 1's critic passed the staging but flagged that the town mass barely
  // read. This is where that gets checked against real palette and real fog.
  for (const c of cameras) {
    shots.push({
      id: c.id,
      label: 'Town reveal: the manifest camera, verbatim',
      position: c.position,
      lookAt: c.lookAt,
      fov: RIG.fov,
    })
  }

  return shots
}
