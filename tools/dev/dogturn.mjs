// A turntable on the dog. Four views of the actor at a size a human can judge,
// in the chapter's own light, on the chapter's own ground.
//
// Judging a character model through the one gameplay camera that happens to
// frame it is how the previous pass shipped an animal that read as a cat: from
// behind and above, at 34 x 24 px, almost anything reads as almost anything.
// Silhouette is the Gate 2 test, so the silhouette gets its own tool.
//
//   node tools/dev/dogturn.mjs [outdir] [distance]

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? '/tmp/dogturn'
const DIST = Number(process.argv[3] ?? 1.9)
mkdirSync(OUT, { recursive: true })

const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await (await b.newContext({ viewport: { width: 640, height: 560 } })).newPage()
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)))
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=dog-read&dogPose=neutral&bare=1', { waitUntil: 'load' })
await p.waitForFunction(() => !!window.__artShot, null, { timeout: 60000 })
await p.waitForTimeout(600)

// Where he is, and which way his body points, straight from the staged scene.
const at = await p.evaluate(() => {
  const grp = window.__art.group
  const dog = grp.children.find((c) => c.userData?.height === 0.7)
  return { p: [dog.position.x, dog.position.y, dog.position.z], h: dog.rotation.y }
})

// A near-ORTHOGRAPHIC elevation first: a long lens from far back, so the
// proportions in the picture are the proportions in the model. Perspective at
// two metres on a half-metre animal is enough to argue with, and the whole
// point of this tool is to stop arguing about proportion.
const VIEWS = [
  ['elev-side', Math.PI / 2, 0.02, 9, 6],
  ['elev-front', 0.0, 0.02, 9, 6],
  ['side', Math.PI / 2, 0.16, DIST, 34],
  ['front34', 0.7, 0.2, DIST, 34],
  ['rear34', Math.PI + 0.8, 0.24, DIST, 34],
  ['top34', 1.4, 0.62, DIST, 34],
]
for (const [name, rel, pitch, dist, fov] of VIEWS) {
  const a = at.h + rel
  await p.evaluate(
    ({ at, a, pitch, dist, fov }) => {
      const cam = window.__cam
      const hd = dist * Math.cos(pitch)
      cam.position.set(
        at.p[0] + Math.sin(a) * hd,
        at.p[1] + 0.3 + dist * Math.sin(pitch),
        at.p[2] + Math.cos(a) * hd,
      )
      cam.fov = fov
      cam.updateProjectionMatrix()
      cam.lookAt(at.p[0], at.p[1] + 0.3, at.p[2])
    },
    { at, a, pitch, dist, fov },
  )
  await p.waitForTimeout(300)
  const f = join(OUT, `dog-${name}.png`)
  await p.screenshot({ path: f })
  console.log('wrote', f)
}
await b.close()
