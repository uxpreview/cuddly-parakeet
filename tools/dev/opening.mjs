// Opening beat under the stepped recorder: the dog at heel, the stare, the bolt.
import { chromium } from 'playwright'
const OUT = '/tmp/claude-0/-home-user-cuddly-parakeet/a784685b-8a68-57e7-b104-3edba7e4b445/scratchpad/shots'
const VIEW = process.env.VIEW ?? 'desktop'
const vp = VIEW === 'portrait' ? { width: 390, height: 844, dsf: 2, mobile: true } : { width: 1120, height: 630, dsf: 1, mobile: false }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf, hasTouch: vp.mobile, isMobile: vp.mobile })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)) })
await p.goto('' + (process.env.BASE ?? 'http://127.0.0.1:5174') + '/?rec=7&dev=1' + (process.env.Q ?? ''), { waitUntil: 'load' })
await p.waitForFunction(() => window.__rec && window.__rec.ready(), null, { timeout: 60000 })
const call = (m, ...a) => p.evaluate(([m, a]) => window.__rec[m](...a), [m, a])
// Playwright's capture stalls after a few hundred stepped frames under
// swiftshader; the canvas keeps its drawing buffer while recording, so read it.
import { writeFileSync } from 'node:fs'
const snap = async (path) => {
  const data = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'))
}
const run = (sec) => call('frame', Math.round(sec * 60), 1000 / 60)
const brief = (pr) => ({ t: pr.t, boy: pr.player.pos.map((v) => +v.toFixed(1)), speed: pr.player.speed, dog: pr.dog.pos.map((v) => +v.toFixed(1)), act: pr.dog.activity, node: pr.dog.node, dist: +Math.hypot(pr.player.pos[0] - pr.dog.pos[0], pr.player.pos[2] - pr.dog.pos[2]).toFixed(2) })
await run(0.5)
await snap(`${OUT}/open-${VIEW}-0.png`)
console.log(JSON.stringify(brief(await run(0.1))))
// walk up-canyon for 8 s with the dog at heel
await call('steer', 'route', 5)
for (let i = 0; i < 4; i++) console.log('walk', JSON.stringify(brief(await run(2))))
await snap(`${OUT}/open-${VIEW}-1-heel.png`)
await call('whistle')
console.log('whistle', JSON.stringify(brief(await run(1.4))))
await snap(`${OUT}/open-${VIEW}-1b-answer.png`)
await call('steer', 'stop')
for (let i = 0; i < 3; i++) console.log('still', JSON.stringify(brief(await run(2))))
await snap(`${OUT}/open-${VIEW}-1c-still.png`)
// the wait releases at t=30
let shotStare = false, shotBolt = false
let prev = null
for (let i = 0; i < 200; i++) {
  const s = brief(await run(0.1))
  if (prev) { const jump = Math.hypot(s.dog[0]-prev.dog[0], s.dog[2]-prev.dog[2]); if (jump > 0.35) console.log('JUMP', jump.toFixed(2), JSON.stringify(s)) }
  prev = s
  if (s.act === 'stare' && !shotStare) { shotStare = true; console.log('stare', JSON.stringify(s)); await snap(`${OUT}/open-${VIEW}-2-stare.png`) }
  if (s.act === 'trot') { if (i % 5 === 0) console.log('trot', JSON.stringify(s)); if (s.dist > 7 && !shotBolt) { shotBolt = true; await snap(`${OUT}/open-${VIEW}-3-bolt.png`); break } }
}
console.log('errors', errs.length, errs.slice(0, 5))
await b.close()
