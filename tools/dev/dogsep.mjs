// Does the dog separate from the ground he is standing on?
//
// art-direction.md gives the coat as #E5D5BC "so he reads against every palette".
// The raw hexes back that: coat 214.6 L against path #EFE3C8 at 227.6 L, 13 L
// apart. Measured in frame, the critic found 0.0 L at one beat and 3.1 at
// another, on a grain floor of SD 2.1 -- so the LIGHTING is collapsing a real
// palette difference, which is a shading question and not a palette one.
//
// This samples the dog's pixels and a ring of ground around him at the same
// beat and reports both the medians and the dog's own internal spread, because
// a shape with form contrast reads even when its median matches its background.
//
//   node tools/dev/dogsep.mjs <take> <seconds> [more seconds ...]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED, TAKES } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const TAKE = process.argv[2] ?? 'lookbacks'
const AT = process.argv.slice(3).map(Number)
const take = TAKES.find((t) => t.id === TAKE)
if (!take) throw new Error(`unknown take ${TAKE}`)
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

await call('step', 1000 / HZ)
await call('step', 1000 / HZ)
for (const [m, ...a] of take.setup) await call(m, ...a)
for (let i = 0; i < Math.round(HZ * 0.75); i++) await call('step', 1000 / HZ)

const pending = [...take.at].sort((a, b) => a[0] - b[0])
const want = new Set(AT.map((s) => Math.round(s * HZ)))
const frames = Math.round(Math.max(...AT, 1) * HZ) + 2

console.log(`${TAKE}:  t      dog med   ground med   sep     dog p10-p90   dogPx`)
for (let f = 0; f <= frames; f++) {
  const t = f / HZ
  while (pending.length && pending[0][0] <= t) {
    const [, m, ...a] = pending.shift()
    await call(m, ...a)
  }
  const p = await call('frame', 1, 1000 / HZ)
  if (!want.has(f)) continue
  const r = await page.evaluate((box) => {
    const cv = document.querySelector('canvas')
    const c = document.createElement('canvas')
    c.width = cv.width
    c.height = cv.height
    const x = c.getContext('2d')
    x.drawImage(cv, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    const [cx, cy, h] = box
    const dog = []
    const ground = []
    // his own bounding box, and a ring of ground beside him at the same height
    for (let py = Math.max(0, cy - h); py < Math.min(c.height, cy + 2); py++) {
      for (let px = Math.max(0, cx - h); px < Math.min(c.width, cx + h); px++) {
        const i = (py * c.width + px) * 4
        const inDog = Math.abs(px - cx) <= h * 0.45 && py >= cy - h && py <= cy
        if (inDog) dog.push(L(i))
        else if (Math.abs(px - cx) > h * 0.9) ground.push(L(i))
      }
    }
    const med = (a) => {
      if (!a.length) return 0
      a.sort((p, q) => p - q)
      return a[Math.floor(a.length / 2)]
    }
    const pct = (a, q) => (a.length ? a[Math.floor(a.length * q)] : 0)
    dog.sort((p, q) => p - q)
    return { dog: med(dog.slice()), ground: med(ground), p10: pct(dog, 0.1), p90: pct(dog, 0.9) }
  }, p.dogScreen)
  console.log(
    `        ${t.toFixed(2)}   ${r.dog.toFixed(1).padStart(6)}   ${r.ground.toFixed(1).padStart(9)}   ${(r.dog - r.ground).toFixed(1).padStart(5)}   ${r.p10.toFixed(0)}-${r.p90.toFixed(0)}   ${p.dogScreen[2]}px`,
  )
}
await b.close()
