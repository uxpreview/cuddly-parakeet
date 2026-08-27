import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1200,height:700}})).newPage()
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,800)))
await p.goto('http://127.0.0.1:5174/?scene=art-bible&shot=hero&bare=1', {waitUntil:'load'})
await p.waitForTimeout(2500)
console.log(JSON.stringify(await p.evaluate(async () => {
  const cv = document.querySelector('canvas')
  const c2 = document.createElement('canvas')
  c2.width = cv.width; c2.height = cv.height
  const ctx = c2.getContext('2d')
  ctx.drawImage(cv, 0, 0)
  const px = (x,y) => { const d = ctx.getImageData(Math.round(x*cv.width), Math.round(y*cv.height), 1,1).data; return '#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('') }
  const land = window.__art.group.children[0].children[0]
  return {
    center: px(0.5,0.5), lowerLeft: px(0.2,0.85), top: px(0.5,0.1), right: px(0.85,0.5),
    vc: land.material.vertexColors,
    colAttr: Array.from(land.geometry.attributes.color.array.slice(0,6)),
  }
}), null, 1))
await b.close()
