import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1600,height:900}})).newPage()
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,600)))
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=ford&bare=1', {waitUntil:'load'})
await p.waitForFunction(() => !!window.__art, null, {timeout:60000})
console.log(await p.evaluate(() => {
  const A = window.__art.art, g = window.__art.group
  const cam = window.__cam
  const out = []
  g.traverse(o => {
    if (!o.isInstancedMesh) return
    let float = 0, tot = 0, worst = 0
    const M = o.instanceMatrix.array
    for (let i = 0; i < o.count; i++) {
      const x = M[i*16+12], y = M[i*16+13], z = M[i*16+14]
      const sc = Math.hypot(M[i*16+0], M[i*16+1], M[i*16+2])
      const gy = A.groundAt(x, z)
      if (gy === null) continue
      tot++
      const d = y - gy
      if (Math.abs(d) > 0.35) { float++; if (Math.abs(d) > Math.abs(worst)) worst = d }
    }
    out.push(`${o.geometry.uuid.slice(0,4)} count=${o.count} placed=${tot} off>0.35m=${float} worst=${worst.toFixed(2)}`)
  })
  return out.join('\n')
}))
await b.close()
