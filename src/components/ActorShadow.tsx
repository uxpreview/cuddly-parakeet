import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeBlobShadow } from '../art/decals'
import { CH1_LIGHT } from '../art/palette'
import { artGround, world, sampleGround } from '../game/world'

// The contact shadow both gameplay actors were missing.
//
// `art-direction.md` asks for "character blob shadows ... plus soft contact
// darkening where things meet ground", and the art bible built them by hand in
// ArtBible.tsx. The GAME never did: neither Player.tsx nor Dog.tsx ever made
// one, so through all of Gate 1 and Gate 3 both characters met the ground with
// an antialias edge and nothing under them. A figure with no ground contact has
// no weight, whatever its foot telemetry says, and weight is the first Gate 3
// must-confirm.
//
// It follows the actor's feet rather than his mesh: the boy's visual height
// dips as he settles, and a shadow that dips with him is a shadow sliding down
// a wall.

export interface ActorShadowProps {
  /** Character footprint diameter in metres. */
  footprint: number
  /** Character height in metres; drives how far the blob is thrown. */
  height: number
  strength?: number
  core?: number
  /** World position to sit under, read fresh each frame. */
  follow: () => { x: number; z: number; y: number }
  /** 0 in full sun, 1 in terrain shadow: a cast shadow fades, contact does not. */
  occlusion?: () => number
}

export function ActorShadow({
  footprint,
  height,
  strength = 0.5,
  core = 0.45,
  follow,
  occlusion,
}: ActorShadowProps) {
  const ref = useRef<THREE.Mesh | null>(null)
  const mesh = useMemo(
    () => makeBlobShadow({ footprint, height, sunDir: CH1_LIGHT.sunDir, strength, core }),
    [footprint, height, strength, core],
  )

  useEffect(() => {
    const m = mesh
    return () => {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }, [mesh])

  useFrame(() => {
    const m = ref.current
    if (!m || !world.ready) return
    const at = follow()
    // Onto the ground he is SEEN standing on, not the height he collides at:
    // at the ford the art bed sits a metre below its collision slab.
    const art = artGround(at.x, at.z)
    const g = art === null ? sampleGround(at.x, at.z, at.y + 0.75) : null
    const y = art !== null ? art : g ? g.y : at.y
    m.position.set(at.x, y + 0.015, at.z)
    if (occlusion) {
      // In terrain shadow the cast component goes, but the CONTACT does not:
      // this is what stops a character floating on ground four value points
      // from his own coat. It never fades to nothing.
      const o = occlusion()
      const u = (m.material as THREE.ShaderMaterial).uniforms
      u.uStrength.value = strength * (1 - 0.45 * o)
    }
  })

  return <primitive ref={ref} object={mesh} />
}
