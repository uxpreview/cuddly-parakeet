// What is actually happening to the dog: is he lit, and does he separate?
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1600,height:900}})).newPage()
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,900)))
for (const shot of ['dog-read','hero','ford','town-reveal','prints','vista']) {
  await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, {waitUntil:'load'})
  await p.waitForFunction(() => !!window.__art, null, {timeout:30000})
  await p.waitForTimeout(900)
  const r = await p.evaluate(() => {
    const A = window.__art.art ?? window.__art
    const g = window.__art.group
    const find = (pred) => { let hit=null; g.traverse(o=>{ if(!hit && pred(o)) hit=o }); return hit }
    const dog = g.children.find(c => c.type==='Group' && c.userData.height===0.6)
    const boy = g.children.find(c => c.type==='Group' && c.userData.height && c.userData.height!==0.6)
    const occOf = (o) => o ? o.children.map(m=>m.material?.uniforms?.uOcclusion?.value).filter(v=>v!==undefined) : null
    return {
      dogAt: dog ? [dog.position.x, dog.position.y, dog.position.z].map(v=>+v.toFixed(2)) : null,
      dogOcc: occOf(dog),
      boyOcc: occOf(boy),
      sunAtDog: dog ? +A.sunOcclusionAt(dog.position.x, dog.position.y+0.4, dog.position.z).toFixed(3) : null,
      sunAtBoy: boy ? +A.sunOcclusionAt(boy.position.x, boy.position.y+0.9, boy.position.z).toFixed(3) : null,
    }
  })
  console.log(shot, JSON.stringify(r))
}
await b.close()
