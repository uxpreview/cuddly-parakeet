// Where the art bible actually puts the two of them, and how far apart they are
// in the frame the shot is composed for.
//
// The Gate 2 verdict's first item handed to Gate 3 was that the hero shot has
// its two characters fused — the dog standing on the boy's head in both aspect
// ratios. That is a staging number, so it gets an instrument rather than an eye.
//
//   node tools/dev/staging.mjs [shot ...]
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const shots = process.argv.slice(2).length ? process.argv.slice(2) : ['hero', 'ford', 'town-reveal']
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
for (const view of [
  { name: 'desktop', width: 1600, height: 900, dsf: 1 },
  { name: 'portrait', width: 390, height: 844, dsf: 2 },
]) {
  const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dsf })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)))
  for (const shot of shots) {
    await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, { waitUntil: 'load' })
    await p.waitForFunction(() => !!window.__artShot, null, { timeout: 40000 })
    const r = await p.evaluate(() => {
      const A = window.__art
      const cam = window.__cam
      const project = (v) => {
        const q = v.clone().project(cam)
        return [Math.round(((q.x + 1) / 2) * window.innerWidth), Math.round(((1 - q.y) / 2) * window.innerHeight)]
      }
      const THREE = A.group.constructor
      void THREE
      const s = A.stage
      const boy = s.boy.at.clone()
      const dog = s.dog.at.clone()
      const boyTop = boy.clone()
      boyTop.y += 1.17
      const dogTop = dog.clone()
      dogTop.y += 0.74
      return {
        boyFoot: project(boy),
        boyCrown: project(boyTop),
        dogFoot: project(dog),
        dogTop: project(dogTop),
        dogPrints: s.dogPrints.length,
        boyPrints: s.boyPrints.length,
        apart: +boy.distanceTo(dog).toFixed(2),
      }
    })
    const gap = Math.abs(r.dogFoot[0] - r.boyCrown[0])
    // do the two silhouettes overlap horizontally, and is the dog stacked on him?
    const stacked = gap < 40 && r.dogFoot[1] < r.boyCrown[1] + 40 && r.dogFoot[1] > r.boyCrown[1] - 120
    console.log(
      `${shot}-${view.name}  boy crown ${r.boyCrown}  dog feet ${r.dogFoot} top ${r.dogTop}  ` +
        `horizontal gap ${gap}px  ${r.apart} m apart  prints ${r.boyPrints}/${r.dogPrints}` +
        (stacked ? '   *** STACKED ***' : ''),
    )
  }
  await ctx.close()
}
await b.close()
