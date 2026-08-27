import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:900,height:600}})).newPage()
p.on('pageerror', e => console.log('[err]', e.message.slice(0,300)))
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=hero&bare=1', {waitUntil:'load'})
await p.waitForFunction(() => !!window.__artShot, null, {timeout: 60000})
await p.waitForTimeout(500)
console.log(JSON.stringify(await p.evaluate(() => {
  const land = window.__art.group.children[0].children[0]
  const occ = land.geometry.attributes.aOcc
  const ao = land.geometry.attributes.aAo
  let hi = 0, sum = 0, aoSum = 0, aoMin = 9
  for (let i = 0; i < occ.count; i++) { const v = occ.getX(i); sum += v; if (v > 0.5) hi++; const a = ao.getX(i); aoSum += a; if (a < aoMin) aoMin = a }
  const u = land.material.uniforms
  return {
    verts: occ.count,
    occMean: +(sum/occ.count).toFixed(3),
    occOver50pct: +(100*hi/occ.count).toFixed(1),
    aoMean: +(aoSum/ao.count).toFixed(3), aoMin: +aoMin.toFixed(3),
    shadeDrop: u.uShadeDrop.value, sunDir: u.uSunDir.value.toArray().map(v=>+v.toFixed(2)),
    fogNear: u.uFogNear.value,
  }
}), null, 1))
await b.close()
