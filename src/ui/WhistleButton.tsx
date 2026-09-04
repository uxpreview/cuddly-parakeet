// Whistle button. Lower left, always visible, on every device — a small
// whistle glyph in a translucent neutral circle. Pointer down routes through
// the shared input bus (requestWhistle); keyboard F/Space already does the
// same in input.ts, so this is additive. The 3s cooldown reads quietly: the
// glyph dims on press and refills its opacity as the cooldown elapses.

import { useEffect, useState } from 'react'
import { requestWhistle } from '../game/input'
import { world } from '../game/world'
import { now } from '../game/clock'
import { CH1 } from '../art/palette'

export function WhistleButton() {
  // 0..1 cooldown recovery, quantized so React re-renders stay rare.
  const [recovery, setRecovery] = useState(1)

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = (now() - world.whistle.lastAt) / world.whistle.cooldownMs
      setRecovery(Math.min(Math.max(Math.round(t * 30) / 30, 0), 1))
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const glyphOpacity = 0.3 + 0.7 * recovery

  return (
    <button
      type="button"
      aria-label="Whistle"
      onPointerDown={(e) => {
        e.preventDefault()
        requestWhistle()
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        width: 64,
        height: 64,
        padding: 0,
        borderRadius: '50%',
        border: '1px solid rgba(78, 110, 88, 0.3)',
        background: 'rgba(244, 242, 234, 0.34)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 6px 24px rgba(78, 90, 84, 0.10)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        zIndex: 5,
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width={32}
        height={32}
        style={{
          display: 'block',
          opacity: glyphOpacity,
          transition: 'opacity 0.1s linear',
          pointerEvents: 'none',
        }}
      >
        {/* Pea-whistle silhouette: round body with a hole (evenodd cuts it). */}
        <path
          fill={CH1.pine.hex}
          fillRule="evenodd"
          d="M12.5 9.5 a8.5 8.5 0 1 0 0.01 0 z
             M12.5 14.8 a3.2 3.2 0 1 0 0.01 0 z"
        />
        {/* Mouthpiece bar, joining the top-right of the body. */}
        <rect x="15" y="8" width="15" height="5.5" rx="2.5" fill={CH1.pine.hex} />
      </svg>
    </button>
  )
}
