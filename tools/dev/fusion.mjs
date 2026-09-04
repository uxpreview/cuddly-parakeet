// Are the two characters composed, or stacked into one shape?
//
// game-design.md asks the framing to bias "toward keeping both of them
// composed" when the dog is visible. The Gate 2 hero shot failed on the dog
// standing on the boy's head, and the follow camera reproduced it: the dog's
// feet came within 0-8 px of the boy's crown across all four takes while his own
// body was 15-30 px tall. This reports the worst frame per take, and how it
// compares with the dog's own height, which is the bar.
//
//   node tools/dev/fusion.mjs <renders dir>     from a recording already on disk
//   node tools/dev/fusion.mjs --live            re-run the takes with no capture

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'renders/g3-latest'
const LIVE = dir === '--live'
const HZ = 60

let live = null
if (LIVE) {
  const { chromium } = await import('playwright')
  const { SEED, TAKES } = await import('../takes.mjs')
  const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
  const b = await chromium.launch({
    executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage()
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
  await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:5174'}/?rec=${SEED}&bare`, {
    waitUntil: 'load',
  })
  await page.waitForFunction('window.__rec && window.__rec.ready()', null, { timeout: 60000 })
  const call = (m, ...a) => page.evaluate(([m, a]) => window.__rec[m](...a), [m, a])
  live = { b, call, TAKES }
}

const runLive = async (id) => {
  const take = live.TAKES.find((t) => t.id === id)
  await live.call('step', 1000 / HZ)
  await live.call('step', 1000 / HZ)
  for (const [m, ...a] of take.setup) await live.call(m, ...a)
  for (let i = 0; i < Math.round(HZ * 0.75); i++) await live.call('step', 1000 / HZ)
  const pending = [...take.at].sort((a, b) => a[0] - b[0])
  const sub = Math.max(1, Math.round(HZ / take.fps))
  const out = []
  for (let f = 0; f < Math.round(take.seconds * take.fps); f++) {
    const t = f / take.fps
    while (pending.length && pending[0][0] <= t) {
      const [, m, ...a] = pending.shift()
      await live.call(m, ...a)
    }
    out.push(await live.call('frame', sub, 1000 / HZ))
  }
  return out
}

console.log('take        box gap   dog body   verdict          at')
for (const t of ['walk', 'nearmiss', 'lookbacks', 'ford']) {
  const f = join(dir, `${t}-desktop.json`)
  if (!LIVE && !existsSync(f)) continue
  const P = LIVE ? await runLive(t) : JSON.parse(readFileSync(f, 'utf8')).probes
  let worst = 1e9
  let at = 0
  let body = 0
  // In --live mode one page runs every take, so the virtual clock accumulates:
  // report time within the take, not since the browser opened.
  const t0 = P.length ? P[0].t : 0
  // What matters is whether the two SHAPES touch, not whether the dog's feet
  // happen to be level with the boy's crown. An earlier version of this measured
  // vertical adjacency and called the frame fused whenever the two were within a
  // body height of each other on either axis -- which flagged frames where they
  // are plainly side by side and separate. Looked at, they read as two
  // characters; the number said otherwise, so the number was wrong.
  //
  // A dog is about half again as long as he is tall; the boy is about half as
  // wide as he is tall. `worst` is the gap between their boxes in pixels,
  // negative where they overlap.
  for (const p of P) {
    if (!p.boyScreen) continue
    const dh = p.dogScreen[2]
    const bh = p.boyScreen[2]
    const d = { x0: p.dogScreen[0] - dh * 0.75, x1: p.dogScreen[0] + dh * 0.75, y0: p.dogScreen[1] - dh, y1: p.dogScreen[1] }
    const b = { x0: p.boyScreen[0] - bh * 0.25, x1: p.boyScreen[0] + bh * 0.25, y0: p.boyScreen[1] - bh, y1: p.boyScreen[1] }
    const gapX = Math.max(d.x0 - b.x1, b.x0 - d.x1)
    const gapY = Math.max(d.y0 - b.y1, b.y0 - d.y1)
    // separated on either axis is separated; overlapping needs both to overlap
    const gap = Math.max(gapX, gapY)
    if (gap < worst) {
      worst = gap
      at = p.t - t0
      body = dh
    }
  }
  // Touching is the failure. A few pixels of clear air is enough to read as two.
  const ok = worst >= 0
  console.log(
    `${t.padEnd(11)} ${worst.toFixed(0).padStart(5)} px  ${String(body).padStart(5)} px   ${(ok ? 'separate' : 'OVERLAP').padEnd(15)} t=${at.toFixed(2)}s`,
  )
}
if (live) await live.b.close()
