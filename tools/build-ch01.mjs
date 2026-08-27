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
      // water is flat per leg (stepping down at leg boundaries reads as
      // riffles); per-sample levels made the river read as terraced stone
      const legY = S(legRange[s.leg][0]).y
      const level = leg.ford
        ? anchorFordLevel()
        : leg.deepWater
          ? legY - 1.5
          : legY - 0.7
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
      // low enough to see the adjacent switchback leg (and the dog on it),
      // high enough that its top can't be stepped onto
      const off = leg.width / 2 + 1.8
      blocks.push(pillar(s.x + lx * off * sign, s.z + lz * off * sign, s.y - 1, 1.8, i))
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
    const hgt = kind === 'knob' ? 9 : 2.2 // low knobs keep cross-hairpin sightlines
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
    const along = 44 + rand(t) * 40
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
// Just below the rim on the first descending switchback: the town-reveal
// framed camera establishes him there, looking back, with the town below.
// The boy descends toward him in full view; at the authored approach the
// staged almost plays, and the escape is a long visible trot down every
// switchback — wide and beautiful, of sight not touch (D1).
const nearMissI = legAt('sb1', 0.4)
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
        // Gate 2: the documented Chapter 1 morning. Sun colour is the palette's
        // warm rim value and ambient is its sky. 30 degrees is where light
        // clears the far rim and reaches the floor at this canyon's
        // proportions while shadows stay long. The art path derives its fog
        // from the sky gradient; `fog.color` is the grey-box fallback.
        id: 'morning',
        sunDir: [40, 30],
        sun: '#F2DFAE',
        ambient: '#CFE3E0',
        fog: { color: '#DCE8E4', near: 34, far: 260 },
      },
    ],
    blendBy: 'none',
  },
  environment: {
    terrain: 'terrain/canyon-greybox.json',
    // Schema extension (Gate 2, all chapters): the look of the chapter, kept
    // apart from `terrain` so collision and staging stay exactly what Gate 1
    // signed off on. Absent -> the chapter renders as a grey box.
    artTerrain: 'terrain/canyon-art.json',
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
      approach: 11,
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
    // kept tight: the framed reveal is a beat, not a blind traversal — the
    // player loses direct sight of the boy while it holds (critic flag #1)
    { id: 'rim-view', shape: 'box', at: pos(legAt('rim', 0.72)), size: [10, 7, 10] },
    { id: 'rim-gate', shape: 'box', at: pos(exitI), size: [8, 5, 8] },
  ],
  cameras: [
    (() => {
      // The reveal must contain its three subjects at once: the descending
      // switchbacks (middle band), the hazy town below (far band), sky above.
      // Shot from above the rim's edge, aimed between the dog's hold and the
      // town, with the rim wall behind the camera rather than in frame.
      const edge = S(anchors['rim-end'])
      // hang the camera out over the parapet (downhill) side so the rim's
      // uphill wall stays behind it instead of filling the frame
      const rlx = -Math.sin(edge.h)
      const rlz = Math.cos(edge.h)
      const p = [
        round(edge.x - Math.cos(edge.h) * 3 + rlx * 5.5),
        round(edge.y + 7.5),
        round(edge.z - Math.sin(edge.h) * 3 + rlz * 5.5),
      ]
      const dogHold = S(nearMissI)
      const end = S(anchors['route-end'])
      const townDir = [Math.cos(end.h), Math.sin(end.h)]
      const town = [end.x + townDir[0] * 55, end.y - 18, end.z + townDir[1] * 55]
      const look = [
        round(dogHold.x * 0.55 + town[0] * 0.45),
        round((dogHold.y + 0.4) * 0.55 + town[1] * 0.45),
        round(dogHold.z * 0.55 + town[2] * 0.45),
      ]
      return { id: 'town-reveal', trigger: 'rim-view', position: p, lookAt: look }
    })(),
  ],
  map: { shown: true, landmarks: ['swimming-hole', 'ford', 'fallen-pine', 'rim-view'] },
  audio: { bed: '', barkSet: '' },
  exit: { trigger: 'rim-gate', next: 'ch02-old-town' },
}

// ---- art terrain (Gate 2) --------------------------------------------------
// Same source data as the grey box: the leg list above. This emits the LOOK of
// the canyon, never its collision or its route — those stay exactly as Gate 1
// left them. The engine lofts these cross-sections along the same centerline.
//
// A leg's `chain` is ONE continuous cross-section running from the far left of
// the world to the far right: plateau, rim, cliff, talus, bank, river, floor,
// and back up the other side. It is one chain rather than two half-profiles so
// the world is closed — no sky under the canyon floor, no cliff that stops in
// mid-air. Each point is `{o, y, m, j, t}`: lateral offset in meters (signed),
// height relative to the centerline, palette material id, how far the point may
// wander per sample, and a tag the scatter placer looks things up by.

const hash = (a, b = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}
const jit = (a, b) => hash(a, b) * 2 - 1 // -1..1, deterministic

const P = (o, y, m, j = 0, t = '') => ({ o: round(o), y: round(y), m, j, t })

// One side of the canyon, measured outward from the floor edge at `W`.
// Heights make the canyon 22-25 m deep, which is what puts the rim pines and
// the sky where the story keeps pointing: up and a long way off.

function wallSide(W, top = 1) {
  const T = (v) => v * top
  // The rungs are close together on purpose. A limestone wall is bedded, and
  // bedding is what stops a lofted cliff from reading as one poured sheet: each
  // pair of rungs becomes a band that catches the light at its own angle.
  return [
    P(W + 0.8, 0.55, 'scree', 0.2),
    P(W + 2.8, T(2.5), 'scree', 0.5, 'talus'),
    P(W + 3.9, T(5.4), 'limestone', 0.55),
    P(W + 3.5, T(7.6), 'limestone', 0.6, 'ledge'),
    P(W + 4.6, T(10.4), 'limestone', 0.7),
    P(W + 4.2, T(12.9), 'limestone', 0.7),
    P(W + 5.3, T(15.8), 'limestone', 0.85),
    P(W + 4.9, T(18.2), 'limestone', 0.85),
    P(W + 6.2, T(21.0), 'limestone', 0.95),
    P(W + 7.6, T(22.9), 'limestone', 1.0, 'rim'),
    P(W + 15.0, T(23.8), 'scrub', 1.6, 'plateau'),
    P(W + 34.0, T(22.4), 'scrub', 2.8, 'plateau'),
  ]
}

function waterSide(W) {
  // The far bank is a terrace, not a second cliff. Two reasons, and they are
  // the same reason: a river canyon really does cut one bank lower than the
  // other, and a slot with full-height walls on both sides puts the entire
  // floor in shade all morning, which would mean the documented path value
  // never once appears on screen. The set-back upper cliff is what lets the
  // 30-degree sun onto the floor while the near wall keeps throwing its shadow.
  return [
    P(W + 0.55, -0.3, 'sand', 0.12, 'bank'),
    P(W + 1.15, -0.95, 'wetstone', 0.1, 'waterline'),
    P(W + 8.4, -1.15, 'wetstone', 0.16, 'riverbed'),
    P(W + 9.5, 0.1, 'sand', 0.22, 'farbank'),
    P(W + 11.2, 1.9, 'scree', 0.4, 'talus'),
    P(W + 13.0, 5.2, 'limestone', 0.5),
    P(W + 16.5, 6.4, 'scrub', 0.7, 'terrace'),
    P(W + 22.0, 6.9, 'scrub', 1.0, 'terrace'),
    P(W + 25.0, 10.6, 'limestone', 0.7),
    P(W + 27.6, 15.0, 'limestone', 0.8),
    P(W + 26.9, 17.4, 'limestone', 0.8),
    P(W + 29.6, 20.8, 'limestone', 1.0, 'rim'),
    P(W + 38.0, 21.8, 'scrub', 1.8, 'plateau'),
    P(W + 58.0, 19.8, 'scrub', 2.8, 'plateau'),
  ]
}

// Low enough to keep the cross-hairpin sightline Gate 1's staging depends on,
// then a short shelf that runs into the neighbouring switchback.
function lowWallSide(W) {
  return [
    P(W + 0.55, 0.55, 'scree', 0.14),
    P(W + 1.9, 2.05, 'limestone', 0.22, 'ledge'),
    P(W + 4.4, 2.3, 'scree', 0.4, 'shelf'),
    P(W + 8.2, 1.4, 'limestone', 0.6),
  ]
}

// The rim edge and the switchback terraces. The Gate 1 layout puts adjacent
// switchback legs about eight metres apart and three metres down from each
// other, so the drop between them is a terrace face, not a cliff. Anything
// deeper punches through the leg below and the hillside reads as stacked
// ribbons. Dry limestone and scree, never scrub: green banding here turns a
// Dalmatian hillside into a set of lawns.
function parapetSide(W) {
  return [
    P(W + 0.45, 0.62, 'limestone', 0.12, 'lip'),
    P(W + 0.9, 0.1, 'limestone', 0.12),
    // a near-vertical riser: over eight metres of tread the drop has to happen
    // in one metre or the terraces blend into one pale ramp
    P(W + 1.2, -2.9, 'limestone', 0.22),
    P(W + 3.0, -3.5, 'scree', 0.4),
    P(W + 7.5, -3.8, 'scree', 0.7),
  ]
}

function fallAwaySide(W) {
  return [
    P(W + 1.2, -0.5, 'scree', 0.2),
    P(W + 4.0, -3.4, 'scree', 0.6),
    P(W + 12.0, -8.0, 'limestone', 1.2),
    P(W + 30.0, -12.0, 'scrub', 2.0, 'plateau'),
  ]
}

const wallTop = { narrows: 1.2, 'ledge-approach': 1.15, ledge: 1.12, bowl: 0.85, bowl2: 0.88, hole: 0.92 }

const artLegs = []
for (const leg of legs) {
  const W = leg.width / 2 + (leg.pad ?? 1.6) / 2
  const top = wallTop[leg.name] ?? 1
  const side = (kind) => {
    switch (kind) {
      case 'wall':
        return wallSide(W, top)
      case 'lowwall':
        return lowWallSide(W)
      case 'parapet':
        return parapetSide(W)
      case 'water':
        return waterSide(W)
      default:
        return fallAwaySide(W)
    }
  }

  let leftHalf
  let rightHalf
  if (leg.name === 'log') {
    // the crossing is the fallen pine itself; the channel walls belong to the
    // bowl legs on either side of it
    leftHalf = [P(W + 0.05, -0.06, 'deadwood', 0), P(W + 0.4, -2.6, 'limestone', 0.2), P(W + 9, -3.4, 'limestone', 0.6)]
    rightHalf = leftHalf.map((p) => ({ ...p }))
  } else {
    leftHalf = side(leg.left)
    rightHalf = side(leg.right)
  }

  // left half mirrored to negative offsets, floor across the middle, right half
  const chain = []
  for (let i = leftHalf.length - 1; i >= 0; i--) {
    const p = leftHalf[i]
    chain.push({ o: round(-p.o), y: p.y, m: p.m, j: p.j, t: p.t })
  }
  // The walked track is narrower than the ground it crosses. Without this the
  // canyon floor is one unbroken sheet of the path value, and #EFE3C8 across
  // half the frame is a white road, not a canyon. The bright track is the
  // leading line; the shoulders are the coarse stuff either side of it.
  const track = Math.min(W * 0.55, 1.75)
  const shoulder = (o) => P(o, 0.06 + Math.abs(o) * 0.02, 'scree', 0.09, 'shoulder')
  if (W > track + 0.4) {
    chain.push(P(-W, 0.14, 'scree', 0.1, 'edge'))
    chain.push(shoulder(-(track + 0.35)))
  } else {
    chain.push(P(-W, 0.1, leg.surface, 0.08, 'edge'))
  }
  chain.push(P(-track, 0.015, leg.surface, 0.05, 'floor'))
  chain.push(P(0, 0, leg.surface, 0, 'floor'))
  chain.push(P(track, 0.015, leg.surface, 0.05, 'floor'))
  if (W > track + 0.4) {
    chain.push(shoulder(track + 0.35))
    chain.push(P(W, 0.14, 'scree', 0.1, 'edge'))
  } else {
    chain.push(P(W, 0.1, leg.surface, 0.08, 'edge'))
  }
  for (const p of rightHalf) chain.push({ ...p })

  artLegs.push({ name: leg.name, range: legRange[leg.name], surface: leg.surface, chain })
}

const chainIndex = (legName, tag, nth = 0) => {
  const chain = artLegs.find((l) => l.name === legName).chain
  const hits = []
  chain.forEach((p, i) => {
    if (p.t === tag) hits.push(i)
  })
  return hits.length ? hits[Math.min(nth, hits.length - 1)] : -1
}

// ---- the river ------------------------------------------------------------
// One continuous reach, not a rectangle per leg. Each sample contributes a
// quad between the two waterline points of its own cross-section, so the river
// bends with the canyon and its surface follows the floor it cut.

const waters = []
for (const leg of legs) {
  const [a, b] = legRange[leg.name]
  const chain = artLegs.find((l) => l.name === leg.name).chain
  const wl = []
  chain.forEach((p, i) => {
    if (p.t === 'waterline') wl.push(i)
  })
  if (leg.ford) {
    // the crossing: shallow water running right across the path
    waters.push({
      range: [a, b],
      fromK: 0,
      toK: chain.length - 1,
      fromO: round(-(leg.width / 2 + 6)),
      toO: round(leg.width / 2 + 6),
      drop: 0.28,
      material: 'riverShallow',
      opacity: 0.72,
    })
    continue
  }
  if (leg.deepWater) {
    waters.push({
      range: [a, b],
      fromO: round(-(leg.width / 2 + 7)),
      toO: round(leg.width / 2 + 7),
      drop: 1.5,
      material: 'riverDeep',
      opacity: 1,
    })
    continue
  }
  if (wl.length === 0) continue
  for (const k of wl) {
    const sign = chain[k].o < 0 ? -1 : 1
    const near = chain[k].o
    const far = sign < 0 ? chain[k - 1].o : chain[k + 1].o
    const lo = Math.min(near, far)
    const hi = Math.max(near, far)
    // Depth told by hue: a lighter band over the gravel at each shore, the
    // documented river value through the middle. That, and nothing else, is
    // what water is allowed to do here.
    const shelf = Math.min(1.9, (hi - lo) * 0.24)
    waters.push({ range: [a, b], fromO: round(lo), toO: round(lo + shelf), drop: 0.9, material: 'riverShallow', opacity: 1 })
    waters.push({ range: [a, b], fromO: round(lo + shelf), toO: round(hi - shelf), drop: 0.9, material: 'river', opacity: 1 })
    waters.push({ range: [a, b], fromO: round(hi - shelf), toO: round(hi), drop: 0.9, material: 'riverShallow', opacity: 1 })
  }
}

// ---- scatter --------------------------------------------------------------
// Placed by cross-section point, not by absolute height, so a pine sits on the
// jittered surface the engine actually builds rather than floating above a
// number this script guessed. `k`/`t` name a segment of the leg's chain and how
// far along it the thing stands.

const scatter = []
const put = (legName, i, tag, nth, t, kind, scale, seed, lift = 0) => {
  const k = chainIndex(legName, tag, nth)
  if (k < 0) return
  scatter.push({ kind, i, k, t: round(t), scale: round(scale), rot: round(hash(seed, 7) * Math.PI * 2), lift })
}

for (const leg of legs) {
  const [a, b] = legRange[leg.name]
  for (let i = a; i <= b; i++) {
    const sides = [leg.left, leg.right]
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const kind = sides[sIdx]
      const nth = sIdx // left half is chain-order 0 for a mirrored tag, right half is 1
      const r = hash(i * 3.1 + sIdx * 91, 17)
      if (kind === 'wall' || kind === 'water') {
        // the rim pines: the line of them along the top is this canyon's
        // postcard, so they are placed thickly and at varied distance back
        if (r < 0.62) {
          put(leg.name, i, 'plateau', nth, hash(i, sIdx * 5) * 0.9, 'pine', 0.72 + hash(i, sIdx * 9) * 0.6, i * 5 + sIdx)
        }
        if (r > 0.5) {
          put(leg.name, i, 'rim', nth, hash(i, sIdx * 15) * 0.85, 'pine', 0.6 + hash(i, sIdx * 19) * 0.4, i * 13 + sIdx)
        }
        if (r > 0.78) {
          put(leg.name, i, 'talus', nth, hash(i, sIdx * 11) * 0.9, 'rock', 0.55 + hash(i, sIdx * 13) * 1.0, i * 7 + sIdx)
        }
        if (r > 0.36 && r < 0.46) {
          put(leg.name, i, 'talus', nth, hash(i, sIdx * 21) * 0.5, 'scrub', 0.6 + hash(i, sIdx * 3) * 0.5, i * 11 + sIdx)
        }
      }
      if (kind === 'water') {
        if (r < 0.5) {
          put(leg.name, i, 'terrace', nth, hash(i, sIdx * 61) * 0.95, 'pine', 0.6 + hash(i, sIdx * 63) * 0.5, i * 67 + sIdx)
        }
        if (r > 0.66) {
          put(leg.name, i, 'terrace', nth, hash(i, sIdx * 71) * 0.9, 'scrub', 0.5 + hash(i, sIdx * 73) * 0.5, i * 79 + sIdx)
        }
        if (r > 0.55) {
          put(leg.name, i, 'farbank', nth, hash(i, sIdx * 23) * 0.8, 'rock', 0.35 + hash(i, sIdx * 3) * 0.6, i * 17 + sIdx)
        }
        if (r < 0.18) {
          put(leg.name, i, 'farbank', nth, hash(i, sIdx * 29) * 0.6, 'pine', 0.4 + hash(i, sIdx * 31) * 0.3, i * 29 + sIdx)
        }
      }
      if (sIdx === 0 && r > 0.82) {
        put(leg.name, i, 'shoulder', 0, hash(i, 41) * 0.9, 'rock', 0.22 + hash(i, 43) * 0.3, i * 53)
      }
      if (sIdx === 1 && r < 0.16) {
        put(leg.name, i, 'shoulder', 1, hash(i, 47) * 0.9, 'rock', 0.22 + hash(i, 49) * 0.32, i * 59)
      }
      if (kind === 'lowwall') {
        if (r < 0.22) put(leg.name, i, 'shelf', nth, hash(i, sIdx * 5) * 0.8, 'scrub', 0.5 + hash(i, sIdx * 9) * 0.5, i * 5 + sIdx)
        if (r > 0.9) put(leg.name, i, 'shelf', nth, hash(i, sIdx * 7) * 0.6, 'pine', 0.45 + hash(i, sIdx * 11) * 0.3, i * 23 + sIdx)
      }
      if (kind === 'parapet') {
        // The Gate 1 switchbacks sit eight metres apart and three metres down,
        // so from the rim they are near-parallel strips. Dressing the treads is
        // what stops that reading as a striped ramp: scrub clumps along the
        // lip, the odd pine, boulders fallen off the riser above.
        if (r < 0.62) {
          put(leg.name, i, 'lip', nth, 0.25 + hash(i, sIdx * 5) * 0.7, 'scrub', 0.5 + hash(i, sIdx * 9) * 0.6, i * 5 + sIdx)
        }
        if (r > 0.93) {
          put(leg.name, i, 'lip', nth, hash(i, sIdx * 25) * 0.6, 'pine', 0.45 + hash(i, sIdx * 27) * 0.35, i * 83 + sIdx)
        }
        if (r > 0.6 && r < 0.72) {
          put(leg.name, i, 'lip', nth, 0.85 + hash(i, sIdx * 31) * 0.14, 'rock', 0.3 + hash(i, sIdx * 33) * 0.4, i * 89 + sIdx)
        }
      }
    }
  }
}

// the fallen pine over the deep channel: the crossing is a real tree
const fallenPine = (() => {
  const [a, b] = legRange['log']
  const s0 = S(a)
  const s1 = S(b)
  return {
    at: [round((s0.x + s1.x) / 2), round((s0.y + s1.y) / 2 - 0.14), round((s0.z + s1.z) / 2)],
    scale: round(Math.hypot(s1.x - s0.x, s1.z - s0.z) + 3.4),
    rot: round(-s1.h),
  }
})()

// ---- what lies past the rim -------------------------------------------------
// The town, the sea, far headlands, and the karst highland the canyon is cut
// into. These carry the reveal, so the town is modelled as massing (walls plus
// pitched roofs) rather than left as boxes: haze should describe distance, not
// stand in for the shapes.

const beyond = { houses: [], ridges: [], sea: null, highland: [], terraces: [] }
{
  const endI = anchors['route-end']
  const e = S(endI)
  const dir = [Math.cos(e.h), Math.sin(e.h)]
  const lat = [Math.sin(e.h), -Math.cos(e.h)]
  const at = (along, side, y) => [
    round(e.x + dir[0] * along + lat[0] * side),
    round(y),
    round(e.z + dir[1] * along + lat[1] * side),
  ]

  // The reveal has to read as a TOWN below, not a hamlet. Gate 1's critic
  // flagged that the town mass barely registered and haze was doing the work,
  // so it is built further out, wider, and stepped down the hillside the way a
  // Dalmatian old town actually sits: dense rows on the contour, the roofline
  // the thing you recognise from above.
  let n = 0
  for (let row = 0; row < 11; row++) {
    const along = 78 + row * 16
    const y = e.y - 13 - row * 2.4
    const span = 62 + row * 13
    const count = 8 + row * 2
    for (let k = 0; k < count; k++) {
      n++
      const side = -span / 2 + (span / Math.max(1, count - 1)) * k + jit(n, 3) * 4.2
      const w = 5.0 + hash(n, 11) * 3.6
      const d = 4.6 + hash(n, 13) * 3.2
      const hgt = 5.2 + hash(n, 17) * 4.0
      beyond.houses.push({
        at: at(along + jit(n, 5) * 6.0, side, round(y + hgt / 2)),
        size: [round(w), round(hgt), round(d)],
        rotY: round(-e.h + jit(n, 7) * 0.2),
        roof: round(1.5 + hash(n, 19) * 1.1),
      })
    }
  }
  // one vertical, so the town has something to be recognised by
  beyond.houses.push({
    at: at(122, -14, round(e.y - 30 + 11)),
    size: [5.0, 22, 5.0],
    rotY: round(-e.h),
    roof: 4.2,
    tower: true,
  })

  for (let r = 0; r < 4; r++) {
    beyond.ridges.push({
      at: at(300 + r * 110, (r % 2 ? 1 : -1) * (110 + r * 70), round(e.y - 39 + r * 3)),
      size: [round(120 + r * 70), round(34 + r * 10), round(46 + r * 24)],
      rotY: round(-e.h + jit(r, 31) * 0.5),
    })
  }
  beyond.sea = { at: at(330, 0, round(e.y - 37)), size: [900, 900], rotY: round(-e.h) }

  // The karst highland the canyon is cut into: coarse flat-topped masses on a
  // grid, skipped anywhere near the route so they never close the canyon in.
  // Fog is what turns them into distance; without them the plateau ends in sky.
  const minX = Math.min(...samples.map((s) => s.x)) - 340
  const maxX = Math.max(...samples.map((s) => s.x)) + 340
  const minZ = Math.min(...samples.map((s) => s.z)) - 340
  const maxZ = Math.max(...samples.map((s) => s.z)) + 340
  const CELL = 56
  let hn = 0
  for (let gx = minX; gx < maxX; gx += CELL) {
    for (let gz = minZ; gz < maxZ; gz += CELL) {
      hn++
      const cx = gx + CELL / 2 + jit(hn, 5) * 12
      const cz = gz + CELL / 2 + jit(hn, 9) * 12
      // distance to the route, so the canyon and the town are never buried
      let best = 1e9
      let bestY = 0
      for (let i = 0; i < samples.length; i += 3) {
        const d = Math.hypot(samples[i].x - cx, samples[i].z - cz)
        if (d < best) {
          best = d
          bestY = samples[i].y
        }
      }
      if (best < 78) continue
      const townD = Math.hypot(cx - (e.x + dir[0] * 150), cz - (e.z + dir[1] * 150))
      if (townD < 300) continue
      const top = bestY + 22 + jit(hn, 13) * 6 - Math.max(0, (best - 120) * 0.03)
      beyond.highland.push({
        at: [round(cx), round(top), round(cz)],
        size: [round(CELL * (1.1 + hash(hn, 17) * 0.5)), round(CELL * (1.1 + hash(hn, 19) * 0.5))],
        // per-corner rise, so the plateau tops are tilted planes that meet at
        // ragged joints rather than a field of identical flat lids
        tilt: [round(jit(hn, 41) * 3.2), round(jit(hn, 43) * 3.2), round(jit(hn, 47) * 3.2), round(jit(hn, 53) * 3.2)],
        rotY: round(jit(hn, 23) * 0.5),
      })
    }
  }
}

const art = {
  step: STEP,
  centerline: samples.map((s) => [round(s.x), round(s.y), round(s.z), round(s.h)]),
  legs: artLegs,
  waters,
  scatter,
  fallenPine,
  beyond,
  // only the world below the rim gathers valley haze; the canyon floor must not
  hazeFloor: -18,
  hazeDepth: 16,
}

out('terrain/canyon-art.json', art)
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
