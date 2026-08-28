// Hairline mesh cracks. A pixel whose saturation is far below BOTH horizontal
// neighbours is the sky showing through a T-junction between two strips of the
// loft that were split into different numbers of sub-faces.
//
//   node tools/dev/seams.mjs <png> [more.png ...]

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'

const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext()).newPage()
for (const f of process.argv.slice(2)) {
  const data = 'data:image/png;base64,' + readFileSync(f).toString('base64')
  const r = await p.evaluate(async (data) => {
    const img = new Image()
    img.src = data
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const x = c.getContext('2d')
    x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    const W = c.width
    const H = c.height
    const sat = (i) => {
      const R = d[i * 4],
        G = d[i * 4 + 1],
        B = d[i * 4 + 2]
      const mx = Math.max(R, G, B)
      return mx === 0 ? 0 : (mx - Math.min(R, G, B)) / mx
    }
    let n = 0
    const where = []
    for (let y = 1; y < H - 1; y++)
      for (let xx = 1; xx < W - 1; xx++) {
        const i = y * W + xx
        const s = sat(i)
        const l = sat(i - 1)
        const rr = sat(i + 1)
        if (l - s > 0.14 && rr - s > 0.14 && l > 0.2 && rr > 0.2) {
          n++
          if (where.length < 5) where.push([xx, y])
        }
      }
    return { n, where, W, H }
  }, data)
  console.log(
    `${f.split('/').slice(-2).join('/')}  ${r.W}x${r.H}  ${r.n} seam px` +
      (r.where.length ? '  e.g. ' + r.where.map((w) => `(${w[0]},${w[1]})`).join(' ') : ''),
  )
}
await b.close()
