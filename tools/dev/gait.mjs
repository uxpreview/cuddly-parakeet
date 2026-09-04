// The gait instrument.
//
// Gate 3's list is "the boy has weight, stopping settles, no foot sliding;
// footprints land in step and alternate correctly, pawprints match his gait".
// Three of those five are numbers, and the project's method is to measure them
// rather than to look at a video and say they are fine. So this runs the same
// deterministic takes tools/record.mjs does, with no screenshots, and reports:
//
//   slide      how far a sole MOVES while it is carrying weight, in mm. The
//              footfall plan cannot slide by construction; what can is a leg
//              that could not reach the plant it was given, so this measures
//              the rendered mesh, never the plan
//   reach      how far the rendered sole sits from the planted position it was
//              asked for. Non-zero means the leg is too short for the stride
//   settle     seconds from the last input to the body coming to rest, and how
//              far the pelvis travels doing it
//   prints     the spawn sequence: side alternation, spacing, and whether every
//              print corresponds to a footfall
//
//   node tools/dev/gait.mjs              every take
//   node tools/dev/gait.mjs walk         one take

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { SEED, TAKES } from '../takes.mjs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5174'
const ONLY = process.argv.slice(2)
const SIM_HZ = 60
const EXECUTABLE = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'

const takes = ONLY.length ? TAKES.filter((t) => ONLY.includes(t.id)) : TAKES

const browser = await chromium.launch({
  executablePath: existsSync(EXECUTABLE) ? EXECUTABLE : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const mm = (v) => (v * 1000).toFixed(1)
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) : '0') + '%'

for (const take of takes) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(`${BASE}/?rec=${SEED}&bare=1&dev=1`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__rec && window.__rec.ready(), null, { timeout: 40000 })
  const call = (m, ...a) => page.evaluate(([m, a]) => window.__rec[m](...a), [m, a])

  for (let i = 0; i < 2; i++) await call('step', 1000 / SIM_HZ)
  for (const [m, ...a] of take.setup) await call(m, ...a)
  for (let i = 0; i < Math.round(SIM_HZ * 0.75); i++) await call('step', 1000 / SIM_HZ)

  const pending = [...take.at].sort((a, b) => a[0] - b[0])
  const frames = Math.round(take.seconds * SIM_HZ)
  const probes = []
  for (let f = 0; f < frames; f++) {
    const t = f / SIM_HZ
    while (pending.length && pending[0][0] <= t) {
      const [, m, ...a] = pending.shift()
      await call(m, ...a)
    }
    probes.push(await call('frame', 1, 1000 / SIM_HZ))
  }
  await ctx.close()

  // --- sliding and reach --------------------------------------------------
  const legs = [
    ['boy L', (p) => p.boyFeet && { plant: p.boyFeet.plantL, plan: p.boyFeet.L, sole: p.boyFeet.soleL }],
    ['boy R', (p) => p.boyFeet && { plant: p.boyFeet.plantR, plan: p.boyFeet.R, sole: p.boyFeet.soleR }],
    ...['fl', 'fr', 'bl', 'br'].map((leg) => [
      'dog ' + leg,
      (p) => {
        const e = p.dogPaws && p.dogPaws.find((q) => q.leg === leg)
        return e && { plant: e.plant, plan: e.at, sole: e.sole }
      },
    ]),
  ]

  // Frames the harness staged (a teleport) and frames where a pose OWNS the
  // dog's legs (a sit, a bow, the rigid stare) are not frames the footfall
  // planner is responsible for. Counting them measures the instrument.
  const skipFrame = new Uint8Array(probes.length)
  probes.forEach((p, i) => {
    if (!p.staged) return
    for (let j = Math.max(0, i - 2); j < Math.min(probes.length, i + 8); j++) skipFrame[j] = 1
  })
  const pctl = (a, q) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))] : 0)
  const rows = []
  // The first half second is the teleport settling and is not the take.
  const SKIP = Math.round(0.5 * SIM_HZ)
  for (const [name, get] of legs) {
    const slides = []
    const reaches = []
    let plants = 0
    let worstAt = 0
    let worstSlide = 0
    let prev = null
    for (let i = 0; i < probes.length; i++) {
      const e = get(probes[i])
      if (!e) continue
      const held = name.startsWith('dog') && probes[i].dogHeld
      if (e.plant && i >= SKIP && !skipFrame[i] && !held) {
        reaches.push(d3(e.sole, e.plan))
        if (prev && prev.plant) {
          const s = Math.hypot(e.sole[0] - prev.sole[0], e.sole[2] - prev.sole[2])
          slides.push(s)
          if (s > worstSlide) {
            worstSlide = s
            worstAt = i / SIM_HZ
          }
        }
      }
      if (!e.plant && prev && prev.plant && !skipFrame[i]) plants++
      prev = skipFrame[i] || held ? null : e
    }
    rows.push({
      name,
      plants,
      frames: reaches.length,
      over: reaches.filter((r) => r > 0.01).length,
      slideP50: pctl(slides, 0.5),
      slideP99: pctl(slides, 0.99),
      slideMax: worstSlide,
      worstAt,
      reachP50: pctl(reaches, 0.5),
      reachP99: pctl(reaches, 0.99),
    })
  }

  // --- prints -------------------------------------------------------------
  const prints = []
  probes.forEach((p, i) => {
    if (skipFrame[i]) return
    for (const q of p.printsLaid ?? []) prints.push({ ...q, t: i / SIM_HZ })
  })
  const byKind = {}
  for (const q of prints) (byKind[q.kind] ??= []).push(q)

  // Does every print sit on a foot that had just been planted? A print more
  // than a paw's width from the nearest plant is a print the gait did not make.
  let orphan = 0
  for (const q of prints) {
    let best = Infinity
    const f = Math.round(q.t * SIM_HZ)
    for (const df of [-1, 0, 1]) {
      const p = probes[f + df]
      if (!p) continue
      const cands = []
      if (p.boyFeet) cands.push(p.boyFeet.L, p.boyFeet.R)
      if (p.dogPaws) for (const e of p.dogPaws) cands.push(e.at)
      for (const c of cands) best = Math.min(best, Math.hypot(q.x - c[0], q.z - c[2]))
    }
    if (best > 0.06) orphan++
  }

  // Alternation: consecutive prints of one kind should fall on opposite sides
  // of the line of travel.
  const sideRuns = {}
  for (const [kind, list] of Object.entries(byKind)) {
    let flips = 0
    let same = 0
    let prevSide = 0
    const gaps = []
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      gaps.push(Math.hypot(b.x - a.x, b.z - a.z))
      // signed lateral offset of b from the line through a along a's heading
      const s = Math.sign(
        Math.cos(a.heading) * (b.x - a.x) - Math.sin(a.heading) * (b.z - a.z),
      )
      if (prevSide !== 0) s === prevSide ? same++ : flips++
      prevSide = s
    }
    gaps.sort((x, y) => x - y)
    sideRuns[kind] = {
      n: list.length,
      flips,
      same,
      medianGap: gaps.length ? gaps[gaps.length >> 1] : 0,
    }
  }

  // --- the settle ---------------------------------------------------------
  // The last moment he was up to speed, then how long and how far it takes him
  // to come to rest. "Stopping settles" is a Gate 3 must-confirm, and a body
  // that stops in a tenth of a second never had any weight in it.
  let settle = null
  {
    const top = Math.max(...probes.map((p) => p.player.speed))
    for (let i = 1; i < probes.length - 1; i++) {
      if (probes[i].player.speed < top * 0.9) continue
      if (probes[i + 1].player.speed >= probes[i].player.speed) continue
      let rest = -1
      for (let j = i + 1; j < probes.length; j++) {
        if (probes[j].player.speed > probes[i].player.speed) break
        if (probes[j].player.speed < 0.01) {
          rest = j
          break
        }
      }
      if (rest > 0) {
        settle = {
          seconds: (rest - i) / SIM_HZ,
          metres: d3(probes[i].player.pos, probes[rest].player.pos),
          from: probes[i].player.speed,
          at: i / SIM_HZ,
        }
        break
      }
    }
  }

  const drawCalls = Math.max(...probes.map((p) => p.perf?.drawCalls ?? 0))
  const tris = Math.max(...probes.map((p) => p.perf?.triangles ?? 0))

  console.log(`\n=== ${take.id} — ${take.seconds}s at ${SIM_HZ}Hz ===`)
  console.log(`  draw calls ${drawCalls}, triangles ${tris}`)
  console.log('  foot          plants   slide/frame p50/p99/max (mm)    reach err p50/p99 (mm)')
  for (const r of rows) {
    if (!r.plants) continue
    console.log(
      `  ${r.name.padEnd(12)} ${String(r.plants).padStart(5)}    ` +
        `${mm(r.slideP50).padStart(5)} /${mm(r.slideP99).padStart(6)} /${mm(r.slideMax).padStart(6)} @${r.worstAt.toFixed(2)}s` +
        `      ${mm(r.reachP50).padStart(5)} /${mm(r.reachP99).padStart(6)}` +
        `   ${pct(r.over, r.frames).padStart(4)} of stance over 10 mm`,
    )
  }
  for (const [kind, s] of Object.entries(sideRuns)) {
    console.log(
      `  prints ${kind}: ${s.n} laid, alternation ${pct(s.flips, s.flips + s.same)} ` +
        `(${s.flips} flips / ${s.same} repeats), median gap ${(s.medianGap * 100).toFixed(1)} cm`,
    )
  }

  // A trot is diagonal pairs, so "alternation" is the wrong question for the
  // dog: what has to be true is that his prints arrive two at a time, one front
  // and one rear from OPPOSITE sides, and that the same foot's prints are one
  // stride apart.
  {
    const events = []
    probes.forEach((p, i) => {
      if (!p.dogPaws) return
      const prevP = probes[i - 1]
      if (skipFrame[i] || p.dogHeld) return
      for (const e of p.dogPaws) {
        const was = prevP && prevP.dogPaws && prevP.dogPaws.find((q) => q.leg === e.leg)
        if (e.plant && was && !was.plant) events.push({ leg: e.leg, t: i / SIM_HZ, at: e.at })
      }
    })
    const clusters = []
    for (const e of events) {
      const c = clusters[clusters.length - 1]
      if (c && e.t - c.t0 < 0.06) c.legs.push(e.leg)
      else clusters.push({ t0: e.t, legs: [e.leg] })
    }
    const diag = clusters.filter(
      (c) =>
        c.legs.length === 2 &&
        ((c.legs.includes('fl') && c.legs.includes('br')) ||
          (c.legs.includes('fr') && c.legs.includes('bl'))),
    ).length
    const strides = {}
    for (const leg of ['fl', 'fr', 'bl', 'br']) {
      const own = events.filter((e) => e.leg === leg)
      const gaps = []
      for (let i = 1; i < own.length; i++) {
        gaps.push(Math.hypot(own[i].at[0] - own[i - 1].at[0], own[i].at[2] - own[i - 1].at[2]))
      }
      gaps.sort((a, b) => a - b)
      strides[leg] = gaps.length ? gaps[gaps.length >> 1] : 0
    }
    console.log(
      `  dog footfalls: ${clusters.length} clusters, ${pct(diag, clusters.length)} diagonal pairs; ` +
        `same-foot stride ` +
        ['fl', 'fr', 'bl', 'br'].map((l) => `${l} ${(strides[l] * 100).toFixed(0)}`).join(' / ') +
        ' cm',
    )
  }
  console.log(`  prints not on a footfall: ${orphan} of ${prints.length}`)
  if (settle) {
    console.log(
      `  settle: ${settle.seconds.toFixed(2)} s and ${(settle.metres * 100).toFixed(0)} cm ` +
        `from ${settle.from.toFixed(2)} m/s to rest, starting at t=${settle.at.toFixed(2)}s`,
    )
  }
  const acts = {}
  for (const p of probes) acts[p.dog.activity] = (acts[p.dog.activity] ?? 0) + 1
  console.log(
    '  dog activity: ' +
      Object.entries(acts)
        .map(([k, v]) => `${k} ${(v / SIM_HZ).toFixed(1)}s`)
        .join(', '),
  )
  const vars = new Set(probes.map((p) => p.dogAnim?.lbVariant).filter((v) => v >= 0))
  console.log('  look-back variants seen: ' + (vars.size ? [...vars].sort().join(', ') : 'none'))
  if (errs.length) console.log('  PAGE ERRORS: ' + errs.slice(0, 3).join(' | '))
}

await browser.close()
