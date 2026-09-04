// Hairline mesh cracks: the SKY showing through a T-junction between two strips
// of the loft that were split into different numbers of sub-faces.
//
// The test used to be "a pixel much less saturated than both its horizontal
// neighbours", which is also a true description of a pale pine trunk between
// two dark canopy pixels — the pine band above the rim was contributing most of
// the count in every frame, and a fix to the mesh could not be told from noise.
// A crack is specifically the sky, so the suspect pixel now has to BE the sky:
// within a small distance of the chapter's sky-to-fog range, with both
// neighbours clearly not.
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
    // The chapter's sky runs #CFE3E0 overhead to #F2DFAE at the rim, and haze
    // carries surfaces toward it. A crack pixel is one of those values with
    // both horizontal neighbours far from them.
    const SKY = [
      [0xcf, 0xe3, 0xe0],
      [0xdc, 0xe8, 0xe4],
      [0xf2, 0xdf, 0xae],
    ]
    const skyness = (i) => {
      const R = d[i * 4]
      const G = d[i * 4 + 1]
      const B = d[i * 4 + 2]
      let best = 1e9
      for (const [r, g, bb] of SKY) {
        const dd = Math.abs(R - r) + Math.abs(G - g) + Math.abs(B - bb)
        if (dd < best) best = dd
      }
      return best
    }
    let n = 0
    const where = []
    for (let y = 1; y < H - 1; y++)
      for (let xx = 1; xx < W - 1; xx++) {
        const i = y * W + xx
        const s = sat(i)
        const l = sat(i - 1)
        const rr = sat(i + 1)
        if (!(l - s > 0.14 && rr - s > 0.14 && l > 0.2 && rr > 0.2)) continue
        // it has to be the sky, and its neighbours have to not be
        if (skyness(i) > 34) continue
        if (skyness(i - 1) < 90 || skyness(i + 1) < 90) continue
        // A crack splits ONE surface, so the colours either side of it are
        // nearly the same. Different colours either side is an edge between two
        // things — the pale ground seen between the boy's legs, say — and it is
        // not what this is looking for.
        const dl =
          Math.abs(d[(i - 1) * 4] - d[(i + 1) * 4]) +
          Math.abs(d[(i - 1) * 4 + 1] - d[(i + 1) * 4 + 1]) +
          Math.abs(d[(i - 1) * 4 + 2] - d[(i + 1) * 4 + 2])
        if (dl > 26) continue
        n++
        if (where.length < 5) where.push([xx, y])
      }
    return { n, where, W, H }
  }, data)
  console.log(
    `${f.split('/').slice(-2).join('/')}  ${r.W}x${r.H}  ${r.n} seam px` +
      (r.where.length ? '  e.g. ' + r.where.map((w) => `(${w[0]},${w[1]})`).join(' ') : ''),
  )
}
await b.close()
