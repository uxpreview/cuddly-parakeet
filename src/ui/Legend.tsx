// First-load control legend. Glyphs and key caps only — no sentences, no
// instruction text (the one allowed glyph overlay). Shows once per browser
// (localStorage), fades out over 0.5s on the first real input.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { input } from '../game/input'

const STORAGE_KEY = 'tlwh-legend-seen'

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // storage unavailable — the legend simply shows again next load
  }
}

const INK = '#f4f2ea'

function Cap({ label, wide }: { label?: string; wide?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: wide ? 64 : 26,
        height: 26,
        padding: '0 5px',
        borderRadius: 5,
        border: `1px solid rgba(244, 242, 234, 0.5)`,
        background: 'rgba(244, 242, 234, 0.08)',
        color: INK,
        font: '600 13px/1 system-ui, sans-serif',
      }}
    >
      {label ?? ''}
    </span>
  )
}

function Slash() {
  return (
    <span
      style={{
        color: 'rgba(244, 242, 234, 0.55)',
        font: '400 14px/1 system-ui, sans-serif',
        margin: '0 4px',
      }}
    >
      /
    </span>
  )
}

// Same pea-whistle silhouette as the whistle button.
function WhistleGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block' }}>
      <path
        fill={INK}
        fillRule="evenodd"
        d="M12.5 9.5 a8.5 8.5 0 1 0 0.01 0 z
           M12.5 14.8 a3.2 3.2 0 1 0 0.01 0 z"
      />
      <rect x="15" y="8" width="15" height="5.5" rx="2.5" fill={INK} />
    </svg>
  )
}

// Thumb-stick glyph: concentric circles, stick nub offset a touch.
function JoystickGlyph({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} style={{ display: 'block' }}>
      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(244,242,234,0.45)" strokeWidth="1.5" />
      <circle cx="18" cy="18" r="9" fill="none" stroke="rgba(244,242,234,0.7)" strokeWidth="1.5" />
      <circle cx="21" cy="15" r="4.5" fill={INK} />
    </svg>
  )
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
}

export function Legend() {
  const [state, setState] = useState<'visible' | 'fading' | 'gone'>(() =>
    alreadySeen() ? 'gone' : 'visible',
  )
  const coarse = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
    [],
  )

  // Dismiss on the first real input: keydown or pointerdown anywhere, plus a
  // poll of the input bus as a fallback (joystick / whistle writes).
  useEffect(() => {
    if (state !== 'visible') return
    let done = false
    const dismiss = () => {
      if (done) return
      done = true
      markSeen()
      setState('fading')
    }
    window.addEventListener('keydown', dismiss)
    window.addEventListener('pointerdown', dismiss)
    const poll = window.setInterval(() => {
      if (input.anyInputSeen) dismiss()
    }, 200)
    return () => {
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('pointerdown', dismiss)
      window.clearInterval(poll)
    }
  }, [state])

  useEffect(() => {
    if (state !== 'fading') return
    const id = window.setTimeout(() => setState('gone'), 500)
    return () => window.clearTimeout(id)
  }, [state])

  if (state === 'gone') return null

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '20%',
        transform: 'translateX(-50%)',
        padding: coarse ? '18px 26px' : '18px 28px',
        borderRadius: 14,
        background: 'rgba(40, 46, 44, 0.42)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        opacity: state === 'visible' ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {coarse ? (
        // Mobile: whistle glyph hinting left, thumb-stick glyph hinting right.
        <div
          style={{
            ...rowStyle,
            justifyContent: 'space-between',
            width: 'min(56vw, 240px)',
          }}
        >
          <WhistleGlyph size={32} />
          <JoystickGlyph size={38} />
        </div>
      ) : (
        <>
          <div style={rowStyle}>
            <Cap label="W" />
            <Cap label="A" />
            <Cap label="S" />
            <Cap label="D" />
            <Slash />
            <Cap label="←" />
            <Cap label="↑" />
            <Cap label="↓" />
            <Cap label="→" />
          </div>
          <div style={rowStyle}>
            <WhistleGlyph size={28} />
            <span style={{ width: 8 }} />
            <Cap label="F" />
            <Slash />
            <Cap wide />
          </div>
        </>
      )}
    </div>
  )
}
