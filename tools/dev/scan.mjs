// Scanline analyser for the art bible. Answers the one question the Gate 2
// verdict keeps asking: does a surface break at its polygon edges, or does it
// run a smooth ramp across hundreds of pixels?
//
// A "face boundary" here is a step in luminance between adjacent pixels that is
// bigger than the grain can account for. The grain pass measures 2.2-2.5 L of
// per-pixel white noise, so a single-pixel step is meaningless; the test is a
// step between the MEDIAN of the five pixels either side, which averages the
// grain down to well under a level.
//
//   node tools/dev/scan.mjs <shot> <row-fraction> [x0 x1] [--portrait]
//
// Prints: the run lengths between boundaries, the luminance range inside each
// run, and the largest monotone ramp found. Under flat shading no run should
// carry a long monotone ramp: that is a gradient painted across a facet.

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const portrait = args.includes('--portrait')
const rest = args.filter((a) => !a.startsWith('--'))
const shot = rest[0] ?? 'hero'
const rowFrac = Number(rest[1] ?? 0.66)
const x0f = rest[2] !== undefined ? Number(rest[2]) : 0
const x1f = rest[3] !== undefined ? Number(rest[3]) : 1

const vp = portrait
  ? { width: 390, height: 844, deviceScaleFactor: 2 }
  : { width: 1600, height: 900, deviceScaleFactor: 1 }

const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor })).newPage()
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)))
await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, { waitUntil: 'load' })
await p.waitForFunction(() => !!window.__artShot, null, { timeout: 60000 })
await p.waitForTimeout(700)

const out = await p.evaluate(({ rowFrac, x0f, x1f }) => {
  const cv = document.querySelector('canvas')
  const c2 = document.createElement('canvas')
  c2.width = cv.width
  c2.height = cv.height
  const ctx = c2.getContext('2d')
  ctx.drawImage(cv, 0, 0)
  const y = Math.round(rowFrac * (cv.height - 1))
  const x0 = Math.round(x0f * (cv.width - 1))
  const x1 = Math.round(x1f * (cv.width - 1))
  const d = ctx.getImageData(x0, y, x1 - x0 + 1, 1).data
  const n = x1 - x0 + 1
  const L = new Float64Array(n)
  const hex = []
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], bl = d[i * 4 + 2]
    L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    hex.push([r, g, bl])
  }
  // Grain-immune local level: median of a 13-wide window. The grain measures
  // 2.2-2.5 L of per-pixel white noise, so a 5-wide median still carries about
  // 1.3 L of noise and a two-level test fires on grain alone.
  const HALF = 6
  const med = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const w = []
    for (let k = -HALF; k <= HALF; k++) w.push(L[Math.max(0, Math.min(n - 1, i + k))])
    w.sort((a, b) => a - b)
    med[i] = w[HALF]
  }
  // a boundary is a step bigger than the grain floor between the medians of the
  // windows either side of a gap
  const STEP = 3.0
  const bounds = []
  for (let i = 3; i < n - 3; i++) {
    const before = med[i - 3]
    const after = med[i + 3]
    if (Math.abs(after - before) >= STEP) {
      // keep only the local maximum of the step, so one edge is one boundary
      let peak = true
      for (let k = -2; k <= 2; k++) {
        const j = i + k
        if (j < 3 || j >= n - 3) continue
        if (Math.abs(med[j + 3] - med[j - 3]) > Math.abs(after - before)) peak = false
      }
      if (peak && (bounds.length === 0 || i - bounds[bounds.length - 1] > 3)) bounds.push(i)
    }
  }
  const runs = []
  let s = 0
  for (const bIdx of [...bounds, n - 1]) {
    const a = s
    const bb = bIdx
    if (bb - a >= 3) {
      let lo = Infinity, hi = -Infinity
      for (let i = a; i <= bb; i++) { lo = Math.min(lo, med[i]); hi = Math.max(hi, med[i]) }
      // longest monotone stretch inside the run, and how far it climbs
      let best = 0, bestD = 0, cur = 1, dir = 0, startL = med[a]
      for (let i = a + 1; i <= bb; i++) {
        const dd = Math.sign(med[i] - med[i - 1])
        if (dd === 0 || dd === dir) { cur++ } else { dir = dd; cur = 1; startL = med[i - 1] }
        if (cur > best) { best = cur; bestD = med[i] - startL }
      }
      runs.push({ x: a + x0, len: bb - a, range: +(hi - lo).toFixed(1), mono: best, monoD: +bestD.toFixed(1) })
    }
    s = bIdx
  }
  // largest monotone ramp anywhere on the row, boundaries ignored
  let best = 0, bestD = 0, cur = 1, dir = 0, startL = med[0], bestAt = 0
  for (let i = 1; i < n; i++) {
    const dd = Math.sign(Math.round((med[i] - med[i - 1]) * 4))
    if (dd === 0 || dd === dir) cur++
    else { dir = dd; cur = 1; startL = med[i - 1] }
    if (cur > best) { best = cur; bestD = med[i] - startL; bestAt = i - cur + x0 }
  }
  return {
    y, width: cv.width, height: cv.height, n,
    boundaries: bounds.length,
    runs,
    longestMonotone: { px: best, deltaL: +bestD.toFixed(1), atX: bestAt },
    ends: [hex[0], hex[n - 1]],
    Lends: [+med[0].toFixed(1), +med[n - 1].toFixed(1)],
    // the smoothed profile itself, decimated, so the SHAPE is visible rather
    // than only its summary statistics
    profile: Array.from({ length: Math.floor(n / 16) }, (_, i) => +med[i * 16].toFixed(0)),
  }
}, { rowFrac, x0f, x1f })

console.log(`shot=${shot} ${out.width}x${out.height} row y=${out.y}  x span ${out.n}px`)
console.log(`  L ${out.Lends[0]} -> ${out.Lends[1]}   boundaries found: ${out.boundaries}`)
console.log(`  longest monotone ramp: ${out.longestMonotone.px}px, dL=${out.longestMonotone.deltaL}, from x=${out.longestMonotone.atX}`)
const rs = out.runs
console.log(`  runs (${rs.length}): ` + rs.map((r) => `${r.len}px[range ${r.range}, mono ${r.mono}px/${r.monoD}]`).join(' '))
console.log('  profile (median-13 L, every 16px):')
console.log('   ' + out.profile.join(' '))
const lens = rs.map((r) => r.len).sort((a, b) => a - b)
if (lens.length) {
  console.log(`  run length median ${lens[lens.length >> 1]}  max ${lens[lens.length - 1]}`)
}
await b.close()
