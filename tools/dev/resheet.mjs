// Rebuild the contact sheets for takes already recorded, from the frames and
// the probe JSON on disk. No dev server, no simulation, no re-record: this only
// re-runs tools/sheets.mjs, for when the sheet builder itself changes.
//
//   node tools/dev/resheet.mjs renders/g3-01
//   node tools/dev/resheet.mjs renders/g3-01 walk-desktop

import { chromium } from 'playwright'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeSheets } from '../sheets.mjs'
import { TAKES, VIEWPORTS } from '../takes.mjs'

const OUT = process.argv[2] ?? 'renders/g3-latest'
const ONLY = process.argv.slice(3)
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'

const names = readdirSync(join(OUT, 'frames')).filter((n) => !ONLY.length || ONLY.includes(n))
if (!names.length) throw new Error(`no takes under ${OUT}/frames`)

const browser = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await (await browser.newContext()).newPage()

for (const name of names) {
  const frameDir = join(OUT, 'frames', name)
  const frames = readdirSync(frameDir).filter((f) => f.endsWith('.jpg')).length
  const json = JSON.parse(readFileSync(join(OUT, `${name}.json`), 'utf8'))
  const view = name.slice(name.lastIndexOf('-') + 1)
  const id = name.slice(0, name.lastIndexOf('-'))
  const fps = json.fps ?? TAKES.find((t) => t.id === id)?.fps ?? 30
  const dsf = VIEWPORTS[view]?.dsf ?? 1
  await writeSheets(page, {
    out: OUT,
    name,
    frameDir,
    frames,
    fps,
    probes: json.frames ?? json.probes ?? json,
    dsf,
  })
  console.log(`${name}: ${frames} frames -> sheets`)
}

await browser.close()
