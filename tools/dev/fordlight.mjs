// Is the ford dark because of the light or because of the geometry?
//
// The Gate 1 verdict says the reach reads as underexposure rather than as
// shade, and asks which it is. Underexposure is a whole frame under the
// terminator with no edge in it; shade is a frame with a lit part and a dark
// part and a boundary between them. So: sample the sun occlusion across the
// floor of the reach and report how much of it the key light reaches, and what
// is standing in the way.
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
const [a, b] = [Number(process.argv[2] ?? 80), Number(process.argv[3] ?? 120)]
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const br = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await br.newContext({ viewport: { width: 900, height: 500 } })).newPage()
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)))
const el = process.env.SUNEL ? `&sunEl=${process.env.SUNEL}` : ''
const az = process.env.SUNAZ ? `&sunAz=${process.env.SUNAZ}` : ''
await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=ford&bare=1${el}${az}`, { waitUntil: 'load' })
await p.waitForFunction(() => !!window.__artShot, null, { timeout: 40000 })
const r = await p.evaluate(({ a, b }) => {
  const A = window.__art.art
  const C = window.__game ? null : null
  void C
  const rows = []
  for (let i = a; i <= b; i++) {
    const g = window.__artCenter ? window.__artCenter(i) : null
    void g
    rows.push(i)
  }
  return rows.map((i) => {
    const c = window.__artCenterline[i]
    const lx = Math.sin(c[3])
    const lz = -Math.cos(c[3])
    let lit = 0
    let n = 0
    for (let o = -3; o <= 3; o += 0.75) {
      const x = c[0] + lx * o
      const z = c[2] + lz * o
      const y = A.groundAt(x, z)
      if (y === null) continue
      n++
      if (A.sunOcclusionAt(x, y + 0.9, z) < 0.5) lit++
    }
    return { i, lit, n }
  })
}, { a, b })
let L = 0
let N = 0
for (const q of r) {
  L += q.lit
  N += q.n
}
console.log(`samples ${a}..${b}: ${((100 * L) / N).toFixed(0)}% of the walked floor is in the key light`)
let run = 0
let best = 0
for (const q of r) {
  if (q.lit === 0) {
    run++
    best = Math.max(best, run)
  } else run = 0
}
console.log(`longest unbroken shaded run: ${best} samples (${(best * 1.5).toFixed(0)} m)`)
console.log(r.map((q) => `${q.i}:${q.n ? Math.round((100 * q.lit) / q.n) : '-'}`).join(' '))
await br.close()
