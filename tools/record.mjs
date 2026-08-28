// The Gate 3 recording harness.
//
// Gate 3 is judged from a recording, and tools/shoot.mjs takes stills. A critic
// loop that compares two takes of a moving character needs those takes to
// differ only where the code differs, so nothing here is left to the browser:
// the frameloop is `never`, the harness steps a fixed timestep, the clock and
// the random stream are seeded (src/game/clock.ts), and the input is a scripted
// timeline (tools/takes.mjs). Same seed, same script, same pixels.
//
//   node tools/record.mjs                       every take, desktop
//   node tools/record.mjs walk nearmiss         named takes
//   VIEW=portrait node tools/record.mjs walk    portrait 19.5:9
//   OUT=renders/g3-02 node tools/record.mjs     write somewhere else
//
// Each take produces, under $OUT:
//   <id>-<view>.webm         the recording
//   <id>-<view>-sheet.png    a contact sheet, for a critic that reads stills
//   <id>-<view>.json         the per-frame probe: positions, activity, gait
//   frames/<id>-<view>/      the frames themselves
//
// Requires a dev server on $BASE (default http://127.0.0.1:5174).

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { SEED, TAKES, VIEWPORTS } from './takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const OUT = process.env.OUT ?? 'renders/g3-latest'
const VIEW = process.env.VIEW ?? 'desktop'
const ONLY = process.argv.slice(2)
const SHEET_COLS = 6
const SHEET_ROWS = 5
// The bundled ffmpeg playwright uses for its own video capture. VP8 in WebM is
// the only codec it carries, which is all a review recording needs.
const FFMPEG = process.env.FFMPEG ?? '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux'
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'

// Simulate at 60 Hz whatever the capture rate is: the gait, the damping and the
// settle are what this gate is about, and stepping them at the video's frame
// rate would be measuring the harness rather than the game.
const SIM_HZ = 60

const vp = VIEWPORTS[VIEW]
if (!vp) throw new Error(`unknown view ${VIEW}; have ${Object.keys(VIEWPORTS).join(', ')}`)
const takes = ONLY.length ? TAKES.filter((t) => ONLY.includes(t.id)) : TAKES
if (!takes.length) throw new Error(`no takes matched ${ONLY.join(', ')}`)

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

const errors = []

for (const take of takes) {
  const name = `${take.id}-${VIEW}`
  const frameDir = join(OUT, 'frames', name)
  rmSync(frameDir, { recursive: true, force: true })
  mkdirSync(frameDir, { recursive: true })

  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`)
  })

  await page.goto(`${BASE}/?rec=${SEED}&bare=1&dev=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__rec && window.__rec.ready(), null, { timeout: 40000 })

  const call = (m, ...a) => page.evaluate(([m, a]) => window.__rec[m](...a), [m, a])

  // Two frames before the setup so the systems have initialised, then the
  // staging, then a settling second the take does not show: a teleport lands
  // the camera rig and the ground snap mid-flight and that is not the beat.
  for (let i = 0; i < 2; i++) await call('step', 1000 / SIM_HZ)
  for (const [m, ...a] of take.setup) await call(m, ...a)
  for (let i = 0; i < Math.round(SIM_HZ * 0.75); i++) await call('step', 1000 / SIM_HZ)

  const substeps = Math.max(1, Math.round(SIM_HZ / take.fps))
  const frames = Math.round(take.seconds * take.fps)
  const pending = [...take.at].sort((a, b) => a[0] - b[0])
  const probes = []
  const t0 = Date.now()

  for (let f = 0; f < frames; f++) {
    const t = f / take.fps
    while (pending.length && pending[0][0] <= t) {
      const [, m, ...a] = pending.shift()
      await call(m, ...a)
    }
    probes.push(await call('frame', substeps, 1000 / SIM_HZ))
    // JPEG, not PNG: the bundled ffmpeg is built with exactly one image
    // decoder (mjpeg) and one image demuxer (image2pipe), so a PNG sequence
    // cannot be fed to it at all. The video is VP8 either way; the stills that
    // get measured are shot separately by tools/shoot.mjs, losslessly.
    await page.screenshot({
      path: join(frameDir, `${String(f).padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 94,
    })
  }

  await ctx.close()
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ take: take.id, view: VIEW, seed: SEED, fps: take.fps, probes }, null, 1))

  // --- encode -------------------------------------------------------------
  const webm = join(OUT, `${name}.webm`)
  const jpegs = Buffer.concat(
    Array.from({ length: frames }, (_, f) =>
      readFileSync(join(frameDir, `${String(f).padStart(4, '0')}.jpg`)),
    ),
  )
  execFileSync(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'mjpeg',
     '-framerate', String(take.fps), '-i', 'pipe:0',
     '-c:v', 'libvpx', '-b:v', '4M', '-pix_fmt', 'yuv420p', webm],
    { input: jpegs, stdio: ['pipe', 'inherit', 'inherit'] },
  )

  // --- contact sheets -----------------------------------------------------
  // A critic that reads stills needs the whole take at once, evenly sampled,
  // with each cell labelled by its time so a note can cite a moment. And a
  // second sheet cropped around the DOG, because at the distances this chapter
  // stages him he is twenty pixels tall in the wide one and no judgement about
  // his gait, his tail or his look-backs can be made from that.
  const cells = SHEET_COLS * SHEET_ROWS
  const picks = Array.from({ length: cells }, (_, i) =>
    Math.min(frames - 1, Math.round((i * (frames - 1)) / (cells - 1))),
  )
  const sheetPage = await (await browser.newContext()).newPage()
  const sheet = await sheetPage.evaluate(
    async ({ imgs, cols, rows, labels }) => {
      const loaded = await Promise.all(
        imgs.map(async (src) => {
          const im = new Image()
          im.src = src
          await im.decode()
          return im
        }),
      )
      const w = loaded[0].width
      const h = loaded[0].height
      const scale = Math.min(1, 420 / w)
      const cw = Math.round(w * scale)
      const ch = Math.round(h * scale)
      const pad = 4
      const c = document.createElement('canvas')
      c.width = cols * cw + (cols + 1) * pad
      c.height = rows * (ch + 16) + (rows + 1) * pad
      const x = c.getContext('2d')
      x.fillStyle = '#141414'
      x.fillRect(0, 0, c.width, c.height)
      loaded.forEach((im, i) => {
        const cx = pad + (i % cols) * (cw + pad)
        const cy = pad + Math.floor(i / cols) * (ch + 16 + pad)
        x.drawImage(im, cx, cy, cw, ch)
        x.fillStyle = '#cfcfcf'
        x.font = '12px monospace'
        x.fillText(labels[i], cx + 2, cy + ch + 12)
      })
      return c.toDataURL('image/png')
    },
    {
      imgs: picks.map(
        (f) =>
          'data:image/jpeg;base64,' +
          readFileSync(join(frameDir, `${String(f).padStart(4, '0')}.jpg`)).toString('base64'),
      ),
      cols: SHEET_COLS,
      rows: SHEET_ROWS,
      labels: picks.map((f) => `t=${(f / take.fps).toFixed(2)}s  f${f}`),
    },
  )
  writeFileSync(join(OUT, `${name}-sheet.png`), Buffer.from(sheet.split(',')[1], 'base64'))

  const detail = await sheetPage.evaluate(
    async ({ imgs, cols, rows, labels, boxes, dsf }) => {
      const loaded = await Promise.all(
        imgs.map(async (src) => {
          const im = new Image()
          im.src = src
          await im.decode()
          return im
        }),
      )
      const CW = 300
      const CH = 190
      const pad = 4
      const c = document.createElement('canvas')
      c.width = cols * CW + (cols + 1) * pad
      c.height = rows * (CH + 16) + (rows + 1) * pad
      const x = c.getContext('2d')
      x.imageSmoothingEnabled = false
      x.fillStyle = '#141414'
      x.fillRect(0, 0, c.width, c.height)
      loaded.forEach((im, i) => {
        const cx = pad + (i % cols) * (CW + pad)
        const cy = pad + Math.floor(i / cols) * (CH + 16 + pad)
        // Zoom so the dog is about a third of the cell's height, whatever range
        // he happens to be at, and clamp the crop inside the frame.
        const zoom = Math.max(1, Math.min(9, (CH / 3) / Math.max(4, boxes[i][2])))
        const sw = CW / zoom
        const sh = CH / zoom
        const sx = Math.max(0, Math.min(im.width - sw, boxes[i][0] * dsf - sw / 2))
        const sy = Math.max(0, Math.min(im.height - sh, boxes[i][1] * dsf - sh * 0.55))
        x.drawImage(im, sx, sy, sw, sh, cx, cy, CW, CH)
        x.fillStyle = '#cfcfcf'
        x.font = '12px monospace'
        x.fillText(labels[i], cx + 2, cy + CH + 12)
        x.fillStyle = '#141414'
      })
      return c.toDataURL('image/png')
    },
    {
      imgs: picks.map(
        (f) =>
          'data:image/jpeg;base64,' +
          readFileSync(join(frameDir, `${String(f).padStart(4, '0')}.jpg`)).toString('base64'),
      ),
      cols: SHEET_COLS,
      rows: SHEET_ROWS,
      dsf: vp.dsf,
      boxes: picks.map((f) => probes[f].dogScreen ?? [0, 0, 20]),
      labels: picks.map((f) => {
        const p = probes[f]
        return `${(f / take.fps).toFixed(2)}s ${p.dog.activity}`
      }),
    },
  )
  writeFileSync(join(OUT, `${name}-dog.png`), Buffer.from(detail.split(',')[1], 'base64'))
  await sheetPage.context().close()

  console.log(
    `${name}: ${frames} frames @ ${take.fps}fps (${take.seconds}s), ${((Date.now() - t0) / 1000).toFixed(0)}s wall`,
  )
}

await browser.close()
if (errors.length) {
  console.error('\npage errors:')
  for (const e of errors) console.error(' ', e)
  process.exit(1)
}
