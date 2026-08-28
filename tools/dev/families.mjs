// Which documented value a region of the frame actually lands on.
//
// The Gate 2 failure list has an item for "colours that drift from the
// documented palette hexes", and the verdict measured it as a SHARE: what
// fraction of a sunlit wall sits in the shadow-side family rather than the
// limestone family. This reproduces that measurement so the numbers are
// comparable across iterations.
//
// Every pixel in the rect is assigned to its nearest palette entry in CIELAB,
// and entries whose share is above 1% are reported with the mean dE of the
// pixels assigned to them.
//
//   node tools/dev/families.mjs <shot> <x0> <y0> <x1> <y1> [--portrait]
//   (coordinates are fractions of the frame)

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const portrait = args.includes('--portrait')
const rest = args.filter((a) => !a.startsWith('--'))
const [shot = 'hero', x0 = '0', y0 = '0', x1 = '1', y1 = '1'] = rest

const src = readFileSync(join(ROOT, 'src/art/palette.ts'), 'utf8')
const PALETTE = [...src.matchAll(/c\('([^']+)',\s*'(#[0-9A-Fa-f]{6})'\)/g)].map((m) => ({
  id: m[1],
  hex: m[2].toUpperCase(),
}))

const vp = portrait ? { width: 390, height: 844, dsf: 2 } : { width: 1600, height: 900, dsf: 1 }
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (
  await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf })
).newPage()
await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, { waitUntil: 'load' })
await p.waitForFunction(() => !!window.__artShot, null, { timeout: 60000 })
await p.waitForTimeout(700)

const res = await p.evaluate(
  ({ PALETTE, r }) => {
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : t / 0.1284 + 4 / 29)
    const lab = (R, G, B) => {
      const s = (v) => {
        v /= 255
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      const [rr, gg, bb] = [s(R), s(G), s(B)]
      const X = (0.4124 * rr + 0.3576 * gg + 0.1805 * bb) / 0.9505
      const Y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
      const Z = (0.0193 * rr + 0.1192 * gg + 0.9505 * bb) / 1.089
      return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
    }
    const refs = PALETTE.map((e) => ({
      ...e,
      lab: lab(
        parseInt(e.hex.slice(1, 3), 16),
        parseInt(e.hex.slice(3, 5), 16),
        parseInt(e.hex.slice(5, 7), 16),
      ),
    }))
    const cv = document.querySelector('canvas')
    const c2 = document.createElement('canvas')
    c2.width = cv.width
    c2.height = cv.height
    const ctx = c2.getContext('2d')
    ctx.drawImage(cv, 0, 0)
    const X0 = Math.round(r[0] * cv.width)
    const Y0 = Math.round(r[1] * cv.height)
    const W = Math.max(1, Math.round((r[2] - r[0]) * cv.width))
    const H = Math.max(1, Math.round((r[3] - r[1]) * cv.height))
    const d = ctx.getImageData(X0, Y0, W, H).data
    const tally = new Map()
    let n = 0
    for (let i = 0; i < W * H; i++) {
      const L = lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
      let best = null
      let bd = Infinity
      for (const e of refs) {
        const dd =
          (L[0] - e.lab[0]) ** 2 + (L[1] - e.lab[1]) ** 2 + (L[2] - e.lab[2]) ** 2
        if (dd < bd) {
          bd = dd
          best = e
        }
      }
      const t = tally.get(best.id) ?? { n: 0, de: 0, hex: best.hex }
      t.n++
      t.de += Math.sqrt(bd)
      tally.set(best.id, t)
      n++
    }
    return {
      n,
      rect: [X0, Y0, W, H],
      rows: [...tally.entries()]
        .map(([id, t]) => ({ id, hex: t.hex, share: t.n / n, de: t.de / t.n }))
        .sort((a, b) => b.share - a.share),
    }
  },
  { PALETTE, r: [Number(x0), Number(y0), Number(x1), Number(y1)] },
)

console.log(`${shot}${portrait ? ' portrait' : ''}  rect ${res.rect.join(',')}  ${res.n} px`)
for (const r of res.rows) {
  if (r.share < 0.01) continue
  console.log(
    `  ${(r.share * 100).toFixed(1).padStart(5)}%  ${r.id.padEnd(22)} ${r.hex}  mean dE ${r.de.toFixed(1)}`,
  )
}
await b.close()
