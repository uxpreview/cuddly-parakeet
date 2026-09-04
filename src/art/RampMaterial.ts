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
  // and the sun itself: the warm value gathers toward where the light comes
  // from, low in the sky, so the sky has a direction and so does the haze that
  // is built from it. No new colour enters -- it is the documented rim value.
  float toSun = max(dot(dir, uSunDir), 0.0);
  float glow = pow(toSun, 9.0) * 0.55 + pow(toSun, 40.0) * 0.35;
  col = mix(col, uSkyRim, glow * (1.0 - smoothstep(0.45, 0.9, h)));
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

#ifdef USE_MIN_SCREEN
  uniform vec3 uMinScreenCenter;
  uniform vec3 uMinScreenAxis;
  uniform float uMinScreenPx;
  uniform float uMinScreenWidthPx;
  /** Radians of vertical FOV per pixel: 2*tan(fov/2) / viewportHeight. */
  uniform float uPixelAngle;
#endif

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

  #ifdef USE_MIN_SCREEN
    // A screen-space floor on how small this object is allowed to get.
    //
    // Only the collar uses it, and the collar is the reason the red rule
    // exists: "in every frame that contains the dog, the eye goes to the collar
    // first, involuntarily." A band 3.5 cm wide on a dog 60 cm tall is four to
    // nine pixels at the distances Chapter 1 actually stages him at, and four
    // pixels of anything does not catch an eye involuntarily — measured across
    // the render set the only way to locate him in a wide shot was to scan for
    // red numerically. Modelling the band wider does not fix that; it makes him
    // a dog in a scarf up close and is still four pixels far away.
    //
    // So the band holds a minimum radius in pixels and grows only when it is
    // below it. Close up the factor is exactly 1 and the geometry is untouched.
    //
    // TWO floors, not one, because a band has two dimensions and only one of
    // them is its radius. Narrowing the collar from a 5.2 cm sleeve to a 3 cm
    // strap — which is what stopped it reading as a chest kerchief — took its
    // STROKE at the radius floor from 1.40 px to 0.78 px, and a sub-pixel
    // stroke is antialiased below the audit's own saturation threshold: in
    // vista-desktop the whole collar came back as four pixels in two
    // fragments, under the five-by-five the mechanism exists to guarantee. So
    // the width along the band's own axis holds a floor of its own. Up close
    // both factors are exactly 1 and the strap is a strap.
    vec3 ctr = (modelMatrix * vec4(uMinScreenCenter, 1.0)).xyz;
    float d = length(ctr - cameraPosition);
    vec3 axis = normalize(mat3(modelMatrix) * uMinScreenAxis);
    float need = uMinScreenPx * d * uPixelAngle;
    float needW = uMinScreenWidthPx * d * uPixelAngle;
    vec3 rad = wp.xyz - ctr;
    float along = dot(rad, axis);
    vec3 perp = rad - axis * along;
    float pl = length(perp);
    float radK = pl > 1e-5 ? max(1.0, need / pl) : 1.0;
    perp *= radK;
    // Two floors on the stroke, and the band takes whichever is larger.
    //
    // The first is proportional: the strap widens with the ring, so an expanded
    // collar is the same strap drawn bigger rather than a ring with a hairline
    // on it. The second is D21's pixel floor, which is what actually defends
    // the SHORT axis of the ellipse a ring makes when it is seen from behind
    // and above — the angle the game shows most, and the one the radius floor
    // does nothing for.
    float aw = abs(along);
    float wantW = max(aw * radK, needW);
    if (aw > 1e-6) along = (along / aw) * wantW;
    wp.xyz = ctr + perp + axis * along;
    vWorldPos = wp.xyz;
  #endif

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
uniform float uRampLo;
uniform float uRampHi;
uniform float uModel;
uniform float uSkyDrop;
uniform float uTime;
uniform float uShimmer;

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
  float sky = 1.0 - uSkyDrop * clamp(-n.y, 0.0, 1.0);
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
  //
  // And the WIDTH of that band is per material, because terrain and a boy are
  // not the same problem. A canyon wall is a gently curving loft: with the band
  // 0.38 wide in n·l the terminator took metres of wall to cross, so the near
  // cliff rendered as a soft orange-to-grey airbrush with the facets buried
  // under it — the exact opposite of "flat shading exposes bad forms". On
  // terrain the band is nearly closed and the facets carry the form. On a boy's
  // head and a dog's barrel — a hand-sized curve out of a dozen polygons — a
  // closed band cuts a hard line across the curve and turns the crown into a
  // hat brim and the flank into a saddle patch, so those keep a soft one.
  float l = dot(n, uSunDir);
  float t = smoothstep(uRampLo, uRampHi, l);

  // baked terrain shadow: a surface the sun cannot see falls to its shade value
  // however it happens to be turned
  #ifdef USE_OCC_ATTR
    float occ = max(vOcc, uOcclusion);
  #else
    float occ = uOcclusion;
  #endif
  // A cast shadow only means anything on a surface the sun could otherwise
  // reach. On a face turned away from the sun the ray march is GRAZING — it
  // skims along the surface it started on, over a heightfield of two-metre
  // cells — and what it returns there is not a shadow, it is noise. Under
  // per-face flat shading that noise stopped averaging out and became a mosaic
  // of tan and grey blocks over the whole near cliff, which read as camouflage
  // rather than as rock. Weighting the baked term by how much the face is
  // turned toward the sun costs nothing where shadows matter — the canyon
  // floor faces straight up — and deletes the noise where they never did.
  occ *= smoothstep(0.0, 0.3, l);
  // No sharpening here any more. The baked value is now flat per face and box
  // filtered over that face's footprint, so the edge is already as crisp as the
  // mesh allows; compressing it again only re-binarises the filter's work and
  // brings back the chessboard.
  // A terrain shadow takes a surface most of the way to its shade value, not
  // all the way: the canyon floor in shadow is still limestone dust lit by a
  // whole sky, and crushing it to the shade colour is how a morning turns into
  // an overcast afternoon.
  t = mix(t, t * 0.16, occ);

  vec3 col = mix(shade, base, t);

  // Facet modelling, on the LIT side only.
  //
  // The ramp is deliberately narrow — a surface is either turned toward the key
  // light or it is not — and the consequence nobody had measured is that
  // everything past its upper stop renders one IDENTICAL colour. Once the baked
  // shadow stopped falsely covering the near cliff, that showed: over the near
  // wall in the vista shot every face sits between 0.09 and 0.42 in n.sun, all
  // past the stop, and the whole cliff came out as a single flat sheet with
  // of them past the stop, and the whole cliff came out as a single flat sheet
  // with 91.5% of its pixels within dE 1.8 of #E3C08C and no facet visible
  // anywhere. That is the same airbrush the wide ramp produced, reached from
  // the other end, and it is what left a noise texture as the wall's only
  // variation — which is what read as an applied tiling pattern.
  //
  // So the lit side keeps a little Lambert in it. A surface square to the key
  // light renders its documented hex EXACTLY; one raking across it renders a
  // few percent under. Nothing brightens past the documented value, which is
  // the half of that rule that has to hold.
  float model = mix(1.0 - uModel, 1.0, smoothstep(0.0, 0.5, l));
  col *= mix(1.0, model, t);

  // Contact darkening. Sky visibility, marched once at load: 1 in the open, low
  // where the ground closes in. This is what puts a dark at the feet of the
  // walls and in the narrows, and it is the only thing in a chapter this
  // high-key that reaches the bottom of the value range.
  #ifdef USE_OCC_ATTR
    // Reaches far DOWN and not far OUT. It still bottoms out at 0.6, because
    // measured across the whole set the pictures had no anchor value anywhere
    // and read as fog rather than as a canyon, and the deep places — the wall
    // feet, the narrows, the undersides — are the only ones that can supply one
    // in a chapter this high-key.
    //
    // But its FOOTPRINT was far too wide. With the upper stop out at 0.62 a
    // surface only two thirds open to the sky was still being darkened, which
    // is most of a canyon floor: sampled at the identical screen position in
    // every desktop frame, the same ground material with the same light spanned
    // seventy-one levels, and the nearest foreground of the ford shot sat fifty
    // levels below the documented #EFE3C8 with no shadow edge anywhere to
    // explain it. That is not contact darkening, it is a wash, and it is what
    // lifted the canyon floor up to meet the dog's coat. Contact darkening
    // belongs where the ground actually closes in.
    col *= mix(0.7, 1.0, smoothstep(0.04, 0.3, vAo));
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

  // Water moves. A broad, slow band of light drifting across the surface --
  // metres wide, seconds long -- nothing that could be mistaken for a texture
  // or a reflection. Zero on everything that is not water.
  if (uShimmer > 0.0) {
    float w = sin(vWorldPos.x * 0.85 + vWorldPos.z * 0.35 + uTime * 0.9) *
              sin(vWorldPos.z * 0.7 - vWorldPos.x * 0.25 - uTime * 0.55);
    col *= 1.0 + uShimmer * w;
  }

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
uniform vec3 uSunDir;
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
  /**
   * The lit/shade transition band, in n·sun. Narrow for terrain and props, so
   * the facets do the work; wider for characters, whose curves are only a
   * dozen polygons and shatter into plates under a hard terminator.
   */
  ramp?: [number, number]
  /** Pull the result back toward the unlit base colour. 1 = ignores the light. */
  flatten?: number
  /**
   * How much value a lit face loses as it rakes away from the key light. This
   * is what makes facets visible on the lit side of a narrow ramp; 0 is a flat
   * sheet of the documented hex.
   */
  model?: number
  /** How far an underside falls for seeing no sky. Foliage wants less. */
  skyDrop?: number
  vertexColors?: boolean
  transparent?: boolean
  opacity?: number
  depthWrite?: boolean
  side?: THREE.Side
  /**
   * Never let this object's projected radius fall below this many pixels.
   * The collar, and nothing else.
   */
  minScreenRadiusPx?: number
  /** Object-space center the minimum radius is measured from. */
  minScreenCenter?: [number, number, number]
  /** Object-space axis of the band, for the separate minimum-width floor. */
  minScreenAxis?: [number, number, number]
  /** Half-width floor along that axis, in pixels. */
  minScreenWidthPx?: number
  /** Height in meters below which the world gathers valley haze. */
  hazeFloor?: number
  /** How many meters the haze fades out over, above hazeFloor. */
  hazeDepth?: number
  /** Amplitude of the moving light band. Water only. */
  shimmer?: number
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
      ...(opts.minScreenRadiusPx ? { USE_MIN_SCREEN: '' } : {}),
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
      uRampLo: { value: opts.ramp?.[0] ?? -0.28 },
      uRampHi: { value: opts.ramp?.[1] ?? 0.1 },
      uModel: { value: opts.model ?? 0 },
      uSkyDrop: { value: opts.skyDrop ?? 0.45 },
      uMinScreenCenter: {
        value: new THREE.Vector3(...(opts.minScreenCenter ?? [0, 0, 0])),
      },
      uMinScreenAxis: {
        value: new THREE.Vector3(...(opts.minScreenAxis ?? [0, 1, 0])).normalize(),
      },
      uTime: { value: 0 },
      uShimmer: { value: opts.shimmer ?? 0 },
      uMinScreenPx: { value: opts.minScreenRadiusPx ?? 0 },
      uMinScreenWidthPx: { value: opts.minScreenWidthPx ?? 0.7 },
      // Replaced every frame from the live camera; this is a 55-degree vertical
      // field over a 900 px viewport, which is the desktop shot.
      uPixelAngle: { value: (2 * Math.tan((55 * Math.PI) / 180 / 2)) / 900 },
    },
  })
  // the audit reads this to know which asset a material's color belongs to
  m.name = opts.color ?? 'ramp'
  registry.push(m)
  return m
}

export function makeSkyMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    // pinned to the far plane, so it must not be depth-tested against it
    depthTest: false,
    uniforms: {
      uSkyZenith: { value: lin(CH1.skyZenith.hex) },
      uSkyRim: { value: lin(CH1.skyRim.hex) },
      uSunDir: { value: sunVector() },
    },
  })
  m.name = 'sky'
  // in the registry so a sun edit reaches the sky's glow too
  registry.push(m)
  return m
}

/** Advance the clock every material with motion in it reads. */
export function tickMaterials(seconds: number) {
  for (const m of registry) {
    if (m.uniforms.uTime) m.uniforms.uTime.value = seconds
  }
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

/**
 * Tell the minimum-screen-size materials how big a pixel is. Called once per
 * frame with the live camera, because the collar's floor is in pixels and a
 * portrait phone and a desktop window do not agree on what a pixel subtends.
 */
export function setPixelAngle(fovDeg: number, viewportHeightPx: number) {
  const a = (2 * Math.tan((fovDeg * Math.PI) / 180 / 2)) / Math.max(viewportHeightPx, 1)
  for (const m of registry) {
    if (m.uniforms.uPixelAngle) m.uniforms.uPixelAngle.value = a
  }
}

export function setFog(near: number, far: number) {
  for (const m of registry) {
    if (!m.uniforms.uFogNear) continue
    m.uniforms.uFogNear.value = near
    m.uniforms.uFogFar.value = far
  }
}

export const sunDirection = sunVector
