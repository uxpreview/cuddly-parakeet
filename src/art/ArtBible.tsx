import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadChapter } from '../game/loadChapter'
import { world, sampleGround } from '../game/world'
import { buildArtTerrain } from './artTerrain'
import { buildBoy, buildDog, BOY_WALK, DOG_LOOK_BACK, DOG_NEUTRAL } from './characters'
import { makeBlobShadow, makePrintTrail } from './decals'
import { setPixelAngle } from './RampMaterial'
import { CH1_LIGHT } from './palette'
import { Grain } from './Grain'
import { Sky } from './Sky'
import {
  buildShots,
  buildStage,
  FORD_STAGE,
  RIM_STAGE,
  STAGE_SAMPLES,
  type Shot,
} from './shots'

// Gate 2: the art bible. One static scene, canyon at morning, with the
// documented Chapter 1 palette applied and nothing simulated. It loads exactly
// the chapter data Gate 1 produced — same manifest, same centerline, same
// staging anchors — and replaces only how that data looks.
//
// Nothing here moves. There is no player, no dog actor, no whistle, no camera
// rig: the two characters are posed, the trail is stamped, and the camera sits
// on one of the fixed viewpoints in shots.ts.

const CHAPTER = 'ch01-canyon'

function Scene({
  shot,
  dogPose,
  onShots,
}: {
  shot: string
  dogPose: string | null
  onShots: (s: Shot[]) => void
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  // The terrain is built once; only the staging moves between viewpoints.
  const terrain = useMemo(() => (world.art ? buildArtTerrain(world.art) : null), [])

  const built = useMemo(() => {
    if (!world.art || !world.manifest || !terrain) return null
    const art = terrain
    // The canyon staging is the art bible proper. Two viewpoints get their own,
    // because judging a framed moment without its subject in it judges nothing:
    // the manifest's town-reveal camera, and the ford.
    const samples =
      shot === 'town-reveal' ? RIM_STAGE : shot === 'ford' ? FORD_STAGE : STAGE_SAMPLES
    const stage = buildStage(
      world.art,
      (x, z, y) => {
        const art = terrain.groundAt(x, z)
        if (art !== null) return { y: art }
        const g = sampleGround(x, z, y)
        return g ? { y: g.y } : null
      },
      samples,
      // Stage the subjects in the light. See shots.ts: two thirds of this floor
      // is lit and the dog was standing in the other third in every shot. The
      // ford is the exception and stands where it is told: that reach is wholly
      // in terrain shadow, so a search for light there only walks the actors out
      // of the beat the shot exists for.
      shot === 'ford' ? undefined : (x, y, z) => terrain.sunOcclusionAt(x, y, z),
      // The rim and the ford are named places: the reveal camera is the
      // manifest's own, and a ford shot staged thirty metres downstream of the
      // ford is a picture of a river. Only the open canyon staging roams.
      shot === 'town-reveal' || shot === 'ford' ? 7 : 40,
      shot === 'ford' ? undefined : (x, y, z) => terrain.skyViewAt(x, y, z),
    )
    // The SAME stage the scene renders, not a second one built beside it.
    //
    // The shot list used to be built from its own `buildStage` call while the
    // scene rendered another, so every camera was composed around a dog who was
    // somewhere else: `vista` and `prints` came back with the collar at one and
    // four pixels because the frame had been aimed at a position nothing was
    // standing in. Only one shot renders at a time, so there is no reason for
    // two.
    const shots = buildShots(world.art, stage, world.manifest.cameras)

    const group = new THREE.Group()
    group.add(art.group)

    // --- the two of them, posed -------------------------------------------
    const boyOcc = art.sunOcclusionAt(stage.boy.at.x, stage.boy.at.y + 0.9, stage.boy.at.z)
    const dogOcc = art.sunOcclusionAt(stage.dog.at.x, stage.dog.at.y + 0.4, stage.dog.at.z)
    const boy = buildBoy(BOY_WALK, boyOcc)
    boy.position.copy(stage.boy.at)
    boy.rotation.y = stage.boy.heading
    group.add(boy)

    // The look-back is the staged pose, but a character has to be judgeable in
    // a neutral one too: a head yawed a hundred degrees hides the neck, the
    // collar and half the silhouette, and that is exactly the frame the last
    // pass tried to read a whole model from. `?dogPose=neutral` is for the
    // turntable in tools/dev/dogturn.mjs and for nothing else.
    const dog = buildDog(dogPose === 'neutral' ? DOG_NEUTRAL : DOG_LOOK_BACK, dogOcc)
    dog.position.copy(stage.dog.at)
    dog.rotation.y = stage.dog.heading
    group.add(dog)

    // --- blob shadows ------------------------------------------------------
    // The dog's is tighter and darker than the boy's on purpose: he is the
    // thing the player is looking for, on ground almost exactly his own value,
    // and the contact shadow is what stops him floating on it.
    for (const [actor, foot, hgt, strength, core] of [
      [boy, 0.34, 1.15, 0.5, 0.45],
      [dog, 0.26, 0.5, 0.68, 0.6],
    ] as const) {
      // A contact shadow always, even in terrain shadow. It is not only a cast
      // shadow — it is what stops the character floating on the ground, and a
      // dog whose coat is four value points from the sand he stands on has
      // nothing else holding him to it.
      const blob = makeBlobShadow({
        footprint: foot,
        height: hgt,
        sunDir: CH1_LIGHT.sunDir,
        strength,
        core,
      })
      blob.position.set(actor.position.x, actor.position.y + 0.02, actor.position.z)
      group.add(blob)
    }

    // --- the trail ---------------------------------------------------------
    const dogTrail = makePrintTrail(stage.dogPrints, 'dog')
    if (dogTrail) group.add(dogTrail)
    const boyTrail = makePrintTrail(stage.boyPrints, 'boy')
    if (boyTrail) group.add(boyTrail)

    return { group, shots, art, stage }
  }, [terrain, shot, dogPose])

  useEffect(() => {
    if (built) onShots(built.shots)
    if (built) (window as unknown as Record<string, unknown>).__art = built
  }, [built, onShots])

  useEffect(() => {
    // The palette is only "applied exactly as documented" if nothing between
    // the material and the pixel touches it. No tone mapping curve, sRGB out.
    gl.toneMapping = THREE.NoToneMapping
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [gl])

  useEffect(() => {
    if (!built) return
    const s = built.shots.find((x) => x.id === shot) ?? built.shots[0]
    const cam = camera as THREE.PerspectiveCamera
    cam.position.set(...s.position)
    cam.fov = s.fov
    cam.near = 0.15
    cam.far = 1400
    cam.updateProjectionMatrix()
    cam.lookAt(new THREE.Vector3(...s.lookAt))
    // The collar's minimum size is stated in pixels, so it has to know how big
    // a pixel is. A portrait phone and a desktop window do not agree.
    setPixelAngle(cam.fov, gl.domElement.height / (gl.getPixelRatio() || 1))
    // headless screenshot harness reads this
    ;(window as unknown as Record<string, unknown>).__artShot = s
    ;(window as unknown as Record<string, unknown>).__gl = gl
    ;(window as unknown as Record<string, unknown>).__cam = cam
    ;(window as unknown as Record<string, unknown>).__artCenterline = world.art?.centerline
  }, [built, shot, camera, gl])

  if (!built) return null
  return (
    <>
      <Sky />
      <primitive object={built.group} />
      <Grain />
    </>
  )
}

export function ArtBible() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const params = new URLSearchParams(location.search)
  const shot = params.get('shot') ?? 'hero'
  const dogPose = params.get('dogPose')
  const bare = params.has('bare')

  // Dev-only key-light override, so the sun angle can be MEASURED rather than
  // argued about: the baked occlusion is built at load, so it cannot be tuned
  // from a uniform. `?sunAz=&sunEl=` rebuilds the chapter at that key light.
  const az = params.get('sunAz')
  const el = params.get('sunEl')
  if (az || el) {
    CH1_LIGHT.sunDir = [az ? Number(az) : CH1_LIGHT.sunDir[0], el ? Number(el) : CH1_LIGHT.sunDir[1]]
  }

  useEffect(() => {
    loadChapter(CHAPTER)
      .then(() => setReady(true))
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>{error}</div>

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
        camera={{ fov: 55, near: 0.15, far: 1400 }}
        style={{ touchAction: 'none' }}
      >
        {ready && <Scene shot={shot} dogPose={dogPose} onShots={setShots} />}
      </Canvas>
      {!bare && shots.length > 0 && <ShotBar shots={shots} current={shot} />}
    </>
  )
}

function ShotBar({ shots, current }: { shots: Shot[]; current: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      {shots.map((s) => (
        <a
          key={s.id}
          href={'?scene=art-bible&shot=' + s.id}
          style={{
            padding: '4px 9px',
            borderRadius: 3,
            textDecoration: 'none',
            background: s.id === current ? '#3E6E8E' : 'rgba(255,255,255,0.72)',
            color: s.id === current ? '#fff' : '#333',
          }}
        >
          {s.id}
        </a>
      ))}
    </div>
  )
}
