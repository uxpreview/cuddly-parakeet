import { useMemo } from 'react'
import * as THREE from 'three'
import { buildTerrainMeshes } from '../game/terrain'
import { world } from '../game/world'
import { buildArtTerrain } from '../art/artTerrain'
import { setFog, setPixelAngle, setSunDirection } from '../art/RampMaterial'
import { CH1_LIGHT } from '../art/palette'
import { Sky } from '../art/Sky'
import { Grain } from '../art/Grain'
import { useThree } from '@react-three/fiber'

// The chapter's world.
//
// D19: a chapter with `environment.artTerrain` renders its LOOK; a chapter
// without one renders the grey box, which is what keeps the Gate 1 build alive
// as a debugging view. That was written at Gate 2 and only the art bible ever
// honoured it — the gameplay path was still drawing grey slabs. It honours it
// here, and `?greybox` forces the old path back for debugging.

const GREYBOX =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('greybox')

export function Level() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const art = useMemo(() => {
    if (GREYBOX || !world.art) return null
    const scene = buildArtTerrain(world.art)
    world.artScene = scene
    return scene
  }, [])

  const grey = useMemo(() => {
    if (art || !world.terrain) return null
    return buildTerrainMeshes(world.terrain)
  }, [art])

  const lighting = world.manifest?.lighting.states[0]

  useMemo(() => {
    if (!art) return
    // The palette is only "applied exactly as documented" if nothing between
    // the material and the pixel touches it. No tone mapping curve, sRGB out.
    gl.toneMapping = THREE.NoToneMapping
    gl.outputColorSpace = THREE.SRGBColorSpace
    setSunDirection(CH1_LIGHT.sunDir[0], CH1_LIGHT.sunDir[1])
    setFog(CH1_LIGHT.fogNear, CH1_LIGHT.fogFar)
  }, [art, gl])

  // The collar's minimum size is stated in PIXELS, so it has to know how big a
  // pixel is, and a portrait phone and a desktop window do not agree. The art
  // bible set this and the game never did, which meant D21's floor — the whole
  // search mechanic at distance — was being computed against a stale viewport.
  const fov = (camera as THREE.PerspectiveCamera).fov ?? 55
  setPixelAngle(fov, size.height)

  const sun = useMemo(() => {
    if (!lighting) return null
    const [az, el] = lighting.sunDir
    const a = (az * Math.PI) / 180
    const e = (el * Math.PI) / 180
    return new THREE.Vector3(
      Math.cos(e) * Math.cos(a),
      Math.sin(e),
      Math.cos(e) * Math.sin(a),
    ).multiplyScalar(80)
  }, [lighting])

  if (art) {
    return (
      <>
        <Sky />
        <primitive object={art.group} />
        <Grain />
      </>
    )
  }

  if (!grey || !lighting || !sun) return null
  return (
    <>
      <color attach="background" args={[lighting.fog.color]} />
      <fog attach="fog" args={[lighting.fog.color, lighting.fog.near, lighting.fog.far]} />
      <ambientLight intensity={1.25} color={lighting.ambient} />
      <hemisphereLight intensity={0.5} color={lighting.ambient} groundColor="#8a8578" />
      <directionalLight position={sun.toArray()} intensity={1.7} color={lighting.sun} />
      <primitive object={grey} />
    </>
  )
}
