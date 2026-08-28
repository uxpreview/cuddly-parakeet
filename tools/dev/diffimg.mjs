// How much two renders differ, and where. For telling whether a change to the
// terrain actually did anything before writing a commit message claiming it did.
//
//   node tools/dev/diffimg.mjs <a.png> <b.png>

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'

const [fa, fb] = process.argv.slice(2)
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const br = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await br.newContext()).newPage()
const load = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')
const r = await p.evaluate(
  async ({ a, b }) => {
    const get = async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const x = c.getContext('2d')
      x.drawImage(img, 0, 0)
      return { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
    }
    const A = await get(a)
    const B = await get(b)
    if (A.w !== B.w || A.h !== B.h) return { error: 'size mismatch' }
    let n = 0
    let sum = 0
    let mx = 0
    // grain is per-pixel white noise with the same seed in both, so any
    // difference above a couple of levels is the scene changing
    for (let i = 0; i < A.w * A.h; i++) {
      const dl =
        Math.abs(A.d[i * 4] - B.d[i * 4]) +
        Math.abs(A.d[i * 4 + 1] - B.d[i * 4 + 1]) +
        Math.abs(A.d[i * 4 + 2] - B.d[i * 4 + 2])
      if (dl > 6) {
        n++
        sum += dl / 3
        if (dl / 3 > mx) mx = dl / 3
      }
    }
    return { w: A.w, h: A.h, changed: n, share: n / (A.w * A.h), meanDelta: n ? sum / n : 0, maxDelta: mx }
  },
  { a: load(fa), b: load(fb) },
)
console.log(
  r.error ??
    `${r.changed} px changed (${(r.share * 100).toFixed(2)}% of frame), mean ${r.meanDelta.toFixed(1)} L, max ${r.maxDelta.toFixed(0)} L`,
)
await br.close()
