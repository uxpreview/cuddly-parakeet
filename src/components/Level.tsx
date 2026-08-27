import { useMemo } from 'react'
import * as THREE from 'three'
import { buildTerrainMeshes } from '../game/terrain'
import { world } from '../game/world'

// Renders the loaded chapter's terrain and applies its manifest lighting.
export function Level() {
  const group = useMemo(() => {
    if (!world.terrain) return null
    return buildTerrainMeshes(world.terrain)
  }, [])

  const lighting = world.manifest?.lighting.states[0]
  const sun = useMemo(() => {
    if (!lighting) return null
    const [az, el] = lighting.sunDir
    const a = (az * Math.PI) / 180
    const e = (el * Math.PI) / 180
    const dir = new THREE.Vector3(
      Math.cos(e) * Math.cos(a),
      Math.sin(e),
      Math.cos(e) * Math.sin(a),
    )
    return dir.multiplyScalar(80)
  }, [lighting])

  if (!group || !lighting || !sun) return null
  return (
    <>
      <color attach="background" args={[lighting.fog.color]} />
      <fog attach="fog" args={[lighting.fog.color, lighting.fog.near, lighting.fog.far]} />
      <ambientLight intensity={1.25} color={lighting.ambient} />
      <hemisphereLight intensity={0.5} color={lighting.ambient} groundColor="#8a8578" />
      <directionalLight position={sun.toArray()} intensity={1.7} color={lighting.sun} />
      <primitive object={group} />
    </>
  )
}
