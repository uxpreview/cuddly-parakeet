import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1600,height:900}})).newPage()
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,600)))
const t0 = Date.now()
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=vista&bare=1', {waitUntil:'load'})
await p.waitForFunction(() => !!window.__art, null, {timeout:300000})
console.log('build ms', Date.now()-t0)
console.log(JSON.stringify(await p.evaluate(() => {
  let tris = 0, draws = 0
  window.__art.group.traverse(o => {
    if (!o.geometry) return
    draws++
    const c = o.geometry.attributes.position.count
    tris += (o.count ?? 1) * c / 3
  })
  return { draws, tris: Math.round(tris) }
})))
await b.close()
