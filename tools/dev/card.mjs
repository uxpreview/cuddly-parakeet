// The chapter card's sequence, read from the DOM rather than from screenshots
// (a screenshot under swiftshader takes longer than the card lasts).
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)))
await p.goto((process.env.BASE ?? 'http://127.0.0.1:5174') + '/', { waitUntil: 'commit' })
const t0 = Date.now()
const rows = await p.evaluate(() => new Promise((res) => {
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const h1 = document.querySelector('h1')
    const veil = h1 ? h1.previousElementSibling : null
    const legend = [...document.querySelectorAll('div')].find((d) => d.style.bottom === '20%')
    out.push({
      t: +((performance.now() - t0) / 1000).toFixed(2),
      veil: veil ? +getComputedStyle(veil).opacity : null,
      title: h1 ? +getComputedStyle(h1).opacity : null,
      text: h1 ? h1.textContent : null,
      legend: !!legend,
      frames: window.__game ? null : undefined,
    })
    if (performance.now() - t0 < 12000) setTimeout(tick, 250)
    else res(out)
  }
  tick()
}))
// compress: only rows where something changed
let prev = ''
for (const r of rows) { const k = JSON.stringify([r.veil?.toFixed(1), r.title?.toFixed(1), r.text, r.legend]); if (k !== prev) console.log(JSON.stringify(r)); prev = k }
console.log('wall', Date.now() - t0, 'errors', errs)
await b.close()
