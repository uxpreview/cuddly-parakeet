import { chromium } from 'playwright'
const shot = process.argv[2] ?? 'hero'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1600,height:900}})).newPage()
await p.goto(`http://127.0.0.1:5174/?scene=art-bible&shot=${shot}&bare=1`, {waitUntil:'load'})
await p.waitForFunction(() => !!window.__artShot, null, {timeout: 60000})
await p.waitForTimeout(500)
console.log(await p.evaluate(() => {
  const cv = document.querySelector('canvas')
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height
  const ctx = c2.getContext('2d'); ctx.drawImage(cv, 0, 0)
  const px = (x,y) => { const d = ctx.getImageData(Math.round(x*cv.width), Math.round(y*cv.height),1,1).data
    const [r,g,bl]=[d[0],d[1],d[2]]; const v = Math.max(r,g,bl)/255
    return `#${[r,g,bl].map(n=>n.toString(16).padStart(2,'0')).join('')} V=${(v*100).toFixed(0)}%` }
  return [
    'bottom-left  ' + px(0.12,0.92),
    'bottom-centre' + px(0.5,0.92),
    'bottom-right ' + px(0.85,0.80),
    'left wall    ' + px(0.06,0.35),
    'mid floor    ' + px(0.5,0.62),
    'far floor    ' + px(0.5,0.33),
    'sky          ' + px(0.47,0.03),
  ].join('\n')
}))
await b.close()
