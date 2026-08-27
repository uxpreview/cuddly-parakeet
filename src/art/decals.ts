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
}

export function makeBlobShadow(opts: BlobShadowOptions): THREE.Mesh {
  const [az, el] = opts.sunDir
  const elRad = Math.max((el * Math.PI) / 180, 0.12)
  const cot = Math.cos(elRad) / Math.sin(elRad)
  const stretch = Math.min(1 + 1.1 * cot, 2.4)
  const rBase = opts.footprint * 1.35
  // anchor the near end at the feet: shift by half the length the stretch added
  const throwDist = (rBase * (stretch - 1)) / 2

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
      uCore: { value: 0.45 },
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
//   dog:  four toe ovals around a larger heel pad, ~11 cm across, 0.42 strength
//   boy:  a rounded sole, ball plus heel, ~15 cm long, 0.26 strength
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
    // heel pad, a soft triangle-ish oval
    oval(ctx, c, c + S * 0.13, S * 0.15, S * 0.12)
    // four toes, splayed forward
    const toes: [number, number, number][] = [
      [-0.19, -0.1, -0.5],
      [-0.07, -0.2, -0.18],
      [0.07, -0.2, 0.18],
      [0.19, -0.1, 0.5],
    ]
    for (const [dx, dy, rot] of toes) {
      oval(ctx, c + dx * S, c + dy * S, S * 0.068, S * 0.088, rot)
    }
  })
  return dogTex
}

export function boyPrintTexture(): THREE.Texture {
  if (boyTex) return boyTex
  boyTex = printCanvas((ctx, S) => {
    const c = S / 2
    // ball of the foot
    oval(ctx, c, c - S * 0.11, S * 0.16, S * 0.2)
    // heel
    oval(ctx, c, c + S * 0.21, S * 0.125, S * 0.12)
    // the waist between them, faint: a walking print rarely lands whole
    ctx.globalAlpha = 0.55
    oval(ctx, c, c + S * 0.06, S * 0.085, S * 0.085)
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
varying vec2 vUv;
void main() {
  float a = texture2D(uMap, vUv).a * uStrength;
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
  const size = kind === 'dog' ? 0.115 : 0.155
  const geom = new THREE.PlaneGeometry(size * (kind === 'dog' ? 0.95 : 0.62), size)
  geom.rotateX(-Math.PI / 2)

  const mat = new THREE.ShaderMaterial({
    vertexShader: PRINT_VERT,
    fragmentShader: PRINT_FRAG,
    uniforms: {
      uMap: { value: kind === 'dog' ? dogPrintTexture() : boyPrintTexture() },
      uColor: { value: srgbTint(CH1.limestoneShadow.hex) },
      uStrength: { value: kind === 'dog' ? 0.42 : 0.26 },
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
