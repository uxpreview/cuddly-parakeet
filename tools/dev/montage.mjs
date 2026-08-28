// Put a few moments side by side, magnified, so a change over time can be
// LOOKED at rather than only measured.
//
// A contact sheet cell is half size and a whole frame is 960 px wide; neither
// shows what a fifteen-pixel dog is doing. This crops the same window out of
// several frames and blows it up with nearest-neighbour, so what you see is
// what the renderer drew.
//
//   node tools/dev/montage.mjs out.png <scale> "label,file.jpg,cx,cy,w,h" ...
//
// cx,cy is the CENTRE of the crop in source pixels; w,h its size before scaling.
// Every cell must use the same w,h.

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const [outFile, scaleS, ...specs] = process.argv.slice(2)
if (!outFile || !specs.length) {
  console.error('usage: montage.mjs out.png <scale> "label,file,cx,cy,w,h" ...')
  process.exit(1)
}
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'

const items = specs.map((s) => {
  const [label, file, cx, cy, w, h] = s.split(',')
  const ext = file.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
  return {
    label,
    data: `data:image/${ext};base64,` + readFileSync(file).toString('base64'),
    cx: +cx,
    cy: +cy,
    w: +w,
    h: +h,
  }
})

const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext()).newPage()
const url = await p.evaluate(
  async ({ items, scale }) => {
    const cw = items[0].w * scale
    const ch = items[0].h * scale + 18
    const c = document.createElement('canvas')
    c.width = cw * items.length
    c.height = ch
    const x = c.getContext('2d')
    // Magnifying, so nearest-neighbour: this exists to show what was drawn, not
    // a smoothed opinion of it.
    x.imageSmoothingEnabled = false
    x.fillStyle = '#111'
    x.fillRect(0, 0, c.width, c.height)
    for (let k = 0; k < items.length; k++) {
      const it = items[k]
      const img = new Image()
      img.src = it.data
      await img.decode()
      x.drawImage(img, it.cx - it.w / 2, it.cy - it.h / 2, it.w, it.h, k * cw, 0, it.w * scale, it.h * scale)
      x.fillStyle = '#111'
      x.fillRect(k * cw, it.h * scale, cw, 18)
      x.fillStyle = '#fff'
      x.font = '13px monospace'
      x.fillText(it.label, k * cw + 4, it.h * scale + 14)
      x.strokeStyle = '#444'
      x.strokeRect(k * cw + 0.5, 0.5, cw - 1, ch - 1)
    }
    return c.toDataURL('image/png')
  },
  { items, scale: +(scaleS ?? 3) },
)
writeFileSync(outFile, Buffer.from(url.split(',')[1], 'base64'))
console.log('wrote', outFile, `(${items[0].w * +scaleS * items.length}x${items[0].h * +scaleS + 18})`)
await b.close()
