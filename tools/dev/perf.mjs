// Not a Gate 7 measurement — this is Gate 2 and the budgets are not due yet.
// But it is cheap to know now whether the art terrain has put the scene
// somewhere the Old Town could never come back from.
import { chromium } from 'playwright'
const shot = process.argv[2] ?? 'vista'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1600,height:900}})).newPage()
await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, {waitUntil:'load'})
await p.waitForFunction(() => !!window.__artShot, null, {timeout: 60000})
await p.waitForTimeout(1200)
console.log(shot, JSON.stringify(await p.evaluate(() => {
  const gl = window.__gl
  return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length }
})))
await b.close()
