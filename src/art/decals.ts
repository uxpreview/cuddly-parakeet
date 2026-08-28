import * as THREE from 'three'
import { CH1 } from './palette'

// Ground decals: blob shadows and the print trail.
//
// docs/decisions.md D14 left both of these without a visual spec, because the
// spec they referenced lived in the superseded ink direction. D17 and D18 rule
// on them; this file is that ruling in code.
//
// Both are *multiplies*, not paint. A decal darkens whatever surface it lands
// on and keeps that surface's hue, which is why a print on pale gravel and a
// print on wet stone are recognisably the same print in two different
// materials.
//
// The fragment shader emits the multiplier itself — mix(white, tint, coverage)
// — and the blend is a straight dst * src. Doing the coverage in the shader
// rather than in the blend factors is what keeps a soft-edged decal from
// brightening its own falloff, and it leaves the alpha channel untouched, which
// an opaque canvas cares about.

/** A palette hex as its authored sRGB triple, not colour-managed to linear. */
function srgbTint(hex: string): THREE.Color {
  return new THREE.Color(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  )
}

function multiplyBlend(m: THREE.Material) {
  m.blending = THREE.CustomBlending
  m.blendSrc = THREE.DstColorFactor
  m.blendDst = THREE.ZeroFactor
  m.blendEquation = THREE.AddEquation
  m.blendSrcAlpha = THREE.ZeroFactor
  m.blendDstAlpha = THREE.OneFactor
  m.blendEquationAlpha = THREE.AddEquation
  m.transparent = true
  m.depthWrite = false
}

// --- blob shadows (D17) ----------------------------------------------------
//
// An ellipse on the ground under the character, painted in the chapter's
// documented shadow-side colour and never in black, so a shadow belongs to the
// palette like everything else.
//
//   - solid to 45% of the radius, then a smooth falloff to nothing at the rim
//   - sized to the character's footprint x 1.35
//   - stretched along the sun's ground bearing by 1 + 1.1 * cot(elevation),
//     capped at 2.4x, and pushed away from the sun by exactly the length the
//     stretch added, so the near end of the blob stays under the feet. A blob
//     that translates as a whole reads as a second object lying on the ground
//   - core strength 0.55
//
// The stretch and the offset are the whole point: at Chapter 1's 22-degree
// morning sun this produces the long soft shadows the palette section promises,
// from the ground up, without a shadow map anywhere in the game.

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SHADOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uCore;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = (1.0 - smoothstep(uCore, 1.0, r)) * uStrength;
  if (a <= 0.002) discard;
  // the multiplier: 1.0 outside the blob, the shadow tint at full coverage
  gl_FragColor = vec4(mix(vec3(1.0), uColor, a), 1.0);
}
`

export interface BlobShadowOptions {
  /** Character footprint diameter in meters. */
  footprint: number
  /** Character height in meters; drives how far the blob is thrown. */
  height: number
  /** Sun azimuth and elevation in degrees, matching the chapter light. */
  sunDir: [number, number]
  strength?: number
  /** Fraction of the radius held at full darkness before the falloff. */
  core?: number
}

export function makeBlobShadow(opts: BlobShadowOptions): THREE.Mesh {
  const [az, el] = opts.sunDir
  const elRad = Math.max((el * Math.PI) / 180, 0.12)
  const cot = Math.cos(elRad) / Math.sin(elRad)
  const stretch = Math.min(1 + 0.85 * cot, 2.1)
  const rBase = opts.footprint * 1.05
  // Anchored at the feet: the shift is only what keeps the near END of the
  // stretched ellipse under the character, and it is deliberately short of that
  // so the core always overlaps the contact point. A blob that reaches for the
  // correct shadow length and lets go of the feet reads as a separate object
  // lying on the ground, which is what it looked like.
  const throwDist = (rBase * (stretch - 1)) / 2.8

  const geom = new THREE.PlaneGeometry(rBase * stretch, rBase, 1, 1)
  geom.rotateX(-Math.PI / 2)
  // stretch runs along the sun's ground bearing; the blob is thrown away from it
  const bearing = Math.atan2(Math.sin((az * Math.PI) / 180), Math.cos((az * Math.PI) / 180))
  geom.rotateY(-bearing)
  geom.translate(-Math.cos(bearing) * throwDist, 0, -Math.sin(bearing) * throwDist)

  const mat = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    uniforms: {
      // The multiply happens in output space, so the tint is used as authored
      // rather than converted to linear on the way in.
      uColor: { value: srgbTint(CH1.limestoneShadow.hex) },
      uStrength: { value: opts.strength ?? 0.55 },
      uCore: { value: opts.core ?? 0.45 },
    },
  })
  mat.name = 'blob-shadow'
  multiplyBlend(mat)
  const mesh = new THREE.Mesh(geom, mat)
  mesh.renderOrder = 2
  return mesh
}

// --- print art (D18) -------------------------------------------------------
//
// Hand-drawn alpha decals, which art-direction.md allows as one of its handful
// of painted textures. Drawn here procedurally so they are original to this
// game and so a surface change is a parameter, never a re-export.
//
//   dog:  four toe ovals around a larger heel pad, ~16 cm across, 0.5 strength
//   boy:  a rounded sole, ball plus heel, ~19 cm long, 0.3 strength
//
// Both are larger and darker than the anatomy strictly wants. They are read at
// six and a half metres over the boy's shoulder, on pale gravel, in bright
// morning light, and a print that is only correct is a print nobody sees.
//
// The dog's are the darker of the two on purpose. They are the trail the game
// is asking the player to read, and the boy's must never compete with them.

function printCanvas(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#ffffff'
  draw(ctx, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  return tex
}

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

let dogTex: THREE.Texture | null = null
let boyTex: THREE.Texture | null = null

export function dogPrintTexture(): THREE.Texture {
  if (dogTex) return dogTex
  dogTex = printCanvas((ctx, S) => {
    const c = S / 2
    // Heel pad, big. Ink COVERAGE is the whole game here: a decal is minified
    // the moment it is more than a couple of metres away, and a minified decal
    // does not get fainter in the sense of losing its edges — the sampler
    // averages the entire stamp down toward its mean alpha. Four small toes and
    // a small pad drawn on a mostly empty canvas average to about eight percent,
    // which is why the trail measured two to eight percent contrast and one
    // print measured exactly zero against the ground it sat on. The anatomy
    // wants a light little print. The sampler charges for empty space, so the
    // pads are drawn heavy and close.
    oval(ctx, c, c + S * 0.17, S * 0.215, S * 0.175)
    // four toes in a forward arc, overlapping the pad rather than floating off
    // it — a paw, readable as one connected shape at the size it is actually
    // seen, not four dots and a blob
    const toes: [number, number, number][] = [
      [-0.215, -0.045, -0.42],
      [-0.078, -0.155, -0.15],
      [0.078, -0.155, 0.15],
      [0.215, -0.045, 0.42],
    ]
    for (const [dx, dy, rot] of toes) {
      oval(ctx, c + dx * S, c + dy * S, S * 0.098, S * 0.125, rot)
    }
  })
  return dogTex
}

export function boyPrintTexture(): THREE.Texture {
  if (boyTex) return boyTex
  boyTex = printCanvas((ctx, S) => {
    const c = S / 2
    // ball of the foot
    oval(ctx, c, c - S * 0.115, S * 0.205, S * 0.245)
    // heel
    oval(ctx, c, c + S * 0.235, S * 0.16, S * 0.155)
    // the waist between them, faint: a walking print rarely lands whole
    ctx.globalAlpha = 0.55
    oval(ctx, c, c + S * 0.07, S * 0.11, S * 0.105)
    ctx.globalAlpha = 1
  })
  return boyTex
}

const PRINT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * wp;
}
`

const PRINT_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uStrength;
uniform float uTexSize;
uniform float uMinBoost;
varying vec2 vUv;
void main() {
  float a = texture2D(uMap, vUv).a;

  // A print six metres away covers a handful of pixels, and the sampler averages
  // the whole stamp toward its mean alpha — so a decal authored to sit at a
  // readable darkness up close arrives at the middle distance as a smudge four
  // percent off the ground value. Measured, the trail stopped being followable
  // at about three metres, and the trail is half the navigation system: there is
  // no wayfinding UI to fall back on.
  //
  // So the strength is compensated for minification. How many texels fall inside
  // one screen pixel tells us how much averaging the sampler has already done,
  // and the ink is deepened by the same order. Capped, because a print at forty
  // metres becoming a black dot is its own failure — this is meant to hold the
  // print at the value it was authored at, not to make distance louder.
  vec2 duv = vec2(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
  float mip = clamp(log2(max(max(duv.x, duv.y) * uTexSize, 1.0)), 0.0, 5.0);
  float k = clamp(uStrength * (1.0 + mip * uMinBoost), 0.0, 0.92);

  a *= k;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), uColor, a), 1.0);
}
`

export interface PrintStep {
  /** World position of the print. */
  at: [number, number, number]
  /** Heading in radians; the print points the way the walker was going. */
  heading: number
  /** 1 = fresh. Prints fade by shrinking their strength, never by turning grey. */
  fade?: number
}

export function makePrintTrail(
  steps: PrintStep[],
  kind: 'dog' | 'boy',
): THREE.InstancedMesh | null {
  if (steps.length === 0) return null
  // Larger than the anatomy wants. Beyond about three metres a print smaller
  // than this is averaged away by the sampler entirely — measured, the trail
  // simply stopped existing past the near field — and the trail is half the
  // navigation system.
  const size = kind === 'dog' ? 0.2 : 0.235
  const geom = new THREE.PlaneGeometry(size * (kind === 'dog' ? 0.95 : 0.66), size)
  geom.rotateX(-Math.PI / 2)

  const mat = new THREE.ShaderMaterial({
    vertexShader: PRINT_VERT,
    fragmentShader: PRINT_FRAG,
    uniforms: {
      uMap: { value: kind === 'dog' ? dogPrintTexture() : boyPrintTexture() },
      uColor: { value: srgbTint(CH1.limestoneShadow.hex) },
      // Eased back from 0.72/0.44. The trail measured 30.4% contrast against
      // the gravel at the near end, which overshot: it went from invisible
      // straight past readable to conspicuous, and a prop that draws the eye in
      // a frame whose whole job is to send the eye to the collar is competing
      // with the one thing that must never be competed with.
      uStrength: { value: kind === 'dog' ? 0.55 : 0.33 },
      uTexSize: { value: 128 },
      uMinBoost: { value: kind === 'dog' ? 0.42 : 0.3 },
    },
  })
  mat.name = 'print:' + kind
  multiplyBlend(mat)

  const mesh = new THREE.InstancedMesh(geom, mat, steps.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  steps.forEach((s, i) => {
    q.setFromAxisAngle(up, s.heading)
    const f = s.fade ?? 1
    one.set(f, 1, f)
    m.compose(new THREE.Vector3(s.at[0], s.at[1], s.at[2]), q, one)
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return mesh
}
