import { useMemo } from 'react'
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
// Amount is in output units. 0.016 is roughly +/- 4 of 255 at the peak, which
// is visible as texture on a large flat wall and invisible as noise.

export const GRAIN_AMOUNT = 0.016

const VERT = /* glsl */ `
void main() {
  // ignore all matrices: this is a full-screen triangle pair in clip space
  gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0);
}
`

const FRAG = (sign: '+' | '-') => /* glsl */ `
uniform float uAmount;
uniform float uSeed;

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
  float v = ${sign === '+' ? 'max(n, 0.0)' : 'max(-n, 0.0)'} * uAmount;
  gl_FragColor = vec4(v, v, v, 1.0);
}
`

function grainMaterial(sign: '+' | '-', amount: number): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG(sign),
    uniforms: { uAmount: { value: amount }, uSeed: { value: 11.37 } },
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
  return (
    <>
      <mesh geometry={geom} material={add} renderOrder={9998} frustumCulled={false} />
      <mesh geometry={geom} material={sub} renderOrder={9999} frustumCulled={false} />
    </>
  )
}
