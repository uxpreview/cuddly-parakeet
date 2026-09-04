// How much standing slack a character's legs actually have.
//
// supportHeight solves the body down until a leg reaches its foot. If the leg
// is exactly as long as the hip is high, the character stands with dead-straight
// knees and ZERO margin: any stance width at all puts the foot out of reach and
// the solver squats. Print the numbers rather than reading them off the rig.
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED } from '../takes.mjs'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage()
await p.goto(`${process.env.BASE ?? 'http://127.0.0.1:5174'}/?rec=${SEED}&bare`, { waitUntil: 'load' })
await p.waitForFunction('window.__rec && window.__rec.ready()', null, { timeout: 60000 })
for (let i = 0; i < 10; i++) await p.evaluate(() => window.__rec.step(16.67))
console.log(await p.evaluate(() => window.__legroom ?? 'Player.tsx did not publish __legroom'))
await b.close()
