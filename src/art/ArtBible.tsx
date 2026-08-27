import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadChapter } from '../game/loadChapter'
import { world, sampleGround } from '../game/world'
import { buildArtTerrain } from './artTerrain'
import { buildBoy, buildDog, BOY_WALK, DOG_LOOK_BACK } from './characters'
import { makeBlobShadow, makePrintTrail } from './decals'
import { CH1_LIGHT } from './palette'
import { Grain } from './Grain'
import { Sky } from './Sky'
import { buildShots, buildStage, RIM_STAGE, STAGE_SAMPLES, type Shot } from './shots'

// Gate 2: the art bible. One static scene, canyon at morning, with the
// documented Chapter 1 palette applied and nothing simulated. It loads exactly
// the chapter data Gate 1 produced — same manifest, same centerline, same
// staging anchors — and replaces only how that data looks.
//
// Nothing here moves. There is no player, no dog actor, no whistle, no camera
// rig: the two characters are posed, the trail is stamped, and the camera sits
// on one of the fixed viewpoints in shots.ts.

const CHAPTER = 'ch01-canyon'

function Scene({ shot, onShots }: { shot: string; onShots: (s: Shot[]) => void }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  // The terrain is built once; only the staging moves between viewpoints.
  const terrain = useMemo(() => (world.art ? buildArtTerrain(world.art) : null), [])

  const built = useMemo(() => {
    if (!world.art || !world.manifest || !terrain) return null
    const art = terrain
    const atRim = shot === 'town-reveal'
    const stage = buildStage(
      world.art,
      (x, z, y) => sampleGround(x, z, y),
      atRim ? RIM_STAGE : STAGE_SAMPLES,
    )
    const shots = buildShots(world.art, buildStage(world.art, (x, z, y) => sampleGround(x, z, y), STAGE_SAMPLES), world.manifest.cameras)

    const group = new THREE.Group()
    group.add(art.group)

    // --- the two of them, posed -------------------------------------------
    const boyOcc = art.sunOcclusionAt(stage.boy.at.x, stage.boy.at.y + 0.9, stage.boy.at.z)
    const dogOcc = art.sunOcclusionAt(stage.dog.at.x, stage.dog.at.y + 0.4, stage.dog.at.z)
    const boy = buildBoy(BOY_WALK, boyOcc)
    boy.position.copy(stage.boy.at)
    boy.rotation.y = stage.boy.heading
    group.add(boy)

    const dog = buildDog(DOG_LOOK_BACK, dogOcc)
    dog.position.copy(stage.dog.at)
    dog.rotation.y = stage.dog.heading
    group.add(dog)

    // --- blob shadows ------------------------------------------------------
    // The dog's is tighter and darker than the boy's on purpose: he is the
    // thing the player is looking for, on ground almost exactly his own value,
    // and the contact shadow is what stops him floating on it.
    for (const [actor, foot, hgt, strength, occ, core] of [
      [boy, 0.34, 1.15, 0.5, boyOcc, 0.45],
      [dog, 0.26, 0.5, 0.68, dogOcc, 0.6],
    ] as const) {
      // no cast shadow where there is no sun to cast it
      if (occ > 0.8) continue
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

    return { group, shots, art }
  }, [terrain, shot])

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
    // headless screenshot harness reads this
    ;(window as unknown as Record<string, unknown>).__artShot = s
    ;(window as unknown as Record<string, unknown>).__gl = gl
    ;(window as unknown as Record<string, unknown>).__cam = cam
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
  const bare = params.has('bare')

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
        {ready && <Scene shot={shot} onShots={setShots} />}
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
