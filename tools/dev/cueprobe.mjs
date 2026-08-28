// Does the whistle's visual correlate actually render, and is it big enough to
// read? Whistle, step through the answer, and print the cue probe frame by
// frame: birds up, puffs up, the widest bird's on-screen span in pixels, and
// the material opacity.
//
// The must-confirm is "the answer arrives with a visual correlate legible with
// sound off". That is a pixel count, not an opinion.
//
// Steps go one page.evaluate at a time, as tools/record.mjs does: r.step()
// advances the R3F frameloop, and the frame does not flush inside a single
// synchronous evaluate block.
//
//   node tools/dev/cueprobe.mjs [routeNode] [dogAheadMetres]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const NODE = Number(process.argv[2] ?? 1)
const AHEAD = Number(process.argv[3] ?? 14)
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
await call('dogTo', NODE, AHEAD)
await call('steer', 'stop')
for (let i = 0; i < 45; i++) await call('step', 1000 / HZ)

await call('whistle')
let answerAt = null
const rows = []
const SHOT = process.env.SHOT
for (let f = 0; f < 260; f++) {
  const p = await call('frame', 1, 1000 / HZ)
  // Save the frame at a fixed lag after the answer, so the cue can be LOOKED at
  // and not only counted. The probe counts geometry it has positioned; whether
  // any of it reached the screen is a different question.
  // The PRESS reads on the boy; the answer reads on the dog. Both have to work
  // with the sound off, so both get a frame.
  if (process.env.PRESSSHOT && f === 24) {
    const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
    ;(await import('node:fs')).writeFileSync(process.env.PRESSSHOT, Buffer.from(png.split(',')[1], 'base64'))
    console.log('wrote', process.env.PRESSSHOT)
  }
  if (SHOT && answerAt !== null && Math.abs(p.t - answerAt - 0.6) < 1 / HZ / 2) {
    const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
    ;(await import('node:fs')).writeFileSync(SHOT, Buffer.from(png.split(',')[1], 'base64'))
    console.log('wrote', SHOT)
  }
  if (p.whistle.answerSeq > 0 && answerAt === null) answerAt = p.t
  rows.push({
    t: p.t,
    since: answerAt === null ? null : p.t - answerAt,
    apart: Math.hypot(p.dog.pos[0] - p.player.pos[0], p.dog.pos[2] - p.player.pos[2]),
    cue: p.cue,
    boyArms: p.boyArms,
  })
}

{
  const pr = rows.slice(0, 60).filter((r) => r.cue !== undefined)
  const A = rows.slice(0, 60).map((r) => r.boyArms).filter(Boolean)
  if (A.length) {
    const aR = A.map((a) => a.acrossR)
    const aL = A.map((a) => a.acrossL)
    console.log(
      `press window: right hand across ${(Math.min(...aR) * 100).toFixed(1)} to ${(Math.max(...aR) * 100).toFixed(1)} cm, left ${(Math.min(...aL) * 100).toFixed(1)} to ${(Math.max(...aL) * 100).toFixed(1)} cm`,
    )
  }
  void pr
}
if (answerAt === null) {
  console.log('the answer never fired')
} else {
  console.log(`answer at t=${answerAt.toFixed(2)}s, dog ${rows[0].apart.toFixed(1)} m away`)
  console.log('  since   birds  puffs   maxPx  opacity')
  const live = rows.filter((r) => r.cue && (r.cue.birds || r.cue.puffs))
  for (let i = 0; i < live.length; i += 8) {
    const r = live[i]
    console.log(
      `  ${r.since.toFixed(2).padStart(5)}  ${String(r.cue.birds).padStart(5)}  ${String(r.cue.puffs).padStart(5)}  ${r.cue.maxPx.toFixed(1).padStart(6)}  ${r.cue.opacity.toFixed(2).padStart(7)}`,
    )
  }
  const peak = live.reduce((a, r) => (r.cue.maxPx > a ? r.cue.maxPx : a), 0)
  console.log(
    `\n  ${live.length} frames with a live cue (${(live.length / HZ).toFixed(2)} s), peak bird span ${peak.toFixed(1)} px`,
  )
}
await b.close()
