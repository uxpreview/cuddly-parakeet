import * as THREE from 'three'
import { CH1, CH1_LIGHT } from './palette'

// The whole game is shaded by this one material.
//
// It is a two-stop gradient ramp: a surface facing the key light renders its
// palette hex EXACTLY, and a surface facing away renders that hex DARKENED and
// then pulled part of the way toward the chapter's documented shadow-side
// colour. Nothing brightens past the documented value, which is what makes "the
// palette applied exactly as documented" checkable rather than aspirational.
//
// The order matters, and getting it wrong was the single worst thing in the
// first pass. Shade that is mostly a lerp toward the shadow key destroys a
// material's identity: the boy's faded blue shirt turned into grey-green at six
// metres, and his earth shorts turned into milk. Shade is a drop in VALUE first
// — that is what a shadow physically is — with only as much hue shift as the
// chapter's light justifies. Limestone is the exception and goes the whole way,
// because art-direction.md names its shadow (`#9DA9A2`) exactly.
//
// The ramp is continuous. There is no terminator step and no rim/spec highlight,
// because a hard band plus an outline is the cel-shaded grammar this project is
// staying out of. There is no outline shader anywhere in this codebase.
//
// Fog is not a grey curtain: it is the sky. Both this material and the sky dome
// evaluate the same `skyColor(dir)` function, so anything that fades out fades
// into precisely the sky behind it. That is what makes the far canyon walls and
// the town below the rim read as distance rather than as haze pasted on top.

const SKY_GLSL = /* glsl */ `
vec3 skyColor(vec3 dir) {
  float h = clamp(dir.y, -1.0, 1.0);
  // warm band hugs the horizon and falls off fast, per "sky #CFE3E0 warming
  // toward #F2DFAE at the rim"
  // the warm value hugs the rim and is gone by twenty degrees up: any higher
  // and it reads as a band across mid-sky rather than as morning light
  float warm = 1.0 - smoothstep(-0.04, 0.2, h);
  vec3 col = mix(uSkyZenith, uSkyRim, warm * warm * warm);
  // a touch cooler and darker below the horizon line so the canyon floor haze
  // does not glow brighter than the ground it sits behind
  col = mix(col, uSkyZenith * 0.92, smoothstep(0.0, -0.22, h));
  return col;
}
`

const VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vWorldPos;

#ifdef USE_SHADOW_ATTR
  attribute float aShadow;
  varying float vShadow;
#endif

#ifdef USE_OCC_ATTR
  attribute float aOcc;
  varying float vOcc;
  attribute float aAo;
  varying float vAo;
#endif

void main() {
  #include <color_vertex>
  #include <begin_vertex>

  #ifdef USE_SHADOW_ATTR
    vShadow = aShadow;
  #endif

  #ifdef USE_OCC_ATTR
    vOcc = aOcc;
    vAo = aAo;
  #endif

  vec3 objNormal = normal;
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    objNormal = mat3(instanceMatrix) * objNormal;
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;

  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objNormal);

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */ `
#include <common>
#include <color_pars_fragment>

uniform vec3 uBase;
uniform vec3 uSunDir;
uniform vec3 uShadowKey;
uniform float uShadowMix;
uniform vec3 uSkyZenith;
uniform vec3 uSkyRim;
uniform float uFogNear;
uniform float uFogFar;
uniform float uHazeFloor;
uniform float uHazeDepth;
uniform float uOpacity;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;

#ifdef USE_SHADOW_ATTR
  varying float vShadow;
#endif

#ifdef USE_OCC_ATTR
  varying float vOcc;
  varying float vAo;
#endif

uniform float uOcclusion;
uniform float uShadeDrop;
uniform float uFlatten;

${SKY_GLSL}

void main() {
  vec3 base = uBase;
  #ifdef USE_COLOR
    base *= vColor;
  #endif

  vec3 n = normalize(vWorldNormal);
  // Double-sided geometry seen from behind gets its normal flipped, so a
  // headland or a terrace whose winding happens to face away does not render as
  // a flat near-black slab with a straight top edge.
  if (!gl_FrontFacing) n = -n;
  #ifdef USE_SHADOW_ATTR
    float shadowMix = vShadow;
  #else
    float shadowMix = uShadowMix;
  #endif
  // Value drop first, hue slide second — so a material whose slide is 1.0
  // lands on the documented shadow-side colour EXACTLY, and one whose slide is
  // low is simply a darker version of itself.
  //
  // Limestone slides the whole way, and with the ramp narrowed that is right
  // rather than ruinous: a surface is either turned toward the sun or it is
  // not, so lit limestone renders #E3C08C exactly and shaded limestone renders
  // #9DA9A2 exactly, which is the two-value system art-direction.md describes.
  // The earlier attempt at a partial slide put both walls of the canyon in the
  // same warm mush, because part-way between two colours is duller than either.
  vec3 shade = mix(base * uShadeDrop, uShadowKey, shadowMix);

  // Skylight. In shade the key light contributes nothing, so without this every
  // face of a cliff renders the same value and a wall in shadow has no form at
  // all — which is what flat shading is supposed to expose. A whole sky is a
  // hemisphere of light: an up-facing surface gets all of it, a vertical face
  // about two thirds, an underside almost none. This is the "plus ambient" of
  // "one directional light plus ambient", and it is what models the shadow side.
  // Normalised so that a VERTICAL face in shade renders its shade colour
  // exactly. That is the face art-direction.md is describing when it names
  // limestone's shadow side #9DA9A2, so it is the one that has to measure
  // right; up-facing shade lifts a little because it sees more sky, and
  // undersides fall away because they see almost none.
  // Nothing is LIFTED by the sky — a surface in shade renders its shade colour,
  // which is the whole point of the documented shadow-side hex. Only what the
  // sky cannot reach falls below it: undersides, overhangs, the backs of ledges.
  //
  // And the fill is COLOURLESS. An earlier pass tinted it toward the sky hex
  // reasoning that a shadow is lit by the sky; the sky hex is #CFE3E0, hue 171,
  // and multiplying every shaded surface in the game by a cyan-grey turned the
  // whole world green. Sunlit limestone vanished from the frame the game is
  // played in, the dog's coat drifted 57/255 off its documented hex, and the
  // chapter arrived bleached. Where a surface should read cool in shade, the
  // per-material slide toward the documented shadow-side colour is what does
  // it — deliberately, per material, and measurably.
  float sky = 1.0 - 0.45 * clamp(-n.y, 0.0, 1.0);
  shade *= sky;

  // The ramp. One soft transition, and it has to REACH both ends.
  //
  // The sun runs close to the canyon's axis, so almost no surface points
  // straight at it; with the upper stop out at 0.52 the documented lit
  // limestone #E3C08C occupied zero percent of the frame the game is played in,
  // and every stone surface in the chapter landed on the shadow hex instead.
  // A palette measured that way passes by deleting half of itself.
  //
  // So the stop sits close in: anything turned toward the sun at all renders
  // its palette hex EXACTLY, anything turned away renders its shade exactly,
  // and the soft transition is a narrow band between them. Measured across the
  // set, every material's hue was landing dead on its documented value while
  // its chroma sat 30-65% low — the ramp was parking most surfaces part-way
  // between two colours, and part-way between two colours is always duller
  // than either. This is flat shading; the ramp is the seam, not the field.
  float l = dot(n, uSunDir);
  float t = smoothstep(-0.28, 0.1, l);

  // baked terrain shadow: a surface the sun cannot see falls to its shade value
  // however it happens to be turned
  #ifdef USE_OCC_ATTR
    float occ = max(vOcc, uOcclusion);
  #else
    float occ = uOcclusion;
  #endif
  // A terrain shadow takes a surface most of the way to its shade value, not
  // all the way: the canyon floor in shadow is still limestone dust lit by a
  // whole sky, and crushing it to the shade colour is how a morning turns into
  // an overcast afternoon.
  t = mix(t, t * 0.08, occ);

  vec3 col = mix(shade, base, t);

  // Contact darkening. Sky visibility, marched once at load: 1 in the open, low
  // where the ground closes in. This is what puts a dark at the feet of the
  // walls and in the narrows, and it is the only thing in a chapter this
  // high-key that reaches the bottom of the value range.
  #ifdef USE_OCC_ATTR
    // Reaches further down than is comfortable on purpose. Measured across the
    // whole set, minimum luminance was 59 and the first percentile 86-139: the
    // pictures had no anchor value anywhere and read as fog rather than as a
    // canyon. The deep places — the wall feet, the narrows, the undersides —
    // are the only ones that can supply one in a chapter this high-key.
    col *= mix(0.6, 1.0, smoothstep(0.1, 0.62, vAo));
  #endif

  // --- fog is the sky ------------------------------------------------------
  vec3 viewDir = normalize(vWorldPos - cameraPosition);
  float dist = length(vWorldPos - cameraPosition);
  float fogT = smoothstep(uFogNear, uFogFar, dist);
  // valley haze: everything sitting below the rim line gathers morning air,
  // so the town reads as *below and far*, not merely far
  float low = 1.0 - smoothstep(uHazeFloor, uHazeFloor + uHazeDepth, vWorldPos.y);
  // Capped well short of 1. Above about three quarters the haze stops
  // describing distance and starts deleting the thing: the town below the rim
  // measured flat-lit, its opposing roof planes within 2/255 of each other, and
  // that was not the shading failing — it was ninety-four percent fog.
  fogT = clamp(fogT + low * fogT * 0.45, 0.0, 0.74);
  // Fog carries VALUE toward the sky but only two thirds of the chroma loss.
  // Pine is one of five hexes this chapter owns and distance was measuring it
  // five times too desaturated; haze is allowed to describe distance and is not
  // allowed to delete a documented colour.
  vec3 hazed = mix(col, skyColor(viewDir), fogT);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float hazedLum = dot(hazed, vec3(0.2126, 0.7152, 0.0722));
  col = mix(hazed, col + (hazedLum - lum), 0.34);

  // a material allowed to disobey the light (the collar, and nothing else)
  col = mix(col, base, uFlatten);

  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}
`

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // pin to the far plane
}
`

const SKY_FRAG = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyRim;
varying vec3 vDir;

${SKY_GLSL}

void main() {
  gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
  #include <colorspace_fragment>
}
`

function lin(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

export interface RampOptions {
  /** Base hex. Vertex colors, when present, multiply this. */
  color?: string
  /** Which shadow-side value this surface slides toward. */
  shadowKey?: string
  /** 0 = keeps its own hue in shade, 1 = lands exactly on the shadow key. */
  shadowMix?: number
  /** Read shadowMix per-vertex from an `aShadow` attribute instead. */
  shadowAttribute?: boolean
  /** Read baked sun occlusion per-vertex from an `aOcc` attribute. */
  occlusionAttribute?: boolean
  /** Flat occlusion for a whole object (a character standing in shade). */
  occlusion?: number
  /** How far the shade side drops in value before any hue shift. */
  shadeDrop?: number
  /** Pull the result back toward the unlit base colour. 1 = ignores the light. */
  flatten?: number
  vertexColors?: boolean
  transparent?: boolean
  opacity?: number
  depthWrite?: boolean
  side?: THREE.Side
  /** Height in meters below which the world gathers valley haze. */
  hazeFloor?: number
  /** How many meters the haze fades out over, above hazeFloor. */
  hazeDepth?: number
}

function sunVector(): THREE.Vector3 {
  const [az, el] = CH1_LIGHT.sunDir
  const a = (az * Math.PI) / 180
  const e = (el * Math.PI) / 180
  return new THREE.Vector3(
    Math.cos(e) * Math.cos(a),
    Math.sin(e),
    Math.cos(e) * Math.sin(a),
  ).normalize()
}

/** Every ramp material made so far, so a palette or light edit reaches them all. */
const registry: THREE.ShaderMaterial[] = []

export function makeRamp(opts: RampOptions = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? false,
    depthWrite: opts.depthWrite ?? true,
    side: opts.side ?? THREE.FrontSide,
    defines: {
      ...(opts.shadowAttribute ? { USE_SHADOW_ATTR: '' } : {}),
      ...(opts.occlusionAttribute ? { USE_OCC_ATTR: '' } : {}),
    },
    uniforms: {
      uBase: { value: lin(opts.color ?? '#FFFFFF') },
      uSunDir: { value: sunVector() },
      uShadowKey: { value: lin(opts.shadowKey ?? CH1.limestoneShadow.hex) },
      uShadowMix: { value: opts.shadowMix ?? 0.6 },
      uSkyZenith: { value: lin(CH1.skyZenith.hex) },
      uSkyRim: { value: lin(CH1.skyRim.hex) },
      uFogNear: { value: CH1_LIGHT.fogNear },
      uFogFar: { value: CH1_LIGHT.fogFar },
      uHazeFloor: { value: opts.hazeFloor ?? -6 },
      uHazeDepth: { value: opts.hazeDepth ?? 16 },
      uOpacity: { value: opts.opacity ?? 1 },
      uOcclusion: { value: opts.occlusion ?? 0 },
      uShadeDrop: { value: opts.shadeDrop ?? 0.86 },
      uFlatten: { value: opts.flatten ?? 0 },
    },
  })
  // the audit reads this to know which asset a material's color belongs to
  m.name = opts.color ?? 'ramp'
  registry.push(m)
  return m
}

export function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    // pinned to the far plane, so it must not be depth-tested against it
    depthTest: false,
    uniforms: {
      uSkyZenith: { value: lin(CH1.skyZenith.hex) },
      uSkyRim: { value: lin(CH1.skyRim.hex) },
    },
  })
}

/** Live-tune the key light without rebuilding materials (art-bible only). */
export function setSunDirection(azimuthDeg: number, elevationDeg: number) {
  const a = (azimuthDeg * Math.PI) / 180
  const e = (elevationDeg * Math.PI) / 180
  const v = new THREE.Vector3(
    Math.cos(e) * Math.cos(a),
    Math.sin(e),
    Math.cos(e) * Math.sin(a),
  ).normalize()
  for (const m of registry) m.uniforms.uSunDir?.value.copy(v)
}

export function setFog(near: number, far: number) {
  for (const m of registry) {
    if (!m.uniforms.uFogNear) continue
    m.uniforms.uFogNear.value = near
    m.uniforms.uFogFar.value = far
  }
}

export const sunDirection = sunVector
