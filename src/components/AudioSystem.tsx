import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from '../game/world'
import { setPrintListener } from '../game/trail'
import {
  playBark,
  playStep,
  playWhistle,
  requestBed,
  setListener,
  unlockAudio,
} from '../audio/audio'

// Wires the synthesised audio to game events. Nothing here changes any
// behaviour: it listens to the whistle, the answer, the bolt and the feet, and
// tells the audio engine where the ear is.

const _fwd = new THREE.Vector3()

export function AudioSystem() {
  const camera = useThree((s) => s.camera)
  const seen = useRef({ press: 0, answer: 0, activity: '' })

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock, { passive: true })
    setPrintListener((p) => playStep(p.kind, p.x, p.z))
    requestBed(world.manifest?.audio.bed ?? '')
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
      setPrintListener(null)
    }
  }, [])

  useFrame(() => {
    if (!world.ready) return
    camera.getWorldDirection(_fwd)
    setListener(camera.position.x, camera.position.z, _fwd.x, _fwd.z)
    const s = seen.current
    const w = world.whistle
    if (w.pressSeq !== s.press) {
      s.press = w.pressSeq
      playWhistle()
    }
    if (w.answerSeq !== s.answer) {
      s.answer = w.answerSeq
      playBark(w.answerPos.x, w.answerPos.z, 'answer')
    }
    // the bolt: the stare breaks and he goes. One bark, higher, as he goes.
    const a = world.dog.activity
    if (s.activity === 'stare' && a === 'trot') playBark(world.dog.pos.x, world.dog.pos.z, 'bolt')
    s.activity = a
  })
  return null
}
