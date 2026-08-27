import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeSkyMaterial } from './RampMaterial'

// The sky is a gradient dome, not a flat clear colour, because the chapter
// palette specifies two values for it: `#CFE3E0` overhead warming toward
// `#F2DFAE` at the rim. It evaluates the same function the ramp material uses
// for fog, so anything fading into the distance fades into exactly the sky
// behind it rather than into a grey curtain.

export function Sky() {
  const ref = useRef<THREE.Mesh>(null)
  const { geom, mat } = useMemo(
    () => ({ geom: new THREE.SphereGeometry(1, 16, 10), mat: makeSkyMaterial() }),
    [],
  )
  useFrame((state) => {
    if (ref.current) ref.current.position.copy(state.camera.position)
  })
  return (
    <mesh
      ref={ref}
      geometry={geom}
      material={mat}
      renderOrder={-1000}
      frustumCulled={false}
    />
  )
}
