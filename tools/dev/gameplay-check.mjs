// Gate 1 regression: the grey-box gameplay path must still boot and run after
// the art pass. It shares the loader and the manifest, so a change to either
// can break it silently while every art render still looks fine.
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({viewport:{width:1000,height:600}})).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message.slice(0,200)))
await p.goto('http://127.0.0.1:5174/?dev', {waitUntil:'load'})
await p.waitForFunction(() => window.__game && window.__game.world.ready, null, {timeout: 40000})
await p.waitForTimeout(1500)
console.log(JSON.stringify(await p.evaluate(() => {
  const w = window.__game.world
  return {
    ready: w.ready,
    chapter: w.manifest.id,
    routeNodes: w.route.nodes.length,
    routeLength: Math.round(w.route.total),
    triggers: w.triggers.length,
    artTerrainLoaded: !!w.art,
    dogActivity: w.dog.activity,
    playerAt: w.player.pos.toArray().map(v => +v.toFixed(1)),
  }
}), null, 1))
if (errs.length) { console.log('page errors:', errs); process.exit(1) }
console.log('gameplay path OK')
await b.close()
