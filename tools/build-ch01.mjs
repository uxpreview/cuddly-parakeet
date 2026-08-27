// Authoring tool for the Chapter 1 grey box. Emits chapter DATA only:
//   public/chapters/ch01-canyon.json          (manifest, schema per docs/game-design.md)
//   public/chapters/terrain/canyon-greybox.json
//   public/chapters/paths/dog-ch1-*.json
// The engine never contains chapter-specific code; re-run this script after
// editing the leg list below. Node: `node tools/build-ch01.mjs`
//
// Layout blocked from docs/story.md: swimming hole -> river bank upstream ->
// ford (shallows, hazard-wait #1) -> far bank -> gravel bar -> narrows ->
// ledge down -> bowl with the fallen pine over a deep channel (hazard-wait #2)
// -> switchback climb -> rim (town reveal) -> descending switchbacks with the
// wide near-miss (D1) -> exit gate above town.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = (rel, data) => {
  const p = join(root, 'public', 'chapters', rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(data))
  console.log('wrote', rel)
}

const STEP = 1.5 // centerline sample spacing (m)

// ---- leg definitions ------------------------------------------------------
// turn: total heading change over the leg, degrees (+ = left). dy: total rise.
// sides: wall | lowwall | parapet | water | knob | lowknob | none
// waterLevel: 'track' (follows floor - 0.7) or a function(cursorY) -> absolute y

const legs = [
  { name: 'hole', len: 22, turn: 0, width: 15, dy: 0, surface: 'sand', left: 'water', right: 'wall' },
  { name: 'bank1', len: 30, turn: 15, width: 6, dy: 0.4, surface: 'gravel', left: 'water', right: 'wall' },
  { name: 'bank2', len: 35, turn: -25, width: 5.5, dy: 0.5, surface: 'gravel', left: 'water', right: 'wall' },
  { name: 'bank3', len: 30, turn: 20, width: 5, dy: 1.0, surface: 'dust', left: 'water', right: 'wall' },
  { name: 'bank4', len: 25, turn: -15, width: 5, dy: 0.8, surface: 'gravel', left: 'water', right: 'wall', endAnchor: 'ford-near' },
  { name: 'ford-in', len: 6, turn: 0, width: 3.4, dy: -0.35, surface: 'sand', left: 'water', right: 'water', ford: true },
  { name: 'ford-out', len: 6, turn: 0, width: 3.4, dy: 0.35, surface: 'sand', left: 'water', right: 'water', ford: true, endAnchor: 'ford-far' },
  { name: 'bank5', len: 30, turn: -20, width: 5, dy: 0.8, surface: 'gravel', left: 'wall', right: 'water', endAnchor: 'ford-past' },
  { name: 'bank6', len: 35, turn: 25, width: 6, dy: 0.7, surface: 'dust', left: 'wall', right: 'water' },
  { name: 'bar', len: 34, turn: -10, width: 16, dy: 0, surface: 'gravel', left: 'wall', right: 'wall', endAnchor: 'bar-end' },
  { name: 'narrows', len: 30, turn: 30, width: 4.5, dy: 1.0, surface: 'dust', left: 'wall', right: 'wall' },
  { name: 'ledge-approach', len: 12, turn: 0, width: 6, dy: 0, surface: 'dust', left: 'wall', right: 'wall', endAnchor: 'ledge-top' },
  { name: 'ledge', len: 7, turn: 10, width: 4.5, dy: -1.9, surface: 'gravel', left: 'wall', right: 'wall', endAnchor: 'ledge-bottom' },
  { name: 'bowl', len: 22, turn: -20, width: 10, dy: 0, surface: 'sand', left: 'wall', right: 'wall', endAnchor: 'log-near' },
  { name: 'log', len: 8, turn: 0, width: 0.95, dy: 0, surface: 'wood', left: 'water', right: 'water', pad: 0.15, deepWater: true, endAnchor: 'log-far' },
  { name: 'bowl2', len: 18, turn: 15, width: 7, dy: 0.6, surface: 'gravel', left: 'wall', right: 'wall', endAnchor: 'log-past' },
  { name: 'climb1', len: 30, turn: 10, width: 4.5, dy: 3.5, surface: 'dust', left: 'lowwall', right: 'wall' },
  { name: 'hairpin1', len: 14, turn: 160, width: 5, dy: 1.0, surface: 'gravel', left: 'lowknob', right: 'wall' },
  { name: 'climb2', len: 28, turn: -8, width: 4.5, dy: 3.5, surface: 'dust', left: 'lowwall', right: 'wall' },
  { name: 'hairpin2', len: 14, turn: -160, width: 5, dy: 1.0, surface: 'gravel', left: 'wall', right: 'lowknob' },
  { name: 'climb3', len: 24, turn: 6, width: 5, dy: 3.0, surface: 'dust', left: 'wall', right: 'lowwall', endAnchor: 'climb-top' },
  { name: 'rim', len: 26, turn: -20, width: 14, dy: 0.5, surface: 'gravel', left: 'wall', right: 'parapet', endAnchor: 'rim-end' },
  { name: 'sb1', len: 30, turn: -15, width: 4.6, dy: -2.2, surface: 'gravel', left: 'wall', right: 'parapet', endAnchor: 'sb1-end' },
  { name: 'hairpinA', len: 13, turn: -160, width: 5, dy: -0.8, surface: 'gravel', left: 'parapet', right: 'lowknob' },
  { name: 'sb2', len: 26, turn: 10, width: 4.6, dy: -2.0, surface: 'gravel', left: 'parapet', right: 'lowwall', endAnchor: 'sb2-end' },
  { name: 'hairpinB', len: 13, turn: 160, width: 5, dy: -0.8, surface: 'gravel', left: 'lowknob', right: 'parapet' },
  { name: 'sb3', len: 30, turn: -10, width: 4.6, dy: -2.2, surface: 'gravel', left: 'lowwall', right: 'parapet', endAnchor: 'route-end' },
]

// ---- centerline sampling --------------------------------------------------

const samples = [] // { x, y, z, h, leg }
const anchors = {} // name -> sample index
const legRange = {} // legName -> [startIdx, endIdx]

let x = 0
let y = 0
let z = 0
let h = 0 // radians; dir = (cos h, 0, sin h)

samples.push({ x, y, z, h, leg: 'hole' })
for (const leg of legs) {
  const n = Math.max(1, Math.round(leg.len / STEP))
  const dTurn = ((leg.turn * Math.PI) / 180) / n
  const dRise = leg.dy / n
  const start = samples.length - 1
  for (let i = 0; i < n; i++) {
    h += dTurn
    x += Math.cos(h) * STEP
    z += Math.sin(h) * STEP
    y += dRise
    samples.push({ x, y, z, h, leg: leg.name })
  }
  legRange[leg.name] = [start, samples.length - 1]
  if (leg.endAnchor) anchors[leg.endAnchor] = samples.length - 1
}

const S = (i) => samples[Math.max(0, Math.min(samples.length - 1, i))]
const legMid = (name) => Math.round((legRange[name][0] + legRange[name][1]) / 2)
const legAt = (name, t) => {
  const [a, b] = legRange[name]
  return Math.round(a + (b - a) * t)
}
const pos = (i, dy = 0) => {
  const s = S(i)
  return [round(s.x), round(s.y + dy), round(s.z)]
}
const round = (v) => Math.round(v * 100) / 100

// ---- terrain blocks -------------------------------------------------------

const blocks = []
const decor = []
const legByName = Object.fromEntries(legs.map((l) => [l.name, l]))

// deterministic tone variation so the grey box has readable relief
const toneAt = (i, base = 1) => base * (0.92 + 0.08 * Math.abs(Math.sin(i * 12.9898)))

for (let i = 0; i < samples.length; i++) {
  const s = samples[i]
  const leg = legByName[s.leg]
  const pad = leg.pad ?? 1.6
  const rotY = -s.h
  // floor slab
  blocks.push({
    at: [round(s.x), round(s.y - 0.3), round(s.z)],
    size: [STEP + 1.7, 0.6, round(leg.width + pad)],
    rotY: round(rotY),
    surface: leg.surface,
    walkable: true,
    tone: toneAt(i),
  })
  // sides
  const lx = Math.sin(s.h)
  const lz = -Math.cos(s.h) // left offset dir
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const kind = leg[side]
    if (kind === 'none' || kind === 'knob' || kind === 'lowknob') continue
    if (kind === 'water') {
      const level = leg.ford
        ? anchorFordLevel()
        : leg.deepWater
          ? s.y - 1.5
          : s.y - 0.7
      const off = leg.width / 2 + 4.5
      blocks.push({
        at: [round(s.x + lx * off * sign), round(level - 0.3), round(s.z + lz * off * sign)],
        size: [STEP + 1.8, 0.6, 9],
        rotY: round(rotY),
        surface: 'water',
        walkable: false,
        tone: 1,
      })
      // far bank wall beyond the water
      const woff = leg.width / 2 + 9.8
      blocks.push(pillar(s.x + lx * woff * sign, s.z + lz * woff * sign, level - 0.5, 10, i))
    } else if (kind === 'wall') {
      const off = leg.width / 2 + 1.8
      blocks.push(pillar(s.x + lx * off * sign, s.z + lz * off * sign, s.y - 1, 10, i))
    } else if (kind === 'lowwall') {
      const off = leg.width / 2 + 1.8
      blocks.push(pillar(s.x + lx * off * sign, s.z + lz * off * sign, s.y - 1, 3.2, i))
    } else if (kind === 'parapet') {
      const off = leg.width / 2 + 1.1
      blocks.push({
        at: [round(s.x + lx * off * sign), round(s.y + 0.4), round(s.z + lz * off * sign)],
        size: [1.9, 0.9, 1.9],
        surface: 'rock',
        walkable: false,
        tone: toneAt(i, 0.85),
      })
    }
  }
}

function pillar(px, pz, baseY, height, seed) {
  return {
    at: [round(px), round(baseY + height / 2), round(pz)],
    size: [2.7, height, 2.7],
    surface: 'rock',
    walkable: false,
    tone: toneAt(seed, 0.95),
  }
}

function anchorFordLevel() {
  // constant water level through the ford dip
  const i = anchors['ford-near']
  return S(i).y - 0.55
}

// hairpin knobs (inner-corner rock)
for (const leg of legs) {
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const kind = leg[side]
    if (kind !== 'knob' && kind !== 'lowknob') continue
    const i = legMid(leg.name)
    const s = S(i)
    const lx = Math.sin(s.h)
    const lz = -Math.cos(s.h)
    const off = leg.width / 2 + 2.6
    const hgt = kind === 'knob' ? 9 : 3.5
    blocks.push({
      at: [round(s.x + lx * off * sign), round(s.y - 1 + hgt / 2), round(s.z + lz * off * sign)],
      size: [5.2, hgt, 5.2],
      surface: 'rock',
      walkable: false,
      tone: 0.9,
    })
  }
}

// cap behind the spawn so the world has a back wall
{
  const s0 = S(0)
  const bx = s0.x - Math.cos(s0.h) * 2.5
  const bz = s0.z - Math.sin(s0.h) * 2.5
  const lx = Math.sin(s0.h)
  const lz = -Math.cos(s0.h)
  for (let k = -4; k <= 4; k++) {
    blocks.push(pillar(bx + lx * k * 2.4, bz + lz * k * 2.4, s0.y - 1, 10, k + 40))
  }
}

// ---- decor: the town below, the sea, terraced hillside --------------------
{
  const endI = anchors['route-end']
  const e = S(endI)
  const dir = [Math.cos(e.h), Math.sin(e.h)]
  const lat = [Math.sin(e.h), -Math.cos(e.h)]
  // terraced hillside continuing down from the exit
  for (let t = 0; t < 6; t++) {
    decor.push({
      at: [round(e.x + dir[0] * (14 + t * 11)), round(e.y - 3 - t * 3.4), round(e.z + dir[1] * (14 + t * 11))],
      size: [16, 4, 46],
      rotY: round(-e.h),
      surface: 'rock',
      walkable: false,
      tone: 0.9 - t * 0.03,
    })
  }
  // town cluster
  const rand = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return v - Math.floor(v)
  }
  for (let t = 0; t < 26; t++) {
    const along = 62 + rand(t) * 46
    const side = (rand(t + 50) - 0.5) * 70
    const w = 3.5 + rand(t + 100) * 5
    const hgt = 3 + rand(t + 150) * 5
    decor.push({
      at: [
        round(e.x + dir[0] * along + lat[0] * side),
        round(e.y - 21 + hgt / 2),
        round(e.z + dir[1] * along + lat[1] * side),
      ],
      size: [round(w), round(hgt), round(3.5 + rand(t + 200) * 5)],
      surface: 'stone',
      walkable: false,
      tone: 1.05 - rand(t + 250) * 0.15,
    })
  }
  // the sea
  decor.push({
    at: [round(e.x + dir[0] * 150), round(e.y - 23), round(e.z + dir[1] * 150)],
    size: [300, 0.5, 300],
    surface: 'water',
    walkable: false,
    tone: 1,
  })
}

// ---- dog paths ------------------------------------------------------------
// Slices of the centerline between anchors, thinned to every other sample.

const heelI = 3
const spawnI = 2
const boltStartI = heelI

function slice(fromI, toI) {
  const pts = []
  for (let i = fromI; i < toI; i += 2) pts.push(pos(i))
  pts.push(pos(toI))
  return { points: pts }
}

const fordFarI = anchors['ford-far']
const hazard1I = fordFarI + 2
const barLookI = legAt('bar', 0.65)
const ledgeBottomI = anchors['ledge-bottom'] + 2
const logFarI = anchors['log-far']
const hazard2I = logFarI + 2
const rimWaitI = legAt('rim', 0.45)
const nearMissI = legAt('sb2', 0.5)
const exitI = legAt('sb3', 0.6)

out('paths/dog-ch1-a.json', slice(boltStartI, hazard1I))
out('paths/dog-ch1-b.json', slice(hazard1I, barLookI))
out('paths/dog-ch1-c.json', slice(barLookI, ledgeBottomI))
out('paths/dog-ch1-d.json', slice(ledgeBottomI, hazard2I))
out('paths/dog-ch1-e.json', slice(hazard2I, rimWaitI))
out('paths/dog-ch1-f.json', slice(rimWaitI, nearMissI))
out('paths/dog-ch1-esc.json', slice(nearMissI, samples.length - 1))

// ---- manifest -------------------------------------------------------------

const stareI = legAt('bank1', 0.8) // the bolt stare aims up-canyon at nothing

const manifest = {
  id: 'ch01-canyon',
  title: 'The Canyon',
  spawn: { position: pos(spawnI, 0.02), facing: round((S(spawnI).h * 180) / Math.PI) },
  gait: { from: 'light', to: 'light' },
  lighting: {
    states: [
      {
        id: 'morning',
        sunDir: [-40, 30],
        sun: '#F2DFAE',
        ambient: '#CFE3E0',
        fog: { color: '#DCE8E4', near: 40, far: 140 },
      },
    ],
    blendBy: 'none',
  },
  environment: {
    terrain: 'terrain/canyon-greybox.json',
    surfaces: 'terrain/canyon-greybox.json',
    props: [],
  },
  dogRoute: [
    {
      type: 'wait',
      at: pos(heelI),
      until: { time: 30 },
      exit: { face: pos(stareI), hold: 1.5 },
      idle: 'sniff',
    },
    { type: 'trot', path: 'paths/dog-ch1-a.json', speed: 3.0 },
    { type: 'hazard-wait', at: pos(hazard1I), safetyTrigger: 'ford-crossed' },
    { type: 'trot', path: 'paths/dog-ch1-b.json', speed: 2.6 },
    { type: 'look-back', at: pos(barLookI), variant: 'auto' },
    { type: 'trot', path: 'paths/dog-ch1-c.json', speed: 2.6 },
    { type: 'wait', at: pos(ledgeBottomI), until: { proximity: 26 }, idle: 'stand' },
    { type: 'trot', path: 'paths/dog-ch1-d.json', speed: 2.6 },
    { type: 'hazard-wait', at: pos(hazard2I), safetyTrigger: 'log-crossed' },
    { type: 'trot', path: 'paths/dog-ch1-e.json', speed: 2.6 },
    { type: 'wait', at: pos(rimWaitI), until: { proximity: 18 }, idle: 'stand' },
    { type: 'trot', path: 'paths/dog-ch1-f.json', speed: 2.6 },
    {
      type: 'near-miss',
      at: pos(nearMissI),
      approach: 9,
      contact: 'none',
      escape: 'paths/dog-ch1-esc.json',
    },
  ],
  trail: {
    pawprintSurfaces: ['dust', 'gravel', 'sand'],
    disturbances: [],
    witnesses: [],
    glimpses: [{ id: 'switchback-view', focus: 'dog' }],
  },
  whistle: { mode: 'honest', falseSources: [] },
  triggers: [
    { id: 'swimming-hole', shape: 'box', at: pos(heelI), size: [16, 6, 16] },
    { id: 'ford', shape: 'box', at: pos(anchors['ford-near']), size: [10, 5, 10] },
    { id: 'ford-crossed', shape: 'box', at: pos(fordFarI + 1), size: [7, 4, 7] },
    { id: 'fallen-pine', shape: 'box', at: pos(anchors['log-near']), size: [10, 5, 10] },
    { id: 'log-crossed', shape: 'box', at: pos(logFarI + 1), size: [6, 4, 6] },
    { id: 'rim-view', shape: 'box', at: pos(legAt('rim', 0.55)), size: [20, 7, 20] },
    { id: 'rim-gate', shape: 'box', at: pos(exitI), size: [8, 5, 8] },
  ],
  cameras: [
    (() => {
      const i = legAt('rim', 0.55)
      const s = S(i)
      const back = 9
      const p = [
        round(s.x - Math.cos(s.h) * back),
        round(s.y + 5.5),
        round(s.z - Math.sin(s.h) * back),
      ]
      const look = pos(anchors['route-end'], -8)
      return { id: 'town-reveal', trigger: 'rim-view', position: p, lookAt: look }
    })(),
  ],
  map: { shown: true, landmarks: ['swimming-hole', 'ford', 'fallen-pine', 'rim-view'] },
  audio: { bed: '', barkSet: '' },
  exit: { trigger: 'rim-gate', next: 'ch02-old-town' },
}

out('terrain/canyon-greybox.json', { blocks, decor })
out('ch01-canyon.json', manifest)

// ---- stats ----------------------------------------------------------------
let total = 0
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1]
  const b = samples[i]
  total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}
console.log('route length (m):', Math.round(total))
console.log('blocks:', blocks.length, 'decor:', decor.length)
console.log('anchors:', Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, pos(v)])))
