// What is actually under a pixel. Raycasts the art-bible scene along a row and
// reports, per sample: the mesh, the distance, the face normal, and the three
// per-face channels (vertex colour, aShadow, aOcc, aAo) at the hit triangle.
//
// This is the tool for "the floor renders a smooth ramp": if the channels step
// per face but the pixels do not, the gradient is in the shader; if the
// channels themselves ramp, the gradient is in the mesh.
//
//   node tools/dev/pick.mjs <shot> <row-fraction> <x0> <x1> [samples]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const [shot = 'hero', rowF = '0.66', x0f = '0', x1f = '1', nStr = '24'] = process.argv.slice(2)
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)))
await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, { waitUntil: 'load' })
await p.waitForFunction(() => !!window.__artShot, null, { timeout: 60000 })
await p.waitForTimeout(600)

const rows = await p.evaluate(
  async ({ rowF, x0f, x1f, n }) => {
    const THREE = await import('/node_modules/.vite/deps/three.js?import')
    const cam = window.__cam
    const grp = window.__art.group
    const cv = document.querySelector('canvas')
    const c2 = document.createElement('canvas')
    c2.width = cv.width
    c2.height = cv.height
    const ctx = c2.getContext('2d')
    ctx.drawImage(cv, 0, 0)
    const rc = new THREE.Raycaster()
    const out = []
    for (let i = 0; i < n; i++) {
      const fx = x0f + ((x1f - x0f) * i) / (n - 1)
      const ndc = new THREE.Vector2(fx * 2 - 1, -(rowF * 2 - 1))
      rc.setFromCamera(ndc, cam)
      const hits = rc.intersectObject(grp, true).filter((h) => h.object.visible)
      const h = hits[0]
      const px = ctx.getImageData(Math.round(fx * (cv.width - 1)), Math.round(rowF * (cv.height - 1)), 1, 1).data
      const rec = {
        x: Math.round(fx * (cv.width - 1)),
        px: '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join(''),
        L: +(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]).toFixed(1),
      }
      if (h) {
        const g = h.object.geometry
        const a = h.face.a
        rec.obj = h.object.material?.name ?? h.object.name
        rec.dist = +h.distance.toFixed(2)
        rec.face = h.faceIndex
        rec.n = [h.face.normal.x, h.face.normal.y, h.face.normal.z].map((v) => +v.toFixed(2))
        // ALL THREE corners, not just one: the question is whether a face is
        // one colour, and a single-corner sample cannot answer it.
        const idx = [h.face.a, h.face.b, h.face.c]
        const at = (name) => {
          const A = g.attributes[name]
          if (!A) return null
          const v = idx.map((i) =>
            A.itemSize === 3
              ? [A.getX(i), A.getY(i), A.getZ(i)].map((q) => +q.toFixed(3)).join(',')
              : +A.getX(i).toFixed(3),
          )
          return v.every((q) => q === v[0]) ? v[0] : v
        }
        rec.col = at('color')
        rec.aShadow = at('aShadow')
        rec.aOcc = at('aOcc')
        rec.aAo = at('aAo')
      }
      out.push(rec)
    }
    return out
  },
  { rowF: Number(rowF), x0f: Number(x0f), x1f: Number(x1f), n: Number(nStr) },
)

for (const r of rows) {
  console.log(
    `x=${String(r.x).padStart(4)} ${r.px} L=${String(r.L).padStart(5)} ` +
      (r.obj
        ? `${r.obj.padEnd(9)} d=${String(r.dist).padStart(6)} face=${String(r.face).padStart(6)} n=${JSON.stringify(r.n)} occ=${r.aOcc} ao=${r.aAo} col=${JSON.stringify(r.col)}`
        : 'MISS'),
  )
}
await b.close()
