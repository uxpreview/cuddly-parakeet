// One deterministic frame from a NAMED TAKE, at a given second. For looking at
// a beat without paying for the whole take.
//
//   node tools/dev/beat.mjs <takeId> <seconds> <out.png>
//   VIEW=portrait node tools/dev/beat.mjs nearmiss 11 /tmp/nm.png
import { chromium } from 'playwright'
import { existsSync, writeFileSync } from 'node:fs'
import { SEED, TAKES, VIEWPORTS } from '../takes.mjs'

const take = TAKES.find((t) => t.id === (process.argv[2] ?? 'walk'))
if (!take) throw new Error('no such take: ' + process.argv[2])
const at = Number(process.argv[3] ?? 3)
const out = process.argv[4] ?? '/tmp/beat.png'
const vp = VIEWPORTS[process.env.VIEW ?? 'desktop']
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (
  await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf })
).newPage()
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)))
await p.goto(`http://127.0.0.1:5174/?rec=${SEED}&bare=1&dev=1`, { waitUntil: 'load' })
await p.waitForFunction(() => window.__rec && window.__rec.ready(), null, { timeout: 40000 })
const call = (m, ...a) => p.evaluate(([m, a]) => window.__rec[m](...a), [m, a])
for (let i = 0; i < 2; i++) await call('step', 1000 / 60)
for (const [m, ...a] of take.setup) await call(m, ...a)
for (let i = 0; i < 45; i++) await call('step', 1000 / 60)
const pend = [...take.at].sort((x, y) => x[0] - y[0])
let probe = null
for (let f = 0; f < Math.round(at * 60); f++) {
  const t = f / 60
  while (pend.length && pend[0][0] <= t) {
    const [, m, ...a] = pend.shift()
    await call(m, ...a)
  }
  probe = await call('frame', 1, 1000 / 60)
}
console.log(
  `${take.id} t=${at}s  dog ${probe.dog.activity} node ${probe.dog.node}  ` +
    `apart ${Math.hypot(probe.dog.pos[0] - probe.player.pos[0], probe.dog.pos[2] - probe.player.pos[2]).toFixed(1)} m  ` +
    `draws ${probe.perf.drawCalls}`,
)
// Read the canvas directly rather than going through page.screenshot: with
// frameloop 'never' the screenshot path waits on a repaint that never comes and
// intermittently hangs. `preserveDrawingBuffer` is on in record mode for
// exactly this.
const url = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'))
await b.close()
