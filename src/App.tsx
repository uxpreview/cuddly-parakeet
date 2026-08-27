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
import { Pawprints } from './components/Pawprints'
import { WhistleSystem, WhistleCues } from './components/WhistleSystem'
import { PerfProbe, PerfHudOverlay } from './components/PerfHud'
import { Joystick } from './ui/Joystick'
import { WhistleButton } from './ui/WhistleButton'
import { Legend } from './ui/Legend'

const CHAPTER = 'ch01-canyon'

export function App() {
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
        camera={{ position: [0, 3, 8], fov: 55, near: 0.2, far: 400 }}
        dpr={[1, 2]}
        style={{ touchAction: 'none' }}
      >
        {phase !== 'loading' && (
          <>
            <Level />
            <Player />
            <CameraRig />
            <Dog />
            <Pawprints />
            <WhistleSystem />
            <WhistleCues />
          </>
        )}
        <PerfProbe />
        {isDev && <DevCamProbe />}
      </Canvas>
      {phase === 'playing' && (
        <>
          <Joystick />
          <WhistleButton />
          <Legend />
        </>
      )}
      {phase === 'ended' && <EndCard title={chapterTitle} />}
      <PerfHudOverlay />
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
