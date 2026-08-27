// Crop and magnify a region of a render, so a detail can be LOOKED at rather
// than only measured. Uses the headless browser's own canvas as the codec.
//
//   node tools/dev/crop.mjs <in.png> <x> <y> <w> <h> [scale] [out.png]

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const [inFile, xs, ys, ws, hs, scaleS = '3', outFile = '/tmp/crop.png'] = process.argv.slice(2)
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext()).newPage()
const data = 'data:image/png;base64,' + readFileSync(inFile).toString('base64')
const out = await p.evaluate(
  async ({ data, x, y, w, h, scale }) => {
    const img = new Image()
    img.src = data
    await img.decode()
    const c = document.createElement('canvas')
    c.width = w * scale
    c.height = h * scale
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale)
    return { url: c.toDataURL('image/png'), src: [img.width, img.height] }
  },
  { data, x: +xs, y: +ys, w: +ws, h: +hs, scale: +scaleS },
)
writeFileSync(outFile, Buffer.from(out.url.split(',')[1], 'base64'))
console.log(`source ${out.src[0]}x${out.src[1]} -> ${outFile} (${+ws}x${+hs} at ${scaleS}x)`)
await b.close()
