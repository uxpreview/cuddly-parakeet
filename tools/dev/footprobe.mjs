// One foot, frame by frame: where the footfall plan put it, where the mesh
// actually ended up, and how far apart those are. tools/dev/gait.mjs reports
// the distribution; this is for reading the shape of one bad stance.
//
//   node tools/dev/footprobe.mjs <take> <fromSec> <toSec> <fl|fr|bl|br|boyL|boyR>
import { chromium } from 'playwright'
import { SEED, TAKES } from '../takes.mjs'
const take = TAKES.find(t=>t.id===(process.argv[2]??'walk'))
const A = Number(process.argv[3]??0.8), B = Number(process.argv[4]??1.5)
const LEG = process.argv[5] ?? 'fl'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:800,height:450}})).newPage()
p.on('pageerror', e => console.log('ERR', e.message))
await p.goto(`http://127.0.0.1:5174/?rec=${SEED}&bare=1&dev=1`, {waitUntil:'load'})
await p.waitForFunction(() => window.__rec && window.__rec.ready(), null, {timeout: 40000})
const call = (m,...a)=>p.evaluate(([m,a])=>window.__rec[m](...a),[m,a])
for (let i=0;i<2;i++) await call('step', 1000/60)
for (const [m,...a] of take.setup) await call(m,...a)
for (let i=0;i<45;i++) await call('step', 1000/60)
const pend=[...take.at].sort((x,y)=>x[0]-y[0])
for (let f=0;f<Math.round(take.seconds*60);f++){
  const t=f/60
  while(pend.length && pend[0][0]<=t){const [,m,...a]=pend.shift(); await call(m,...a)}
  const pr = await call('frame',1,1000/60)
  if (t>=A && t<=B){
    const e = LEG==='boyL' ? {plant:pr.boyFeet.plantL, at:pr.boyFeet.L, sole:pr.boyFeet.soleL}
            : LEG==='boyR' ? {plant:pr.boyFeet.plantR, at:pr.boyFeet.R, sole:pr.boyFeet.soleR}
            : pr.dogPaws.find(q=>q.leg===LEG)
    const d = Math.hypot(e.sole[0]-e.at[0], e.sole[1]-e.at[1], e.sole[2]-e.at[2])
    console.log(t.toFixed(3), 'plant',e.plant, 'err',(d*1000).toFixed(0),'mm',
      'plan',e.at.map(v=>v.toFixed(3)).join(','), 'sole',e.sole.map(v=>v.toFixed(3)).join(','),
      'spd',(LEG.startsWith('boy')?pr.player.speed:pr.dogAnim.speed).toFixed(2),'ph',pr.dogAnim.gaitPhase.toFixed(3))
  }
  if (t>B) break
}
await b.close()
