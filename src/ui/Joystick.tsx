import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { setJoystick } from '../game/input'

// Floating touch joystick. Appears where the thumb lands inside the lower-right
// quadrant, feeds normalized (x = right, z = up-screen = forward) into the
// input bus, hides on release. Touch-capable devices only — desktop mouse
// users never see or hit it. It steers direction only; pace stays authored.

const KNOB_RADIUS = 52 // px travel of the knob from the base center
const BASE_SIZE = 124
const KNOB_SIZE = 48

const regionStyle: CSSProperties = {
  position: 'fixed',
  right: 0,
  bottom: 0,
  width: '50vw',
  height: '55vh',
  touchAction: 'none',
  zIndex: 5,
  // capture region only; fully transparent
  background: 'transparent',
}

export function Joystick() {
  // armed only on touch-capable devices; checked once at mount
  const [coarse] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
  )
  const [active, setActive] = useState(false)
  const [knob, setKnob] = useState({ x: 0, y: 0 }) // px offset from base center
  const baseRef = useRef({ x: 0, y: 0 }) // viewport px of the base center
  const pointerIdRef = useRef<number | null>(null)

  if (!coarse) return null

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerIdRef.current) return
    pointerIdRef.current = null
    setActive(false)
    setKnob({ x: 0, y: 0 })
    setJoystick(false)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null) return
    if (e.pointerType === 'mouse') return
    pointerIdRef.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    baseRef.current = { x: e.clientX, y: e.clientY }
    setKnob({ x: 0, y: 0 })
    setActive(true)
    setJoystick(true, 0, 0)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerIdRef.current) return
    let dx = e.clientX - baseRef.current.x
    let dy = e.clientY - baseRef.current.y
    const len = Math.hypot(dx, dy)
    if (len > KNOB_RADIUS) {
      dx = (dx / len) * KNOB_RADIUS
      dy = (dy / len) * KNOB_RADIUS
    }
    setKnob({ x: dx, y: dy })
    // screen-up is forward
    setJoystick(true, dx / KNOB_RADIUS, -dy / KNOB_RADIUS)
  }

  return (
    <div
      style={regionStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      {active && (
        <>
          <div
            style={{
              position: 'fixed',
              left: baseRef.current.x - BASE_SIZE / 2,
              top: baseRef.current.y - BASE_SIZE / 2,
              width: BASE_SIZE,
              height: BASE_SIZE,
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.35)',
              background: 'rgba(255, 255, 255, 0.08)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: baseRef.current.x + knob.x - KNOB_SIZE / 2,
              top: baseRef.current.y + knob.y - KNOB_SIZE / 2,
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.35)',
              boxShadow: '0 0 6px rgba(60, 60, 60, 0.25)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </div>
  )
}
