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
        sunDir: [15, 30],
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
// left them.
//
// A leg's `chain` is ONE continuous cross-section running from the far left of
// the world to the far right: plateau, rim, cliff, talus, bank, river, floor,
// and back up the other side. One chain rather than two half-profiles, so the
// world is closed — no sky under the canyon floor, no cliff stopping in mid-air.
//
// EVERY chain has the same rungs in the same order, whatever the leg is: a
// stretch with a cliff on one side and a river on the other differs from its
// neighbour only in where those rungs sit, never in what they are. That is what
// lets the engine BLEND across a leg boundary instead of overlapping two
// different shapes and letting them tear through each other, which is what a
// river crossing a path did before.
//
// Each point is `{o, y, m, j, t}`: signed lateral offset in meters, height
// relative to the centerline, palette material id, how far the point may wander
// per sample, and a tag the scatter placer looks things up by.

const hash = (a, b = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}
const jit = (a, b) => hash(a, b) * 2 - 1 // -1..1, deterministic

const P = (o, y, m, j = 0, t = '') => ({ o: round(o), y: round(y), m, j, t })

// The thirteen rungs, outward from the floor edge. Their meaning is fixed:
//   0 edge  1 bank  2 waterline  3 bed  4 farbank  5 talus
//   6 lower cliff  7 ledge  8 mid cliff  9 upper cliff  10 rim  11-12 plateau
// A side with no river collapses rungs 1-4 into the foot of its wall.
const RUNGS = 13

function wallSide(W, surf, top = 1) {
  const T = (v) => v * top
  return [
    P(W, 0.1, surf, 0.08, 'edge'),
    P(W + 0.8, 0.5, 'scree', 0.16),
    P(W + 1.3, 0.9, 'scree', 0.2),
    P(W + 1.9, 1.4, 'scree', 0.28),
    P(W + 2.4, 1.9, 'scree', 0.36),
    P(W + 2.9, T(2.6), 'scree', 0.46, 'talus'),
    P(W + 4.0, T(5.6), 'limestone', 0.55),
    P(W + 3.6, T(7.8), 'limestone', 0.6, 'ledge'),
    P(W + 4.8, T(10.8), 'limestone', 0.7),
    P(W + 5.4, T(16.2), 'limestone', 0.85),
    P(W + 7.6, T(22.9), 'limestone', 1.0, 'rim'),
    P(W + 15.0, T(23.8), 'scrub', 1.6, 'plateau'),
    P(W + 34.0, T(22.4), 'scrub', 2.8, 'plateau'),
  ]
}

// The far bank is a terrace, not a second cliff. A river canyon really does cut
// one bank lower than the other, and a slot with full-height walls both sides
// puts the whole floor in shade all morning, which would mean the documented
// path value never once appears on screen.
function waterSide(W, surf) {
  return [
    P(W, 0.1, surf, 0.08, 'edge'),
    P(W + 0.55, -0.3, 'wetstone', 0.12, 'bank'),
    P(W + 1.15, -0.95, 'wetstone', 0.1, 'waterline'),
    P(W + 8.4, -1.15, 'wetstone', 0.16, 'bed'),
    P(W + 9.5, 0.1, 'sand', 0.22, 'farbank'),
    P(W + 11.2, 2.4, 'scree', 0.45, 'talus'),
    P(W + 12.6, 6.0, 'limestone', 0.55),
    P(W + 14.8, 7.2, 'scrub', 0.7, 'terrace'),
    P(W + 20.0, 11.2, 'limestone', 0.8),
    P(W + 23.4, 17.0, 'limestone', 0.9),
    P(W + 26.4, 21.0, 'limestone', 1.0, 'rim'),
    P(W + 34.0, 22.0, 'scrub', 1.8, 'plateau'),
    P(W + 52.0, 20.0, 'scrub', 2.8, 'plateau'),
  ]
}

// The crossing: the river runs across the path, so the near bank is a shallow
// gravel shelf and the floor simply continues into the water.
function fordSide(W, surf) {
  return [
    P(W, -0.14, surf, 0.05, 'edge'),
    // a damp band above the waterline: art-direction.md asks for soft contact
    // darkening where things meet ground, and a shoreline is the clearest case
    P(W + 0.5, -0.3, 'wetstone', 0.08, 'bank'),
    P(W + 0.95, -0.6, 'wetstone', 0.1, 'waterline'),
    P(W + 6.6, -0.9, 'wetstone', 0.16, 'bed'),
    P(W + 8.0, 0.3, 'sand', 0.22, 'farbank'),
    P(W + 9.8, 2.4, 'scree', 0.45, 'talus'),
    P(W + 11.4, 6.0, 'limestone', 0.55),
    P(W + 14.8, 7.2, 'scrub', 0.7, 'terrace'),
    P(W + 20.0, 11.2, 'limestone', 0.8),
    P(W + 23.4, 17.0, 'limestone', 0.9),
    P(W + 26.4, 21.0, 'limestone', 1.0, 'rim'),
    P(W + 34.0, 22.0, 'scrub', 1.8, 'plateau'),
    P(W + 52.0, 20.0, 'scrub', 2.8, 'plateau'),
  ]
}

// Low enough to keep the cross-hairpin sightline Gate 1's staging depends on,
// then a shelf that runs out to meet the neighbouring switchback.
function lowWallSide(W, surf) {
  return [
    P(W, 0.1, surf, 0.08, 'edge'),
    P(W + 0.55, 0.55, 'scree', 0.14),
    P(W + 0.9, 0.95, 'scree', 0.16),
    P(W + 1.25, 1.45, 'limestone', 0.18),
    P(W + 1.6, 1.85, 'limestone', 0.2),
    P(W + 1.95, 2.05, 'limestone', 0.22, 'talus'),
    P(W + 3.0, 2.2, 'scree', 0.3),
    P(W + 4.4, 2.3, 'scree', 0.4, 'shelf'),
    P(W + 6.0, 2.1, 'scree', 0.45),
    P(W + 7.2, 1.7, 'limestone', 0.5),
    P(W + 8.4, 1.4, 'limestone', 0.6, 'rim'),
    P(W + 12.0, 0.9, 'scree', 0.8, 'plateau'),
    P(W + 20.0, -0.6, 'scree', 1.2, 'plateau'),
  ]
}

// The rim edge and the switchback terraces. The Gate 1 layout puts adjacent
// switchback legs about eight metres apart and three metres down from each
// other, so the drop between them is a terrace face, not a cliff. Anything
// deeper punches through the leg below and the hillside reads as stacked
// ribbons. Dry limestone and scree, never scrub: green banding here turns a
// Dalmatian hillside into a set of lawns.
function parapetSide(W, surf) {
  return [
    P(W, 0.1, surf, 0.07, 'edge'),
    P(W + 0.45, 0.62, 'limestone', 0.1, 'lip'),
    P(W + 0.72, 0.45, 'limestone', 0.1),
    P(W + 0.92, 0.05, 'limestone', 0.12),
    P(W + 1.08, -1.3, 'limestone', 0.16),
    P(W + 1.25, -2.9, 'limestone', 0.2, 'talus'),
    P(W + 2.1, -3.2, 'scree', 0.3),
    P(W + 3.2, -3.5, 'scree', 0.36, 'shelf'),
    P(W + 4.6, -3.6, 'scree', 0.42),
    P(W + 6.0, -3.7, 'scree', 0.5),
    P(W + 7.6, -3.9, 'scree', 0.6, 'rim'),
    P(W + 12.0, -4.4, 'scree', 0.9, 'plateau'),
    P(W + 20.0, -5.4, 'scree', 1.3, 'plateau'),
  ]
}

function fallAwaySide(W, surf) {
  return [
    P(W, 0.1, surf, 0.08, 'edge'),
    P(W + 0.9, -0.3, 'scree', 0.14),
    P(W + 1.6, -0.7, 'scree', 0.2),
    P(W + 2.4, -1.2, 'scree', 0.28),
    P(W + 3.2, -1.9, 'scree', 0.36),
    P(W + 4.2, -2.8, 'scree', 0.45, 'talus'),
    P(W + 6.0, -4.0, 'limestone', 0.6),
    P(W + 8.0, -5.0, 'limestone', 0.7, 'ledge'),
    P(W + 11.0, -6.2, 'limestone', 0.9),
    P(W + 15.0, -7.4, 'limestone', 1.1),
    P(W + 20.0, -8.4, 'limestone', 1.3, 'rim'),
    P(W + 28.0, -9.6, 'scrub', 1.8, 'plateau'),
    P(W + 44.0, -11.4, 'scrub', 2.6, 'plateau'),
  ]
}

// The plank crossing: the fallen pine is the floor and the channel walls belong
// to the bowl legs either side of it.
function logSide(W, surf) {
  const out = [P(W, -0.06, surf, 0, 'edge')]
  for (let k = 1; k < RUNGS; k++) {
    const t = k / (RUNGS - 1)
    out.push(P(W + 0.25 + t * 11, -1.9 - t * 2.2, 'limestone', 0.1 + t * 0.5, k === 5 ? 'talus' : ''))
  }
  return out
}

const wallTop = { narrows: 1.2, 'ledge-approach': 1.15, ledge: 1.12, bowl: 0.85, bowl2: 0.88, hole: 0.92 }

const artLegs = []
for (const leg of legs) {
  const W = leg.width / 2 + (leg.pad ?? 1.6) / 2
  const top = wallTop[leg.name] ?? 1
  const side = (kind) => {
    if (leg.name === 'log') return logSide(W, leg.surface)
    if (leg.ford) return fordSide(W, leg.surface)
    switch (kind) {
      case 'wall':
        return wallSide(W, leg.surface, top)
      case 'lowwall':
        return lowWallSide(W, leg.surface)
      case 'parapet':
        return parapetSide(W, leg.surface)
      case 'water':
        return waterSide(W, leg.surface)
      default:
        return fallAwaySide(W, leg.surface)
    }
  }

  const leftHalf = side(leg.left)
  const rightHalf = side(leg.right)

  // left half mirrored to negative offsets, the floor across the middle, right
  // half. The walked track is narrower than the ground it crosses: without that
  // the canyon floor is one unbroken sheet of the path value, and #EFE3C8
  // across half the frame is a white road, not a canyon.
  // A canyon footpath is about a metre wide, not three and a half. Keeping the
  // bright track narrow is what stops the documented path value — #EFE3C8, the
  // lightest hex in the chapter — from occupying half of every frame and
  // flattening the composition into a white road.
  const track = Math.min(W * 0.45, 1.35)
  // the crossing is a dip you wade: the bed sits below the water level across
  // the whole ford leg, so the path enters and leaves the water at its ends
  // Deep enough that the whole crossing is under water even where the profile
  // blends back into the banks either side: a bed that surfaces mid-ford leaves
  // the water plane cutting a spiky outline through the path.
  const bed = leg.ford ? -0.52 : 0
  const chain = []
  for (let i = leftHalf.length - 1; i >= 1; i--) {
    const p = leftHalf[i]
    chain.push({ o: round(-p.o), y: p.y, m: p.m, j: p.j, t: p.t })
  }
  chain.push({ o: round(-leftHalf[0].o), y: leftHalf[0].y, m: leftHalf[0].m, j: leftHalf[0].j, t: 'edge' })
  chain.push(P(-(track + 0.85), bed + 0.09, 'scree', 0.16, 'shoulder'))
  chain.push(P(-track, bed + 0.015, leg.surface, 0.05, 'floor'))
  chain.push(P(0, bed, leg.surface, 0, 'floor'))
  chain.push(P(track, bed + 0.015, leg.surface, 0.05, 'floor'))
  chain.push(P(track + 0.85, bed + 0.09, 'scree', 0.16, 'shoulder'))
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
// ONE surface. Levels are absolute world heights sampled per centerline step
// and smoothed, not a drop measured from each leg's own floor: a per-leg drop
// steps at every leg boundary and the reaches shear through each other, which
// is exactly what a river must never do.

const rawLevel = samples.map((s) => {
  const leg = legByName[s.leg]
  if (leg.deepWater) return s.y - 1.6
  if (leg.ford) return S(anchors['ford-near']).y - 0.34
  return s.y - 0.95
})
const waterLevel = rawLevel.map((_, i) => {
  let sum = 0
  let n = 0
  // short enough that the ford's own level survives the smoothing: a window
  // wider than the crossing averages it back into the reaches either side and
  // the water ends up under the path instead of over it
  for (let k = -3; k <= 3; k++) {
    const j = i + k
    if (j < 0 || j >= rawLevel.length) continue
    sum += rawLevel[j]
    n++
  }
  return round(sum / n)
})

const waters = []
for (const leg of legs) {
  const [a, b] = legRange[leg.name]
  const chain = artLegs.find((l) => l.name === leg.name).chain
  const levels = []
  for (let i = a; i <= b; i++) levels.push(waterLevel[i])
  // Reaches are expressed as fractional CROSS-SECTION RUNG indices, not as
  // lateral offsets. The banks wander per sample, so a reach at a fixed offset
  // cuts a ragged edge through them; a reach anchored to the waterline rung has
  // its shoreline exactly where the bank is, every sample, for free.
  const reach = (fromK, toK, material, opacity = 1) => {
    if (Math.abs(toK - fromK) < 1e-3) return
    waters.push({
      range: [a, b],
      fromK: round(Math.min(fromK, toK)),
      toK: round(Math.max(fromK, toK)),
      material,
      opacity,
      levels,
    })
  }
  const tagIdx = (tag) => {
    const hits = []
    chain.forEach((p, i) => {
      if (p.t === tag) hits.push(i)
    })
    return hits
  }
  const wl = tagIdx('waterline')
  if (leg.ford) {
    // the crossing: shallow water running right across the path, bank to bank,
    // with the gravel bed readable through it
    if (wl.length === 2) reach(wl[0], wl[1], 'riverShallow', 0.78)
    continue
  }
  if (leg.deepWater) {
    reach(0, chain.length - 1, 'riverDeep')
    continue
  }
  const bedIdx = tagIdx('bed')
  for (let n = 0; n < wl.length; n++) {
    const k0 = wl[n]
    const k1 = bedIdx[n] ?? (k0 < chain.length / 2 ? k0 - 1 : k0 + 1)
    // Depth told by hue: a lighter band over the gravel at each shore, the
    // documented river value through the middle. That, and nothing else, is
    // what water is allowed to do here.
    const lo = Math.min(k0, k1)
    const hi = Math.max(k0, k1)
    reach(lo, lo + 0.22, 'riverShallow')
    reach(lo + 0.22, hi - 0.22, 'river')
    reach(hi - 0.22, hi, 'riverShallow')
  }
}

// ---- scatter --------------------------------------------------------------
// Placed by cross-section point, not by absolute height, so a pine sits on the
// jittered surface the engine actually builds rather than floating above a
// number this script guessed. `k`/`t` name a segment of the leg's chain and how
// far along it the thing stands.

const scatter = []
const put = (legName, i, tag, nth, t, kind, scale, seed) => {
  const k = chainIndex(legName, tag, nth)
  if (k < 0) return
  scatter.push({ kind, i, k, t: round(t), scale: round(scale), rot: round(hash(seed, 7) * Math.PI * 2) })
}

for (const leg of legs) {
  const [a, b] = legRange[leg.name]
  for (let i = a; i <= b; i++) {
    const sides = [leg.left, leg.right]
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const kind = sides[sIdx]
      const nth = sIdx
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
      if (sIdx === 0 && r > 0.86) {
        put(leg.name, i, 'shoulder', 0, hash(i, 41) * 0.9, 'rock', 0.22 + hash(i, 43) * 0.3, i * 53)
      }
      if (sIdx === 1 && r < 0.13) {
        put(leg.name, i, 'shoulder', 1, hash(i, 47) * 0.9, 'rock', 0.22 + hash(i, 49) * 0.32, i * 59)
      }
      if (leg.ford) {
        // The ford has to read as a PLACE you cross, not as two ponds either
        // side of a path. Stepping stones through the shallows and a gravel bar
        // at the near bank are what say "here, and here is how".
        if (r < 0.42) {
          put(leg.name, i, 'bed', nth, 0.06 + hash(i, sIdx * 5) * 0.3, 'rock', 0.3 + hash(i, sIdx * 9) * 0.34, i * 97 + sIdx)
        }
        if (r > 0.72) {
          put(leg.name, i, 'bank', nth, hash(i, sIdx * 13) * 0.8, 'rock', 0.22 + hash(i, sIdx * 17) * 0.26, i * 101 + sIdx)
        }
      }
      if (kind === 'lowwall') {
        if (r < 0.22) put(leg.name, i, 'shelf', nth, hash(i, sIdx * 5) * 0.8, 'scrub', 0.5 + hash(i, sIdx * 9) * 0.5, i * 5 + sIdx)
        if (r > 0.9) put(leg.name, i, 'shelf', nth, hash(i, sIdx * 7) * 0.6, 'pine', 0.45 + hash(i, sIdx * 11) * 0.3, i * 23 + sIdx)
      }
      if (kind === 'parapet') {
        // The Gate 1 switchbacks sit eight metres apart and three metres down,
        // so from the rim they are near-parallel strips. Dressing the treads is
        // what stops that reading as a striped ramp.
        if (r < 0.62) {
          put(leg.name, i, 'shelf', nth, 0.25 + hash(i, sIdx * 5) * 0.7, 'scrub', 0.5 + hash(i, sIdx * 9) * 0.6, i * 5 + sIdx)
        }
        if (r > 0.93) {
          put(leg.name, i, 'shelf', nth, hash(i, sIdx * 25) * 0.6, 'pine', 0.45 + hash(i, sIdx * 27) * 0.35, i * 83 + sIdx)
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

  // The reveal has to read as a TOWN below, not a hamlet and not a shelf of
  // identical tents. Gate 1's critic flagged that the town mass barely
  // registered and haze was doing the work. Three things carry it: heights and
  // footprints varied enough to make a broken roofline, one vertical at three
  // times house height so there is a landmark to recognise, and a rock shelf
  // under the waterside rows so the town is founded on something instead of
  // terminating in mid-air against the sea.
  let n = 0
  for (let row = 0; row < 11; row++) {
    const along = 78 + row * 16
    const y = e.y - 13 - row * 2.4
    const span = 62 + row * 13
    const count = 8 + row * 2
    for (let k = 0; k < count; k++) {
      n++
      const side = -span / 2 + (span / Math.max(1, count - 1)) * k + jit(n, 3) * 4.2
      // Street voids. A town's silhouette from above is roofs AND the dark gaps
      // between them; an unbroken rank of roofs reads as a tent encampment.
      const street = Math.abs(((side + span / 2) % (span / 3)) - span / 6) < 2.6
      if (street && hash(n, 37) > 0.35) continue
      const tall = hash(n, 23) > 0.78
      const w = 4.2 + hash(n, 11) * 5.4
      const d = 4.0 + hash(n, 13) * 4.4
      const hgt = tall ? 9.5 + hash(n, 17) * 4.5 : 4.2 + hash(n, 29) * 4.0
      beyond.houses.push({
        at: at(along + jit(n, 5) * 6.0, side, round(y + hgt / 2)),
        size: [round(w), round(hgt), round(d)],
        rotY: round(-e.h + jit(n, 7) * 0.24),
        // pitch varies with footprint the way a real roof does
        roof: round(1.0 + hash(n, 19) * 1.6 + w * 0.09),
      })
    }
  }

  // the campanile: three times a house, so the eye has somewhere to land
  beyond.houses.push({
    at: at(126, -16, round(e.y - 32 + 21)),
    size: [4.0, 42, 4.0],
    rotY: round(-e.h),
    roof: 6.0,
    tower: true,
  })

  // The hillside between the last switchback and the first roofs, and the shelf
  // the town stands on. Without these the town sits on the edge of nothing, the
  // waterside houses are cut off by the sea band, and the reveal has a hole in
  // its middle distance.
  for (let t = 0; t < 9; t++) {
    beyond.terraces.push({
      at: at(16 + t * 8, jit(t, 61) * 6, round(e.y - 3.2 - t * 1.3)),
      size: [round(11 + t * 1.4), round(74 + t * 12)],
      rotY: round(-e.h + jit(t, 67) * 0.06),
      drop: round(1.6 + hash(t, 71) * 0.9),
    })
  }
  for (let t = 0; t < 5; t++) {
    beyond.terraces.push({
      at: at(96 + t * 42, jit(t, 91) * 10, round(e.y - 15 - t * 5.2)),
      size: [round(50 + t * 14), round(150 + t * 40)],
      rotY: round(-e.h),
      drop: round(6 + t * 2.5),
    })
  }

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
