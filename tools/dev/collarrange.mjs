// The collar's size and saturation as a function of RANGE, in the game, through
// the game's own camera.
//
// This is the game's whole search cue and D21 puts a pixel floor on it, so what
// matters is not what it measures in one staged art-bible shot but whether the
// floor still holds at the distances the chapter actually plays at. Gate 3
// stages the dog at 24-29 m; every art-bible viewpoint was inside 18.
//
// Places the boy on the route, holds him still, puts the dog a given number of
// metres ahead, settles, and measures the red cluster in the rendered frame with
// the same predicate as tools/red-audit.mjs and tools/dev/collar.mjs.
//
//   node tools/dev/collarrange.mjs [node] [m ...]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const NODE = Number(process.argv[2] ?? 1)
const RANGES = process.argv.slice(3).map(Number)
const AT = RANGES.length ? RANGES : [6, 10, 14, 18, 22, 26, 30, 36]
const HZ = 60

const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage()
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
await page.goto(`${BASE}/?rec=${SEED}&bare`, { waitUntil: 'load' })
await page.waitForFunction('window.__rec && window.__rec.ready()', null, { timeout: 60000 })

const call = (m, ...a) => page.evaluate(([m, a]) => window.__rec[m](...a), [m, a])

// The same red predicate the audit uses: hue 350-15, sat >= 25%, val >= 20%,
// and the cluster's saturation re-read through a 3 px box blur, which is
// roughly what the eye is given at a glance.
const measure = () =>
  page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const w = cv.width
    const h = cv.height
    const t = document.createElement('canvas')
    t.width = w
    t.height = h
    const x = t.getContext('2d')
    x.drawImage(cv, 0, 0)
    const d = x.getImageData(0, 0, w, h).data
    const isRed = (i) => {
      const r = d[i] / 255
      const g = d[i + 1] / 255
      const bl = d[i + 2] / 255
      const mx = Math.max(r, g, bl)
      const mn = Math.min(r, g, bl)
      if (mx < 0.2) return false
      const s = mx === 0 ? 0 : (mx - mn) / mx
      if (s < 0.25) return false
      let hue
      if (mx === mn) hue = 0
      else if (mx === r) hue = (60 * ((g - bl) / (mx - mn)) + 360) % 360
      else if (mx === g) hue = 60 * ((bl - r) / (mx - mn)) + 120
      else hue = 60 * ((r - g) / (mx - mn)) + 240
      return hue >= 350 || hue <= 15
    }
    let n = 0
    let x0 = 1e9
    let y0 = 1e9
    let x1 = -1
    let y1 = -1
    let satSum = 0
    for (let i = 0; i < d.length; i += 4) {
      if (!isRed(i)) continue
      n++
      const px = (i / 4) % w
      const py = Math.floor(i / 4 / w)
      if (px < x0) x0 = px
      if (py < y0) y0 = py
      if (px > x1) x1 = px
      if (py > y1) y1 = py
      const mx = Math.max(d[i], d[i + 1], d[i + 2])
      const mn = Math.min(d[i], d[i + 1], d[i + 2])
      satSum += mx ? (mx - mn) / mx : 0
    }
    return n
      ? { n, w: x1 - x0 + 1, h: y1 - y0 + 1, sat: satSum / n }
      : { n: 0, w: 0, h: 0, sat: 0 }
  })

await call('step', 1000 / HZ)
await call('framed', false)
await call('steer', 'stop')

console.log('  range   red px   bbox    mean sat   floor 5x5 @21%')
for (const m of AT) {
  await call('placeAtNode', NODE, 0)
  await call('dogTo', NODE, m)
  for (let i = 0; i < 40; i++) await call('step', 1000 / HZ)
  const p = await call('probe')
  const apart = Math.hypot(p.dog.pos[0] - p.player.pos[0], p.dog.pos[2] - p.player.pos[2])
  const r = await measure()
  const ok = r.w >= 5 && r.h >= 5 && r.sat >= 0.21
  console.log(
    `  ${apart.toFixed(1).padStart(5)}m  ${String(r.n).padStart(6)}   ${`${r.w}x${r.h}`.padStart(6)}   ${(r.sat * 100).toFixed(0).padStart(6)}%   ${ok ? 'ok' : 'UNDER'}`,
  )
}
await b.close()
