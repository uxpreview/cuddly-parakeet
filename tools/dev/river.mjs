// Where the river's edges actually are, sample by sample.
//
// The water surface is fitted to the bank at runtime — the shoreline is where
// the water level crosses the lofted cross-section — so "is the river the right
// shape" is a question about two numbers per sample, not about a screenshot.
//
//   node tools/dev/river.mjs [fromSample] [toSample]
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
const [a, b] = [Number(process.argv[2] ?? 84), Number(process.argv[3] ?? 118)]
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const br = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await br.newContext({ viewport: { width: 900, height: 500 } })).newPage()
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)))
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=ford&bare=1', { waitUntil: 'load' })
await p.waitForFunction(() => !!window.__artShot, null, { timeout: 40000 })
const rows = await p.evaluate(({ a, b }) => {
  const A = window.__art.art
  const out = []
  for (let i = a; i <= b; i++) {
    const s = A.riverAt ? A.riverAt(i) : null
    out.push({ i, s })
  }
  return out
}, { a, b })
for (const r of rows) {
  if (!r.s) {
    console.log(String(r.i).padStart(4), '  — no water')
    continue
  }
  console.log(
    String(r.i).padStart(4),
    ` leg ${r.s.leg.padEnd(9)} level ${r.s.level.toFixed(2)}  shore ${r.s.left.toFixed(2)} .. ${r.s.right.toFixed(2)} m` +
      `  width ${(r.s.right - r.s.left).toFixed(2)} m  max depth ${r.s.depth.toFixed(2)} m`,
  )
}
await br.close()
