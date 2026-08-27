// Screenshot harness for the art bible. Boots the app in a headless browser,
// parks it on each fixed viewpoint from src/art/shots.ts, and writes a PNG per
// shot at both aspect ratios the game ships in.
//
//   node tools/shoot.mjs                     all shots, both ratios
//   node tools/shoot.mjs hero vista          named shots only
//   OUT=renders/iter-3 node tools/shoot.mjs  write somewhere else
//
// Requires a dev server on $BASE (default http://localhost:5174).

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.BASE ?? 'http://localhost:5174'
const OUT = process.env.OUT ?? 'renders/latest'
const ONLY = process.argv.slice(2)

// desktop 16:9, and a portrait phone at 19.5:9 (iPhone 11 class, the reference
// device named in docs/quality-bar.md)
const VIEWPORTS = [
  { name: 'desktop', width: 1600, height: 900, dsf: 1 },
  { name: 'portrait', width: 390, height: 844, dsf: 2 },
]

const ALL_SHOTS = ['hero', 'vista', 'dog-read', 'ford', 'prints', 'town-reveal']
const shots = ONLY.length ? ONLY : ALL_SHOTS

mkdirSync(OUT, { recursive: true })

// The sandbox ships a Chromium that may not match the npm playwright build, so
// point at the installed one rather than downloading another.
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'

const browser = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

const errors = []
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${vp.name}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`)
  })

  for (const shot of shots) {
    await page.goto(`${BASE}/?scene=art-bible&shot=${shot}&bare=1`, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__artShot, null, { timeout: 30000 })
    // let the first frames settle so nothing is captured mid-upload
    await page.waitForTimeout(700)
    const file = join(OUT, `${shot}-${vp.name}.png`)
    await page.screenshot({ path: file })
    console.log('wrote', file)
  }
  await ctx.close()
}

await browser.close()
if (errors.length) {
  console.error('\npage errors:')
  for (const e of errors) console.error(' ', e)
  process.exit(1)
}
