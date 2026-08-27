// The red audit. docs/quality-bar.md, "The red audit":
//
//   An automated script, run at Gates 2, 5, 6 and 7. It scans every material,
//   vertex color and palette constant in the build and FAILS on any color with
//   hue 350 through 15, saturation at or above 25% and value at or above 20%
//   (HSV) that is not on the whitelist. The whitelist is exactly two asset ids:
//   the collar material and the map route line.
//
// "Red belongs to the dog" dies at the prop level if a human has to enforce it
// by eye, so this enforces it instead. It runs in two passes:
//
//   1. SOURCE — every colour literal in src/, tools/ and the chapter data.
//      Catches a hex typed straight into a component, a roof colour that drifted
//      terracotta, a stray tint in a JSON manifest.
//   2. RUNTIME — the live three.js scene: every material's colour uniforms and
//      properties, and every vertex of every `color` attribute actually uploaded
//      to the GPU. Catches what source scanning cannot: a colour arrived at by
//      arithmetic, a tone multiplier that pushed something into the band, a
//      palette entry reached through a variable.
//
// Usage:  node tools/red-audit.mjs            (source pass, plus runtime if a
//                                              dev server is up on $BASE)
//         node tools/red-audit.mjs --source   (source pass only)
//
// Exit code 0 = pass, 1 = fail.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE ?? 'http://localhost:5174'
const SOURCE_ONLY = process.argv.includes('--source')

// --- the rule --------------------------------------------------------------

const HUE_LO = 350
const HUE_HI = 15
const SAT_MIN = 0.25
const VAL_MIN = 0.2

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** True if this colour is red under the documented thresholds. */
function isRed({ h, s, v }) {
  const inBand = h >= HUE_LO || h <= HUE_HI
  return inBand && s >= SAT_MIN && v >= VAL_MIN
}

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16)
  return rgbToHsv(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const fmt = (hsv) =>
  `h=${hsv.h.toFixed(0)} s=${(hsv.s * 100).toFixed(0)}% v=${(hsv.v * 100).toFixed(0)}%`

// --- the whitelist ---------------------------------------------------------
// Read out of the palette rather than hardcoded here, so the audit and the game
// cannot disagree about which two assets are allowed to be red.

const paletteSrc = readFileSync(join(ROOT, 'src/art/palette.ts'), 'utf8')
const WHITELIST = [...paletteSrc.matchAll(/RED_WHITELIST\s*=\s*\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/(\w+)\.(\w+)\.id/g)])
  .map(([, group, key]) => {
    const re = new RegExp(`${key}:\\s*c\\('([^']+)'`, 'm')
    const hit = re.exec(paletteSrc)
    void group
    return hit ? hit[1] : null
  })
  .filter(Boolean)

if (WHITELIST.length !== 2) {
  console.error(
    `red-audit: expected exactly two whitelisted asset ids, found ${WHITELIST.length}.`,
  )
  console.error('The whitelist is the collar material and the map route line. Nothing else.')
  process.exit(1)
}

// Every colour declared in palette.ts, with the asset id it belongs to.
const PALETTE = [...paletteSrc.matchAll(/c\('([^']+)',\s*'(#[0-9A-Fa-f]{6})'\)/g)].map((m) => ({
  id: m[1],
  hex: m[2].toUpperCase(),
}))
const PALETTE_BY_HEX = new Map()
for (const p of PALETTE) {
  if (!PALETTE_BY_HEX.has(p.hex)) PALETTE_BY_HEX.set(p.hex, [])
  PALETTE_BY_HEX.get(p.hex).push(p.id)
}

/** An occurrence is excused only if every asset id claiming that hex is listed. */
function whitelisted(hex, assetIds) {
  const ids = assetIds ?? PALETTE_BY_HEX.get(hex.toUpperCase()) ?? []
  return ids.length > 0 && ids.every((id) => WHITELIST.includes(id))
}

const failures = []
const checked = { source: 0, materials: 0, vertices: 0 }

// --- pass 1: source and chapter data ---------------------------------------

const SCAN_DIRS = ['src', 'tools', 'public/chapters', 'index.html']
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx', '.json', '.html', '.css', '.glsl'])

function walk(p, out = []) {
  if (!existsSync(p)) return out
  const st = statSync(p)
  if (st.isFile()) {
    if (SCAN_EXT.has(extname(p))) out.push(p)
    return out
  }
  for (const name of readdirSync(p)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    walk(join(p, name), out)
  }
  return out
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, n) => {
      for (const m of line.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
        const hex = m[0].toUpperCase()
        checked.source++
        const hsv = hexToHsv(hex)
        if (!isRed(hsv)) continue
        // which asset id, if any, does this literal belong to?
        const own = /c\('([^']+)',\s*'#[0-9A-Fa-f]{6}'\)/.exec(line)
        const ids = own ? [own[1]] : PALETTE_BY_HEX.get(hex)
        if (whitelisted(hex, ids)) continue
        failures.push({
          pass: 'source',
          where: `${rel}:${n + 1}`,
          hex,
          hsv,
          note: ids ? `asset ids: ${ids.join(', ')}` : 'no asset id — unowned colour literal',
        })
      }
    })
  }
}

// --- pass 2: the live scene ------------------------------------------------

let runtimeRan = false
if (!SOURCE_ONLY) {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.warn('red-audit: playwright not installed, skipping the runtime pass')
  }
  if (chromium) {
    const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
    let browser
    try {
      browser = await chromium.launch({
        executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      })
    } catch (e) {
      console.warn('red-audit: could not launch a browser, skipping the runtime pass:', e.message)
    }
    if (browser) {
      const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage()
      try {
        await page.goto(`${BASE}/?scene=art-bible&shot=hero&bare=1`, { waitUntil: 'load' })
        await page.waitForFunction(() => !!window.__artShot, null, { timeout: 40000 })
        await page.waitForTimeout(400)

        const found = await page.evaluate(() => {
          const scene = window.__art?.group
          if (!scene) return null
          const out = { materials: [], vertexColors: [], counted: { materials: 0, vertices: 0 } }
          const seen = new Set()

          // Linear working space -> sRGB, so the audit judges the colour a
          // player would see rather than its internal encoding.
          const toSrgb = (c) =>
            c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055

          const record = (mat, label, r, g, b) => {
            out.materials.push({
              name: mat.name || '(unnamed)',
              label,
              rgb: [toSrgb(r), toSrgb(g), toSrgb(b)],
            })
          }

          const scanMaterial = (mat) => {
            if (!mat || seen.has(mat.uuid)) return
            seen.add(mat.uuid)
            out.counted.materials++
            for (const key of ['color', 'emissive', 'specular', 'sheenColor', 'attenuationColor']) {
              const c = mat[key]
              if (c && typeof c.r === 'number') record(mat, key, c.r, c.g, c.b)
            }
            if (mat.uniforms) {
              for (const [key, u] of Object.entries(mat.uniforms)) {
                const c = u?.value
                if (c && typeof c.r === 'number' && typeof c.g === 'number') {
                  record(mat, key, c.r, c.g, c.b)
                }
              }
            }
          }

          const scanVertexColors = (obj) => {
            const attr = obj.geometry?.attributes?.color
            if (attr) {
              const n = attr.count
              out.counted.vertices += n
              // every vertex, not a sample: one bad rung in one cross-section
              // is exactly the kind of thing an eye-audit misses
              for (let i = 0; i < n; i++) {
                const r = toSrgb(attr.getX(i))
                const g = toSrgb(attr.getY(i))
                const b = toSrgb(attr.getZ(i))
                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const d = max - min
                if (d === 0 || max === 0) continue
                let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
                h *= 60
                if (h < 0) h += 360
                if ((h >= 350 || h <= 15) && d / max >= 0.25 && max >= 0.2) {
                  out.vertexColors.push({
                    name: obj.material?.name || '(unnamed)',
                    object: obj.name || obj.type,
                    index: i,
                    rgb: [r, g, b],
                  })
                  if (out.vertexColors.length > 40) return
                }
              }
            }
            const ic = obj.instanceColor
            if (ic) {
              out.counted.vertices += ic.count
              for (let i = 0; i < ic.count; i++) {
                record(obj.material, 'instanceColor[' + i + ']', ic.getX(i), ic.getY(i), ic.getZ(i))
              }
            }
          }

          scene.traverse((o) => {
            if (!o.material) return
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            for (const m of mats) scanMaterial(m)
            scanVertexColors(o)
          })
          return out
        })

        if (!found) {
          console.warn('red-audit: the scene did not expose itself; runtime pass skipped')
        } else {
          runtimeRan = true
          checked.materials = found.counted.materials
          checked.vertices = found.counted.vertices
          for (const m of found.materials) {
            const hsv = rgbToHsv(...m.rgb)
            if (!isRed(hsv)) continue
            if (WHITELIST.includes(m.name)) continue
            failures.push({
              pass: 'runtime/material',
              where: `material "${m.name}" uniform/property "${m.label}"`,
              hex: '#' + m.rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase(),
              hsv,
              note: 'not a whitelisted asset id',
            })
          }
          for (const v of found.vertexColors) {
            if (WHITELIST.includes(v.name)) continue
            failures.push({
              pass: 'runtime/vertex',
              where: `${v.object} material "${v.name}" vertex ${v.index}`,
              hex: '#' + v.rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase(),
              hsv: rgbToHsv(...v.rgb),
              note: 'not a whitelisted asset id',
            })
          }
        }
      } catch (e) {
        console.warn('red-audit: runtime pass could not run:', e.message)
      }
      await browser.close()
    }
  }
}

// --- report ----------------------------------------------------------------

console.log('red audit — hue 350-15, saturation >= 25%, value >= 20% (HSV)')
console.log(`whitelist: ${WHITELIST.join(', ')}  (exactly two asset ids)`)
console.log(
  `scanned: ${checked.source} colour literals in source and chapter data` +
    (runtimeRan
      ? `, ${checked.materials} live materials, ${checked.vertices} vertex colours`
      : ', runtime pass NOT run'),
)

if (failures.length === 0) {
  console.log(`\nPASS — no red outside the collar.${runtimeRan ? '' : ' (source pass only)'}`)
  process.exit(0)
}

console.log(`\nFAIL — ${failures.length} colour(s) in the red band:\n`)
for (const f of failures.slice(0, 60)) {
  console.log(`  [${f.pass}] ${f.where}`)
  console.log(`      ${f.hex}  ${fmt(f.hsv)}  ${f.note}`)
}
if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`)
process.exit(1)
