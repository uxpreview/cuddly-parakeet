// How much of the canyon FLOOR the key light actually reaches, per sun angle.
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:800,height:500}})).newPage()
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,600)))
for (const [az, el] of [[15,30],[15,34],[15,38],[15,42],[15,46],[25,38],[25,42]]) {
  await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=hero&bare=1&sunAz=${az}&sunEl=${el}`, {waitUntil:'load'})
  await p.waitForFunction(() => !!window.__art, null, {timeout:40000})
  const r = await p.evaluate(() => {
    const A = window.__art.art, g = window.__art.group
    const dog = g.children.find(c => c.type==='Group' && c.userData.height===0.6)
    // sample the floor along the first 200 m of the canyon centreline
    let full = 0, part = 0, dark = 0, n = 0
    for (let x = 20; x < 220; x += 3) for (let z = -4; z <= 4; z += 2) {
      const gy = A.groundAt(x, z); if (gy === null) continue
      n++
      const o = A.sunOcclusionAt(x, gy + 0.3, z)
      if (o <= 0.01) full++; else if (o < 0.7) part++; else dark++
    }
    return { fullSun: +(full/n).toFixed(2), penumbra: +(part/n).toFixed(2), shadow: +(dark/n).toFixed(2), n,
             dogOcc: dog ? +A.sunOcclusionAt(dog.position.x, dog.position.y+0.4, dog.position.z).toFixed(2) : null }
  })
  console.log(`az=${az} el=${el}`, JSON.stringify(r))
}
await b.close()
