// Palette fidelity check. "Colours that drift from the documented palette
// hexes" is a Gate 2 failure, so it should be measured rather than eyeballed.
//
// Renders a shot, histograms the frame, and for every colour covering more than
// a threshold share of the pixels reports the nearest entry in
// src/art/palette.ts and how far it is from it.
//
// A hit is not required to be exact: fog, the ramp's shade side, the grain pass
// and the mottling all move a surface off its albedo on purpose. What this
// catches is a colour that is nowhere near anything the palette declares.
//
//   node tools/palette-check.mjs [shot]

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.BASE ?? 'http://localhost:5174'
const SHOTS = ['hero', 'vista', 'dog-read', 'ford', 'prints', 'town-reveal']
const SHOT = process.argv[2] ?? 'hero'
// This renders a shot live; it does not read a PNG. Passing it a file path used
// to fall through to the default shot and report numbers for the wrong frame,
// which is exactly the kind of "measured" number that is worse than no number.
if (!SHOTS.includes(SHOT)) {
  console.error(`unknown shot ${JSON.stringify(SHOT)}; expected one of ${SHOTS.join(', ')}`)
  process.exit(2)
}

const paletteSrc = readFileSync(join(ROOT, 'src/art/palette.ts'), 'utf8')
const PALETTE = [...paletteSrc.matchAll(/c\('([^']+)',\s*'(#[0-9A-Fa-f]{6})'\)/g)].map((m) => ({
  id: m[1],
  hex: m[2].toUpperCase(),
  rgb: [
    parseInt(m[2].slice(1, 3), 16),
    parseInt(m[2].slice(3, 5), 16),
    parseInt(m[2].slice(5, 7), 16),
  ],
}))

const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await (await browser.newContext({ viewport: { width: 1200, height: 675 } })).newPage()
await page.goto(`${BASE}/?scene=art-bible&shot=${SHOT}&bare=1`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__artShot, null, { timeout: 40000 })
await page.waitForTimeout(600)

const hist = await page.evaluate(() => {
  const cv = document.querySelector('canvas')
  const c2 = document.createElement('canvas')
  c2.width = cv.width
  c2.height = cv.height
  const ctx = c2.getContext('2d')
  ctx.drawImage(cv, 0, 0)
  const d = ctx.getImageData(0, 0, c2.width, c2.height).data
  // quantise to 4-unit bins so the grain pass does not shatter the histogram
  const bins = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 2) << 16) | ((d[i + 1] >> 2) << 8) | (d[i + 2] >> 2)
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  const total = d.length / 4
  return { total, bins: [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 900) }
})
await browser.close()

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

console.log(`palette check — shot "${SHOT}", ${hist.total} pixels`)
console.log('share  colour     nearest palette entry            distance')
let worst = 0
for (const [key, n] of hist.bins.slice(0, 24)) {
  const share = n / hist.total
  if (share < 0.004) continue
  const rgb = [((key >> 16) & 63) * 4 + 2, ((key >> 8) & 63) * 4 + 2, (key & 63) * 4 + 2]
  let best = null
  for (const p of PALETTE) {
    const dd = dist(rgb, p.rgb)
    if (!best || dd < best.d) best = { ...p, d: dd }
  }
  const hex =
    '#' + rgb.map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('').toUpperCase()
  if (share > 0.01 && best.d > worst) worst = best.d
  console.log(
    `${(share * 100).toFixed(1).padStart(5)}%  ${hex}    ${best.id.padEnd(24)} ${best.hex}  ${best.d.toFixed(0)}`,
  )
}
console.log(`\nlargest distance from a documented hex, over regions >1% of frame: ${worst.toFixed(0)}`)

// Per-hex coverage. The "largest distance" number above can be satisfied by
// deleting half the palette — if every stone surface lands on the shadow hex,
// nothing is far from anything and the chapter has still lost its warm value.
// So report how much of the frame each documented hex actually occupies.
console.log('\nper-hex coverage (share of frame within 10 and within 30 of each hex)')
const rows = PALETTE.map((p) => {
  let near = 0
  let wide = 0
  for (const [key, n] of hist.bins) {
    const rgb = [((key >> 16) & 63) * 4 + 2, ((key >> 8) & 63) * 4 + 2, (key & 63) * 4 + 2]
    const d = dist(rgb, p.rgb)
    if (d <= 10) near += n
    if (d <= 30) wide += n
  }
  return { id: p.id, hex: p.hex, near: near / hist.total, wide: wide / hist.total }
})
for (const r of rows.sort((a, b) => b.wide - a.wide)) {
  if (r.wide < 0.002) continue
  console.log(
    `  ${r.id.padEnd(22)} ${r.hex}  <=10: ${(r.near * 100).toFixed(1).padStart(5)}%   <=30: ${(r.wide * 100).toFixed(1).padStart(5)}%`,
  )
}
