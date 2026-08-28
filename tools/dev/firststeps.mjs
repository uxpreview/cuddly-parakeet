// The first second after a take is staged, frame by frame.
//
// The gait instrument reports a 293 mm reach error on the boy's LEFT foot at
// t=0.65s in every one of the four takes and nowhere else, which is a transient
// belonging to the staging rather than to the walk. This prints what the feet
// and the support height are actually doing across it.
//
//   node tools/dev/firststeps.mjs [node]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const NODE = Number(process.argv[2] ?? 1)
const OFF = Number(process.argv[3] ?? 0)
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

// exactly what tools/record.mjs does before a take
await call('step', 1000 / HZ)
await call('step', 1000 / HZ)
await call('framed', false)
await call('dogTo', NODE, OFF + 6)
await call('placeAtNode', NODE, OFF)
for (let i = 0; i < Math.round(HZ * 0.75); i++) await call('step', 1000 / HZ)
await call('steer', 'route', 5)

console.log('  t      spd   support   planted  Lsole->Lplant  Rsole->Rplant   (mm)')
for (let f = 0; f < 70; f++) {
  const p = await call('frame', 1, 1000 / HZ)
  const b2 = p.boyFeet
  const dL = Math.hypot(b2.soleL[0] - b2.L[0], b2.soleL[1] - b2.L[1], b2.soleL[2] - b2.L[2]) * 1000
  const dR = Math.hypot(b2.soleR[0] - b2.R[0], b2.soleR[1] - b2.R[1], b2.soleR[2] - b2.R[2]) * 1000
  if (f % 2) continue
  console.log(
    `  ${p.t.toFixed(2)}  ${p.player.speed.toFixed(2)}  ${p.boyY.support.toFixed(4)}  ${p.boyY.planted}  ` +
      `${b2.plantL ? dL.toFixed(0).padStart(9) : '        -'}  ${b2.plantR ? dR.toFixed(0).padStart(9) : '        -'}`,
  )
}
await b.close()
