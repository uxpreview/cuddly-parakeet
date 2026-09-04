// Fast look check: teleport along the route and screenshot. OUT, VIEW, POS env.
import { chromium } from 'playwright'
const OUT = process.env.OUT ?? '/tmp/claude-0/-home-user-cuddly-parakeet/a784685b-8a68-57e7-b104-3edba7e4b445/scratchpad/shots'
const VIEW = process.env.VIEW ?? 'desktop'
const POS = (process.env.POS ?? '0,1,3,5,8').split(',').map(Number)
const TAG = process.env.TAG ?? 'x'
const vp = VIEW === 'portrait' ? { width: 390, height: 844, dsf: 2, mobile: true } : { width: 1440, height: 810, dsf: 1, mobile: false }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dsf, hasTouch: vp.mobile, isMobile: vp.mobile })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)) })
await p.goto('' + (process.env.BASE ?? 'http://127.0.0.1:5174') + '/?dev' + (process.env.Q ?? ''), { waitUntil: 'load' })
await p.waitForFunction(() => window.__game && window.__game.world.ready, null, { timeout: 60000 })
await p.waitForTimeout(1200)
for (const d of POS) {
  if (d > 0) { const before = await p.evaluate(() => window.__game.world.player.progress); await p.keyboard.press('Digit' + d); await p.waitForFunction((b) => Math.abs(window.__game.world.player.progress - b) > 5, before, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(2500) }
  if (process.env.WALK) { await p.keyboard.down('KeyW'); await p.waitForTimeout(Number(process.env.WALK)); await p.keyboard.up('KeyW'); await p.waitForTimeout(300) }
  await p.screenshot({ path: `${OUT}/${TAG}-${VIEW}-${d}.png` })
}
console.log('errors', errs.length, errs.slice(0, 5))
await b.close()
