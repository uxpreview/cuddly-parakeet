import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { isDev } from '../game/world'

// Dev-only performance HUD: fps and draw calls. Never ships to the playtest
// view — it renders only when isDev (vite dev server or ?dev in the URL).

/** `frames` counts rendered frames since load; the chapter card keys its timing to it. */
export const perfStats = { fps: 0, drawCalls: 0, triangles: 0, frames: 0 }

export function PerfProbe() {
  const { gl } = useThree()
  const frames = useRef(0)
  const last = useRef(performance.now())
  useFrame(() => {
    frames.current++
    perfStats.frames++
    const now = performance.now()
    if (now - last.current >= 500) {
      perfStats.fps = Math.round((frames.current * 1000) / (now - last.current))
      frames.current = 0
      last.current = now
    }
    perfStats.drawCalls = gl.info.render.calls
    perfStats.triangles = gl.info.render.triangles
  })
  return null
}

export function PerfHudOverlay() {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!isDev) return
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])
  if (!isDev) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#333',
        background: 'rgba(255,255,255,0.65)',
        padding: '4px 8px',
        borderRadius: 4,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {perfStats.fps} fps · {perfStats.drawCalls} draws · {perfStats.triangles} tris
    </div>
  )
}
