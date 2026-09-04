// How many pixels the whistle answer's birds actually put on screen, and where.
//
// The correlate has to be legible with sound off, and the way the first pass
// failed was not "no birds" but "birds drawn in the colour of what is behind
// them": the frame's pine-hex count went from 88 at rest to 135 at peak and
// that was the entire visible answer. So this counts pixels near the BIRD hex
// and reports the count and bounding box per frame, against the same count on
// frames before the answer as a baseline.
//
//   node tools/dev/cuepixels.mjs <frameDir> <hex> <f0> <f1>

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [dir, hex, a, b2] = process.argv.slice(2)
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const rgb = [1, 3, 5].map((i) => parseInt(hex.replace('#', '').slice(i - 1, i + 1), 16))

const br = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await br.newContext()).newPage()

console.log(`near ${hex} (${rgb.join(',')}), tolerance 30 per channel`)
console.log('  frame   px    bbox (x0,y0)-(x1,y1)')
for (let f = +a; f <= +b2; f++) {
  const data =
    'data:image/jpeg;base64,' +
    readFileSync(join(dir, `${String(f).padStart(4, '0')}.jpg`)).toString('base64')
  const r = await p.evaluate(
    async ({ data, rgb }) => {
      const im = new Image()
      im.src = data
      await im.decode()
      const c = document.createElement('canvas')
      c.width = im.width
      c.height = im.height
      const x = c.getContext('2d')
      x.drawImage(im, 0, 0)
      const d = x.getImageData(0, 0, im.width, im.height).data
      let n = 0
      let x0 = 1e9
      let y0 = 1e9
      let x1 = -1
      let y1 = -1
      for (let i = 0; i < d.length; i += 4) {
        if (
          Math.abs(d[i] - rgb[0]) > 30 ||
          Math.abs(d[i + 1] - rgb[1]) > 30 ||
          Math.abs(d[i + 2] - rgb[2]) > 30
        )
          continue
        n++
        const px = (i / 4) % im.width
        const py = Math.floor(i / 4 / im.width)
        if (px < x0) x0 = px
        if (py < y0) y0 = py
        if (px > x1) x1 = px
        if (py > y1) y1 = py
      }
      return { n, x0, y0, x1, y1 }
    },
    { data, rgb },
  )
  console.log(
    `  ${String(f).padStart(5)}  ${String(r.n).padStart(4)}  ${r.n ? `(${r.x0},${r.y0})-(${r.x1},${r.y1})` : '-'}`,
  )
}
await br.close()
