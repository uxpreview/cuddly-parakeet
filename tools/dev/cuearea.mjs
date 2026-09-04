// How much of the screen the whistle's visual correlate actually occupies.
//
// The answer is birds and dust at the dog's position, and the whole must-confirm
// is that it is legible with sound off. At the ranges this chapter answers from,
// the dog is sixteen pixels tall, so "legible" is a measurement, not an opinion.
//
// The camera is following the boy, so a raw frame diff is all camera motion.
// This diffs across a short baseline inside a box around the dog, and reports a
// CONTROL diff over the same baseline just before the answer, so the cue's
// footprint can be read against the noise floor it has to beat.
//
//   node tools/dev/cuearea.mjs <frameDir> <box cx,cy,w,h> <baseline> <f...>

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [dir, boxS, baseS, ...frames] = process.argv.slice(2)
const [cx, cy, bw, bh] = boxS.split(',').map(Number)
const base = Number(baseS)
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const jpg = (f) =>
  'data:image/jpeg;base64,' +
  readFileSync(join(dir, `${String(f).padStart(4, '0')}.jpg`)).toString('base64')

const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext()).newPage()

console.log(`box ${bw}x${bh} at (${cx},${cy}), baseline ${base} frames`)
console.log('  frame    px>24   px>48    peak   bbox')
for (const f of frames) {
  const n = Number(f)
  const r = await p.evaluate(
    async ({ a, c, cx, cy, bw, bh }) => {
      const grab = async (s) => {
        const i = new Image()
        i.src = s
        await i.decode()
        const k = document.createElement('canvas')
        k.width = bw
        k.height = bh
        const x = k.getContext('2d')
        x.drawImage(i, cx - bw / 2, cy - bh / 2, bw, bh, 0, 0, bw, bh)
        return x.getImageData(0, 0, bw, bh).data
      }
      const [A, C] = await Promise.all([grab(a), grab(c)])
      let n24 = 0
      let n48 = 0
      let peak = 0
      let x0 = 1e9
      let y0 = 1e9
      let x1 = -1
      let y1 = -1
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(
          Math.abs(A[i] - C[i]),
          Math.abs(A[i + 1] - C[i + 1]),
          Math.abs(A[i + 2] - C[i + 2]),
        )
        if (d > peak) peak = d
        if (d > 24) {
          n24++
          const px = (i / 4) % bw
          const py = Math.floor(i / 4 / bw)
          if (px < x0) x0 = px
          if (py < y0) y0 = py
          if (px > x1) x1 = px
          if (py > y1) y1 = py
        }
        if (d > 48) n48++
      }
      return { n24, n48, peak, box: x1 < 0 ? null : [x1 - x0 + 1, y1 - y0 + 1] }
    },
    { a: jpg(n), c: jpg(n - base), cx, cy, bw, bh },
  )
  console.log(
    `  f${String(n).padStart(4)}  ${String(r.n24).padStart(6)}  ${String(r.n48).padStart(6)}  ${String(r.peak).padStart(6)}   ${r.box ? r.box.join('x') : '-'}`,
  )
}
await b.close()
