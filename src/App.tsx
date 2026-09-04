import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadChapter } from './game/loadChapter'
import { bindKeyboard, input, setJoystick } from './game/input'
import { useGame } from './game/store'
import { world, isDev } from './game/world'
import { Level } from './components/Level'
import { Player } from './components/Player'
import { CameraRig } from './components/CameraRig'
import { Dog } from './components/Dog'
import { Prints } from './components/Prints'
import { WhistleSystem, WhistleCues } from './components/WhistleSystem'
import { ActorShadow } from './components/ActorShadow'
import { PerfProbe, PerfHudOverlay } from './components/PerfHud'
import { Joystick } from './ui/Joystick'
import { WhistleButton } from './ui/WhistleButton'
import { Legend } from './ui/Legend'
import { ChapterCard } from './ui/ChapterCard'
import { Motes } from './components/Motes'
import { AudioSystem } from './components/AudioSystem'
import { ArtBible } from './art/ArtBible'
import { installRecorder } from './game/record'

const CHAPTER = 'ch01-canyon'

// `?rec=<seed>` hands the frameloop to tools/record.mjs. `?bare` drops the
// touch UI and the legend, so a recording is the game and nothing on top of it.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null
const REC_SEED = params?.get('rec')
const RECORDING = REC_SEED !== null && REC_SEED !== undefined
const BARE = params?.has('bare') ?? false

export function App() {
  // Gate 2 lives at ?scene=art-bible: a static, posed scene sharing the
  // chapter's data and none of its systems.
  if (typeof location !== 'undefined' && location.search.includes('scene=art-bible')) {
    return <ArtBible />
  }
  return <Game />
}

function Game() {
  const phase = useGame((s) => s.phase)
  const introDone = useGame((s) => s.introDone)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unbind = bindKeyboard()
    loadChapter(CHAPTER)
      .then(() => {
        const g = useGame.getState()
        g.setChapterTitle(world.manifest?.title ?? '')
        g.setPhase('playing')
      })
      .catch((e) => setError(String(e)))
    if (isDev) {
      // dev console access for driving/inspecting the game headlessly
      ;(window as unknown as Record<string, unknown>).__game = {
        world,
        useGame,
        input,
        setJoystick,
      }
    }
    if (RECORDING) installRecorder(Number(REC_SEED) || 1)
    return unbind
  }, [])

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        Failed to load chapter: {error}
      </div>
    )
  }

  return (
    <>
      <Canvas
        // Far plane 1400, the art bible's. At 400 the chapter's `beyond`
        // geometry — the town, the sea band, the highland plates, all of it a
        // kilometre out — was being clipped mid-triangle, and a clipped
        // hundred-metre triangle is a spike: the shadow-side wall came apart
        // into a fan of slivers across a third of the frame.
        camera={{ position: [0, 3, 8], fov: 55, near: 0.15, far: 1400 }}
        dpr={[1, 2]}
        frameloop={RECORDING ? 'never' : 'always'}
        gl={{ antialias: true, preserveDrawingBuffer: RECORDING, alpha: false }}
        style={{ touchAction: 'none' }}
      >
        {phase !== 'loading' && (
          <>
            <Level />
            <Player />
            <CameraRig />
            <Dog />
            <ActorShadow
              footprint={0.34}
              height={1.15}
              strength={0.45}
              core={0.3}
              follow={() => ({
                x: world.player.pos.x,
                y: world.player.visualY,
                z: world.player.pos.z,
              })}
            />
            <ActorShadow
              footprint={0.26}
              height={0.5}
              strength={0.55}
              core={0.38}
              follow={() => ({ x: world.dog.pos.x, y: world.dog.pos.y, z: world.dog.pos.z })}
            />
            <Prints />
            <WhistleSystem />
            <WhistleCues />
            <Motes />
            <AudioSystem />
          </>
        )}
        <Framing />
        <PerfProbe />
        {isDev && <DevCamProbe />}
      </Canvas>
      {phase !== 'loading' && !BARE && (
        <>
          <Joystick />
          <WhistleButton />
          {introDone && <Legend />}
        </>
      )}
      {!BARE && <ChapterCard />}
      {!BARE && <PerfHudOverlay />}
    </>
  )
}

// The vertical field of view follows the viewport's shape. A 55-degree
// vertical field is right on a landscape screen; on a portrait phone it leaves
// a horizontal field of about thirty degrees, and the canyon became a slot with
// its walls filling the frame and no sky. Portrait opens up to 68, which keeps
// the horizontal field near forty and the walls where they belong.
function Framing() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const fov = aspect < 1 ? THREE.MathUtils.lerp(68, 55, THREE.MathUtils.smoothstep(aspect, 0.6, 1)) : 55
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [camera, size])
  return null
}

// Dev-only: exposes the live camera to the headless drive harness.
function DevCamProbe() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__cam = camera
  }, [camera])
  return null
}
