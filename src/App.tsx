import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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
import { PerfProbe, PerfHudOverlay } from './components/PerfHud'
import { Joystick } from './ui/Joystick'
import { WhistleButton } from './ui/WhistleButton'
import { Legend } from './ui/Legend'
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
  const chapterTitle = useGame((s) => s.chapterTitle)
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
            <Prints />
            <WhistleSystem />
            <WhistleCues />
          </>
        )}
        <PerfProbe />
        {isDev && <DevCamProbe />}
      </Canvas>
      {phase === 'playing' && !BARE && (
        <>
          <Joystick />
          <WhistleButton />
          <Legend />
        </>
      )}
      {phase === 'ended' && <EndCard title={chapterTitle} />}
      {!BARE && <PerfHudOverlay />}
    </>
  )
}

// Dev-only: exposes the live camera to the headless drive harness.
function DevCamProbe() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__cam = camera
  }, [camera])
  return null
}

// Grey-box chapter end card: the place name only, per the text rules.
function EndCard({ title }: { title: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#CFE3E0',
        opacity: visible ? 1 : 0,
        transition: 'opacity 2.5s ease',
        fontFamily: 'system-ui, sans-serif',
        color: '#4E6E58',
        zIndex: 10,
      }}
    >
      <h1 style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{title}</h1>
    </div>
  )
}
