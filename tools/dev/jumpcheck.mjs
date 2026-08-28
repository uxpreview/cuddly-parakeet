// Does the dog ever move discontinuously ON SCREEN?
//
// game-design.md: "He only teleports while fully occluded, never on screen." The
// beside-the-route wait broke that -- he was placed 0.95 m aside and the next
// node read route.pointAt(), so advance() snapped him back in one frame: 44 px
// sideways on a dog 34 px tall, in the open. This walks a take and reports the
// worst single-frame movement, in metres and in pixels of his own body height.
//
//   node tools/dev/jumpcheck.mjs <take>

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED, TAKES } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const take = TAKES.find((t) => t.id === (process.argv[2] ?? 'ford'))
if (!take) throw new Error('unknown take')
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
const frames = Math.round(take.seconds * take.fps)
const sub = Math.max(1, Math.round(HZ / take.fps))
let prev = null
let worstM = 0
let worstPx = 0
let atT = 0
const jumps = []
for (let f = 0; f < frames; f++) {
  const t = f / take.fps
  while (pending.length && pending[0][0] <= t) {
    const [, m, ...a] = pending.shift()
    await call(m, ...a)
  }
  const p = await call('frame', sub, 1000 / HZ)
  if (p.staged) { prev = p; continue } // a harness teleport is not a game frame
  if (prev) {
    const d = Math.hypot(p.dog.pos[0] - prev.dog.pos[0], p.dog.pos[2] - prev.dog.pos[2])
    const px = Math.hypot(p.dogScreen[0] - prev.dogScreen[0], p.dogScreen[1] - prev.dogScreen[1])
    if (d > worstM) { worstM = d; worstPx = px; atT = t }
    // anything past a brisk trot in one captured frame is a jump, not a stride
    if (d > (3.4 * sub) / HZ + 0.02) jumps.push({ t, d, px, h: p.dogScreen[2] })
  }
  prev = p
}
console.log(
  `${take.id}: worst single-frame move ${(worstM * 100).toFixed(1)} cm (${worstPx.toFixed(0)} px) at t=${atT.toFixed(2)}s`,
)
console.log(jumps.length ? `  ${jumps.length} DISCONTINUITIES:` : '  no discontinuities')
for (const j of jumps.slice(0, 8))
  console.log(`   t=${j.t.toFixed(2)}s  ${(j.d * 100).toFixed(1)} cm  ${j.px.toFixed(0)} px on a ${j.h} px dog`)
await b.close()
