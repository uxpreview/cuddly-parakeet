import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1200,height:700}})).newPage()
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,600)))
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=hero&bare=1', {waitUntil:'load'})
await p.waitForTimeout(3000)
console.log(JSON.stringify(await p.evaluate(() => {
  const a = window.__art
  if (!a) return {err:'no __art'}
  const out = []
  a.group.traverse(o => {
    if (!o.isMesh) return
    o.geometry.computeBoundingBox()
    const bb = o.geometry.boundingBox
    out.push({
      type: o.type,
      count: o.geometry.attributes.position.count,
      mat: o.material.name,
      side: o.material.side,
      visible: o.visible,
      bb: bb ? [bb.min.toArray().map(v=>+v.toFixed(1)), bb.max.toArray().map(v=>+v.toFixed(1))] : null,
    })
  })
  return out
}), null, 1))
await b.close()
