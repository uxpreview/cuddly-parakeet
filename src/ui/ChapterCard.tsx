import { useEffect, useState, type CSSProperties } from 'react'
import { useGame } from '../game/store'
import { CH1 } from '../art/palette'
import { perfStats } from '../components/PerfHud'

// The chapter card. art-direction.md: "Chapter cards are the place names only,
// held over the first seconds of the chapter's light." It doubles as the
// loading veil, so the game never shows a bare canvas: the sky colour is there
// from the first paint, the name settles onto it, and the world fades up
// underneath. At the chapter's end the same card returns.
//
// No text but the place name. No progress bar, no button.

const DISPLAY_FACE =
  '"Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'

const HOLD_AFTER_LOAD = 1.4 // seconds the veil stays up once the world is ready
const VEIL_FADE = 2.2
const TITLE_HOLD = 3.6 // seconds from play start until the name goes
const TITLE_FADE = 1.4

const veilStyle = (opacity: number, seconds: number): CSSProperties => ({
  position: 'fixed',
  inset: 0,
  zIndex: 30,
  pointerEvents: opacity > 0.02 ? 'auto' : 'none',
  opacity,
  transition: `opacity ${seconds}s cubic-bezier(0.4, 0, 0.2, 1)`,
  background: `linear-gradient(180deg, ${CH1.skyZenith.hex} 0%, ${CH1.skyZenith.hex} 38%, ${CH1.skyRim.hex} 100%)`,
})

const titleStyle = (opacity: number, seconds: number, lift: number): CSSProperties => ({
  position: 'fixed',
  left: 0,
  right: 0,
  top: '44%',
  zIndex: 31,
  pointerEvents: 'none',
  textAlign: 'center',
  margin: 0,
  opacity,
  transform: `translateY(${lift}px)`,
  transition: `opacity ${seconds}s ease, transform ${seconds * 1.4}s cubic-bezier(0.2, 0.7, 0.2, 1)`,
  fontFamily: DISPLAY_FACE,
  fontWeight: 500,
  fontSize: 'clamp(30px, 6.2vw, 68px)',
  letterSpacing: '0.05em',
  color: CH1.pine.hex,
  fontVariationSettings: '"SOFT" 100, "opsz" 144',
  textShadow: `0 1px 0 rgba(255,255,255,0.35)`,
})

export function ChapterCard() {
  const phase = useGame((s) => s.phase)
  const title = useGame((s) => s.chapterTitle)
  const setIntroDone = useGame((s) => s.setIntroDone)
  const [veil, setVeil] = useState(1)
  const [name, setName] = useState(0)
  const [lift, setLift] = useState(10)

  // the name settles in as soon as we have it
  useEffect(() => {
    if (!title) return
    const id = requestAnimationFrame(() => {
      setName(1)
      setLift(0)
    })
    return () => cancelAnimationFrame(id)
  }, [title])

  useEffect(() => {
    if (phase === 'playing') {
      // The clock starts when the world has actually DRAWN, not when the data
      // arrived. Building the canyon and compiling its shaders can stall the
      // main thread for a second or more on a phone, and timers started before
      // that all fire at once when it ends -- the card was gone before the
      // world had shown a single frame under it.
      const timers: number[] = []
      const startFrames = perfStats.frames
      const poll = window.setInterval(() => {
        if (perfStats.frames < startFrames + 3) return
        window.clearInterval(poll)
        timers.push(window.setTimeout(() => setVeil(0), HOLD_AFTER_LOAD * 1000))
        timers.push(
          window.setTimeout(() => {
            setName(0)
            setLift(-8)
          }, TITLE_HOLD * 1000),
        )
        timers.push(
          window.setTimeout(() => setIntroDone(true), (TITLE_HOLD + TITLE_FADE * 0.5) * 1000),
        )
      }, 60)
      return () => {
        window.clearInterval(poll)
        for (const t of timers) window.clearTimeout(t)
      }
    }
    if (phase === 'ended') {
      setVeil(1)
      const a = window.setTimeout(() => {
        setName(1)
        setLift(0)
      }, 1400)
      return () => window.clearTimeout(a)
    }
  }, [phase, setIntroDone])

  const ending = phase === 'ended'
  return (
    <>
      <div style={veilStyle(veil, ending ? 3.2 : VEIL_FADE)} aria-hidden />
      <h1 style={titleStyle(name, ending ? 2.4 : name ? 1.2 : TITLE_FADE, lift)}>{title}</h1>
    </>
  )
}
