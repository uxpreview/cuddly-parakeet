// The collar, measured. This is the game's entire search cue, so its size and
// saturation at range are a standing check rather than an impression.
//
// Finds every cluster inside the red band (hue 350-15, sat >= 25%, val >= 20%)
// in a render, reports its bounding box in pixels, and reports the saturation
// that survives a 3 px box blur — which is roughly what the eye is given at a
// glance in a frame whose median saturation is 11-21%.
//
//   node tools/dev/collar.mjs <png> [more.png ...]

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
    const hsv = (R, G, B) => {
      R /= 255
      G /= 255
      B /= 255
      const mx = Math.max(R, G, B)
      const mn = Math.min(R, G, B)
      const dd = mx - mn
      let h = 0
      if (dd > 1e-6) {
        if (mx === R) h = ((G - B) / dd) % 6
        else if (mx === G) h = (B - R) / dd + 2
        else h = (R - G) / dd + 4
      }
      h *= 60
      if (h < 0) h += 360
      return [h, mx === 0 ? 0 : dd / mx, mx]
    }
    const red = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) {
      const [h, s, v] = hsv(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
      if ((h >= 350 || h <= 15) && s >= 0.25 && v >= 0.2) red[i] = 1
    }
    // flood fill clusters
    const seen = new Uint8Array(W * H)
    const out = []
    for (let i = 0; i < W * H; i++) {
      if (!red[i] || seen[i]) continue
      const q = [i]
      seen[i] = 1
      let n = 0,
        minx = 1e9,
        miny = 1e9,
        maxx = -1,
        maxy = -1
      while (q.length) {
        const j = q.pop()
        n++
        const jx = j % W
        const jy = (j / W) | 0
        if (jx < minx) minx = jx
        if (jx > maxx) maxx = jx
        if (jy < miny) miny = jy
        if (jy > maxy) maxy = jy
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = jx + dx
          const ny = jy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const k = ny * W + nx
          if (red[k] && !seen[k]) {
            seen[k] = 1
            q.push(k)
          }
        }
      }
      // Saturation surviving a 3 px box blur, sampled at the cluster's most
      // saturated pixel rather than its bounding-box centre. A collar seen from
      // the side is a C, and the centre of a C is the neck inside it.
      let cx = minx
      let cy = miny
      {
        let bestS = -1
        for (let yy = miny; yy <= maxy; yy++)
          for (let xx = minx; xx <= maxx; xx++) {
            const k = yy * W + xx
            if (!red[k]) continue
            const s2 = hsv(d[k * 4], d[k * 4 + 1], d[k * 4 + 2])[1]
            if (s2 > bestS) {
              bestS = s2
              cx = xx
              cy = yy
            }
          }
      }
      let sr = 0,
        sg = 0,
        sb = 0,
        cnt = 0
      for (let yy = cy - 1; yy <= cy + 1; yy++)
        for (let xx = cx - 1; xx <= cx + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const k = (yy * W + xx) * 4
          sr += d[k]
          sg += d[k + 1]
          sb += d[k + 2]
          cnt++
        }
      const [bh, bs] = hsv(sr / cnt, sg / cnt, sb / cnt)
      out.push({
        px: n,
        box: [minx, miny, maxx - minx + 1, maxy - miny + 1],
        blurHue: +bh.toFixed(0),
        blurSat: +(bs * 100).toFixed(0),
      })
    }
    out.sort((a, b2) => b2.px - a.px)
    return { W, H, clusters: out }
  }, data)
  const name = f.split('/').slice(-2).join('/')
  if (!r.clusters.length) {
    console.log(`${name}  ${r.W}x${r.H}  NO RED FOUND`)
    continue
  }
  console.log(
    `${name}  ${r.W}x${r.H}  ${r.clusters.length} red cluster(s): ` +
      r.clusters
        .map(
          (c) =>
            `${c.px}px at (${c.box[0]},${c.box[1]}) ${c.box[2]}x${c.box[3]}, blurred hue ${c.blurHue} sat ${c.blurSat}%`,
        )
        .join(' | '),
  )
}
await b.close()
