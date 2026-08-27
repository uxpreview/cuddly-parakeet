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
 */
export const FORD_STAGE = { boy: 97, dog: 106, trailFrom: 88 }

type Ground = (x: number, z: number, fromY: number) => { y: number } | null

function sampleAt(art: ArtTerrain, i: number) {
  const c = art.centerline[Math.max(0, Math.min(art.centerline.length - 1, Math.round(i)))]
  return { x: c[0], y: c[1], z: c[2], h: c[3] }
}

function offset(art: ArtTerrain, i: number, lateral: number, ground: Ground) {
  const s = sampleAt(art, i)
  const x = s.x + Math.sin(s.h) * lateral
  const z = s.z - Math.cos(s.h) * lateral
  const g = ground(x, z, s.y + 2)
  return new THREE.Vector3(x, g ? g.y : s.y, z)
}

export function buildStage(
  art: ArtTerrain,
  ground: Ground,
  samples: { boy: number; dog: number; trailFrom: number } = STAGE_SAMPLES,
): Stage {
  const { boy: bi, dog: di, trailFrom } = samples
  const boyLat = -0.55
  const dogLat = 0.85

  const boyAt = offset(art, bi, boyLat, ground)
  const dogAt = offset(art, di, dogLat, ground)
  const boyHeading = Math.atan2(dogAt.x - boyAt.x, dogAt.z - boyAt.z)
  // he has stopped and turned his head back up the path; the body still points
  // the way he was going
  const dogHeading = sampleAt(art, di).h

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
      const px = p.x + Math.sin(h) * 0.09 * (side > 0 ? 1 : -1)
      const pz = p.z - Math.cos(h) * 0.09 * (side > 0 ? 1 : -1)
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
  const yaw = stage.boy.heading
  const pitch = (RIG.pitchDeg * Math.PI) / 180
  const hd = RIG.dist * Math.cos(pitch)
  const vd = RIG.dist * Math.sin(pitch)
  void art
  return {
    id: 'hero',
    label: 'Hero: the frame the game is played in',
    position: [p.x - Math.sin(yaw) * hd, p.y + RIG.lookHeight + vd, p.z - Math.cos(yaw) * hd],
    // lead toward where he is going, exactly as the rig does
    lookAt: [p.x + Math.sin(yaw) * 1.8, p.y + RIG.lookHeight, p.z + Math.cos(yaw) * 1.8],
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
