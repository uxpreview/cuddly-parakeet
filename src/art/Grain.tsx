import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// The single grain pass, barely there.
//
// Carried over from the ink direction: it is what keeps large areas of flat
// palette colour from reading as vector art. It is drawn as two full-screen
// blends rather than one, so the noise is signed and its mean is exactly zero:
// one additive pass for the grain above mid, one reverse-subtract pass for the
// grain below it. A single alpha-blended pass would pull every colour a percent
// or two toward grey, and the documented palette hexes have to survive to the
// pixel.
//
// Amount is in output units. 0.02 is roughly +/- 5 of 255 at the peak, which
// is texture on a large flat wall and is not noise you can catch yourself
// looking at.

export const GRAIN_AMOUNT = 0.02

const VERT = /* glsl */ `
void main() {
  // ignore all matrices: this is a full-screen triangle pair in clip space
  gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0);
}
`

const FRAG = (sign: '+' | '-') => /* glsl */ `
uniform float uAmount;
uniform float uSeed;
uniform float uSkyFloor;
uniform vec2 uResolution;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  // two offset hashes, so the grain has a little clumping instead of reading
  // as a uniform per-pixel fizz
  float a = hash(gl_FragCoord.xy + uSeed);
  float b = hash(floor(gl_FragCoord.xy * 0.5) + uSeed * 1.7);
  float n = (a * 0.72 + b * 0.28) * 2.0 - 1.0;
  // Fade the grain out over the upper part of the frame. The sky is a single
  // flat plate, so grain there is the only modulation present and it is the one
  // place it becomes noise you can catch yourself looking at.
  float sky = 1.0 - smoothstep(uSkyFloor, 1.0, gl_FragCoord.y / max(1.0, uResolution.y));
  float v = ${sign === '+' ? 'max(n, 0.0)' : 'max(-n, 0.0)'} * uAmount * mix(0.25, 1.0, sky);
  gl_FragColor = vec4(v, v, v, 1.0);
}
`

function grainMaterial(sign: '+' | '-', amount: number): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG(sign),
    uniforms: {
      uAmount: { value: amount },
      uSeed: { value: 11.37 },
      uSkyFloor: { value: 0.55 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: sign === '+' ? THREE.AddEquation : THREE.ReverseSubtractEquation,
    // Alpha is left exactly as the scene wrote it. Without this the subtract
    // pass reaches the alpha channel too and punches the whole frame out.
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
  })
  m.name = 'grain' + sign
  return m
}

export function Grain({ amount = GRAIN_AMOUNT }: { amount?: number }) {
  const { geom, add, sub } = useMemo(
    () => ({
      geom: new THREE.PlaneGeometry(1, 1),
      add: grainMaterial('+', amount),
      sub: grainMaterial('-', amount),
    }),
    [amount],
  )
  const size = useThree((s) => s.size)
  add.uniforms.uResolution.value.set(size.width, size.height)
  sub.uniforms.uResolution.value.set(size.width, size.height)
  return (
    <>
      <mesh geometry={geom} material={add} renderOrder={9998} frustumCulled={false} />
      <mesh geometry={geom} material={sub} renderOrder={9999} frustumCulled={false} />
    </>
  )
}
