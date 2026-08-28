// The settle, measured: walk him up to speed, release the stick, and watch the
// height the CAMERA frames on. A step in `support` with the boy at rest is a
// jolt the player sees as the world twitching, and there was an 8 px one right
// inside the beat that exists to prove he comes to rest.
//
//   node tools/dev/settle.mjs [node]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const NODE = Number(process.argv[2] ?? 1)
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
await call('framed', false)
await call('placeAtNode', NODE, 0)
await call('steer', 'route', 6)
for (let i = 0; i < 180; i++) await call('step', 1000 / HZ)

const rows = []
for (let f = 0; f < 240; f++) {
  if (f === 30) await call('steer', 'stop')
  rows.push(await call('frame', 1, 1000 / HZ))
}

let worst = 0
let worstAt = null
let worstRest = 0
let worstRestAt = null
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1].boyY
  const c = rows[i].boyY
  if (!a || !c) continue
  const d = Math.abs(c.support - a.support) * 1000
  if (d > worst) {
    worst = d
    worstAt = rows[i]
  }
  if (rows[i].player.speed < 0.05 && d > worstRest) {
    worstRest = d
    worstRestAt = rows[i]
  }
}
console.log(`worst support step, any time : ${worst.toFixed(1)} mm at t=${worstAt?.t.toFixed(2)}s (speed ${worstAt?.player.speed.toFixed(2)})`)
console.log(
  worstRestAt
    ? `worst support step, at rest  : ${worstRest.toFixed(1)} mm at t=${worstRestAt.t.toFixed(2)}s`
    : 'worst support step, at rest  : he never came to rest',
)
const rest = rows.filter((r) => r.player.speed < 0.05 && r.boyY)
if (rest.length) {
  const ys = rest.map((r) => r.boyY.support)
  console.log(
    `at rest: ${rest.length} frames, support range ${((Math.max(...ys) - Math.min(...ys)) * 1000).toFixed(1)} mm, planted ${[...new Set(rest.map((r) => r.boyY.planted))].join('/')}`,
  )
}
{
  const rest = rows.filter((r) => r.player.speed < 0.05 && r.boyY)
  console.log('\n  the rest period, every 10th frame:')
  console.log('  t      support   planted  feetY(L,R)   plant(L,R)')
  for (let i = 0; i < rest.length; i += 10) {
    const r = rest[i]
    const f = r.boyFeet
    console.log(
      `  ${r.t.toFixed(2)}  ${r.boyY.support.toFixed(4)}  ${r.boyY.planted}  ` +
        `${f.L[1].toFixed(3)},${f.R[1].toFixed(3)}  ${f.plantL},${f.plantR}`,
    )
  }
}
// The frames around the worst step, so the cause is visible and not guessed at.
const wi = rows.findIndex((r) => r === worstAt)
if (wi > 0) {
  console.log('\n  t      speed  support   dip   planted  feetY(L,R)   plant(L,R)')
  for (let i = Math.max(0, wi - 6); i < Math.min(rows.length, wi + 6); i++) {
    const r = rows[i]
    const f = r.boyFeet
    console.log(
      `  ${r.t.toFixed(2)}  ${r.player.speed.toFixed(2)}  ${r.boyY.support.toFixed(4)}  ${r.boyY.dip.toFixed(3)}  ${r.boyY.planted}  ` +
        `${f.L[1].toFixed(3)},${f.R[1].toFixed(3)}  ${f.plantL},${f.plantR}${i === wi ? '   <-- step' : ''}`,
    )
  }
}
await b.close()
