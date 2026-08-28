// One deterministic gameplay frame, as a PNG. For looking at a beat without
// paying for a whole take.
//
//   node tools/dev/frame.mjs <dogNode> <playerOffsetM> <seconds> <out.png>
//   VIEW=portrait node tools/dev/frame.mjs 12 -20 6 /tmp/nm.png
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const view = process.env.VIEW === 'portrait' ? {width:390,height:844,dsf:2} : {width:1280,height:720,dsf:1}
const p = await (await b.newContext({viewport:{width:view.width,height:view.height}, deviceScaleFactor:view.dsf})).newPage()
p.on('pageerror', e => console.log('ERR', e.message))
await p.goto('http://127.0.0.1:5174/?rec=20260828&bare=1&dev=1', {waitUntil:'load'})
await p.waitForFunction(() => window.__rec && window.__rec.ready(), null, {timeout: 40000})
const call = (m,...a)=>p.evaluate(([m,a])=>window.__rec[m](...a),[m,a])
const [node, off, secs, out] = [Number(process.argv[2]??3), Number(process.argv[3]??-9), Number(process.argv[4]??6), process.argv[5]??'/tmp/f.png']
for (let i=0;i<2;i++) await call('step', 16.6667)
await call('dogTo', node); await call('placeAtNode', node, off)
for (let i=0;i<45;i++) await call('step', 16.6667)
await call('steer','route',5)
for (let i=0;i<Math.round(secs*60);i++) await call('step', 16.6667)
console.log(JSON.stringify(await p.evaluate(()=>window.__rec.probe())))
await p.screenshot({path: out, timeout: 120000})
await b.close()
