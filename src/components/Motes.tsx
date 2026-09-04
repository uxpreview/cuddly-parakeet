import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CH1 } from '../art/palette'

// Dust in the morning air. A few hundred pale points tiled through the world
// and wrapped around the camera, drifting slowly. They are only visible
// against the shade side of the canyon and never against the sky, which is
// what makes them read as air with light in it rather than as snow.
//
// Not a marker, not a cue, not information. Atmosphere only.

const COUNT = 260
const BOX = 26 // metres of tiled volume around the camera, per axis
const HEIGHT = 11

const VERT = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform float uBox;
uniform float uHeight;
attribute float aSeed;
varying float vFade;
void main() {
  float s = aSeed * 6.2831;
  // a slow drift, mostly sideways, a little upward
  vec3 drift = vec3(
    sin(uTime * 0.21 + s) * 0.8 + uTime * 0.06 * cos(s),
    sin(uTime * 0.17 + s * 1.7) * 0.35 + uTime * 0.04,
    cos(uTime * 0.19 + s * 0.6) * 0.8 + uTime * 0.05 * sin(s)
  );
  // tiled in world space and wrapped about the camera, so the motes stay
  // where they are while the camera walks through them
  vec3 rel = position + drift - cameraPosition;
  rel.x = mod(rel.x + uBox * 0.5, uBox) - uBox * 0.5;
  rel.z = mod(rel.z + uBox * 0.5, uBox) - uBox * 0.5;
  rel.y = mod(rel.y + uHeight * 0.5, uHeight) - uHeight * 0.5;
  vec3 wp = cameraPosition + rel;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float dist = max(-mv.z, 0.01);
  // in close they would be blobs; far out they are gone
  vFade = smoothstep(1.2, 4.0, dist) * (1.0 - smoothstep(13.0, 19.0, dist));
  gl_PointSize = clamp((2.6 * uDpr * 6.0) / dist, 1.2 * uDpr, 3.2 * uDpr);
  gl_Position = projectionMatrix * mv;
}
`
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * 0.55 * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`

export function Motes() {
  const dpr = useThree((s) => s.viewport.dpr)
  const { geom, mat } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = Math.random() * BOX
      pos[i * 3 + 1] = Math.random() * HEIGHT
      pos[i * 3 + 2] = Math.random() * BOX
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    // wraps around the camera: never cull it
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uBox: { value: BOX },
        uHeight: { value: HEIGHT },
        // the sky's warm rim value: light in the air, and no new colour
        uColor: { value: new THREE.Color(CH1.skyRim.hex) },
      },
    })
    m.name = 'motes'
    return { geom: g, mat: m }
  }, [])
  const ref = useRef<THREE.Points>(null)
  useEffect(
    () => () => {
      geom.dispose()
      mat.dispose()
    },
    [geom, mat],
  )
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += Math.min(dt, 0.05)
    mat.uniforms.uDpr.value = dpr
  })
  return <points ref={ref} geometry={geom} material={mat} frustumCulled={false} renderOrder={5} />
}
