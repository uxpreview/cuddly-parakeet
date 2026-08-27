// The distribution of n-dot-sun over whatever the camera can see in a rect.
//
// "The mottle paints the shadow hex onto sunlit walls" has two possible causes
// and they want different fixes: either the ramp is set so that genuinely lit
// faces still render shade, or the faces are genuinely turned away and the
// relief noise is what turned them. This measures which.
//
//   node tools/dev/normals.mjs <shot> <x0> <y0> <x1> <y1> [grid]

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const [shot = 'vista', x0 = '0', y0 = '0', x1 = '1', y1 = '1', gs = '40'] = process.argv.slice(2)
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

const res = await p.evaluate(
  async ({ r, g }) => {
    const THREE = await import('/node_modules/.vite/deps/three.js?import')
    const cam = window.__cam
    const grp = window.__art.group
    // the same key light the materials were built with
    const land = grp.children[0].children.find((c) => c.material?.name === 'land')
    const sun = land.material.uniforms.uSunDir.value.clone()
    const lo = land.material.uniforms.uRampLo.value
    const hi = land.material.uniforms.uRampHi.value
    const rc = new THREE.Raycaster()
    const ls = []
    const occs = []
    let miss = 0
    for (let iy = 0; iy < g; iy++) {
      for (let ix = 0; ix < g; ix++) {
        const fx = r[0] + ((r[2] - r[0]) * ix) / (g - 1)
        const fy = r[1] + ((r[3] - r[1]) * iy) / (g - 1)
        rc.setFromCamera(new THREE.Vector2(fx * 2 - 1, -(fy * 2 - 1)), cam)
        const h = rc.intersectObject(grp, true)[0]
        if (!h || h.object.material?.name !== 'land') {
          miss++
          continue
        }
        // face normal is object-space here; the land group is unrotated
        ls.push(h.face.normal.dot(sun))
        const A = h.object.geometry.attributes.aOcc
        occs.push(A ? A.getX(h.face.a) : 0)
      }
    }
    ls.sort((a, b) => a - b)
    const q = (t) => (ls.length ? +ls[Math.floor(t * (ls.length - 1))].toFixed(3) : NaN)
    const litFrac = ls.filter((v) => v >= hi).length / (ls.length || 1)
    const shadeFrac = ls.filter((v) => v <= lo).length / (ls.length || 1)
    return {
      hits: ls.length,
      miss,
      ramp: [lo, hi],
      sun: [+sun.x.toFixed(3), +sun.y.toFixed(3), +sun.z.toFixed(3)],
      quantiles: { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) },
      litFrac: +litFrac.toFixed(3),
      shadeFrac: +shadeFrac.toFixed(3),
      bandFrac: +(1 - litFrac - shadeFrac).toFixed(3),
      meanOcc: +(occs.reduce((a, c) => a + c, 0) / (occs.length || 1)).toFixed(3),
    }
  },
  { r: [Number(x0), Number(y0), Number(x1), Number(y1)], g: Number(gs) },
)
console.log(shot, JSON.stringify(res, null, 1))
await b.close()
