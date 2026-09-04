// Procedural audio. Everything here is synthesised at runtime from oscillators
// and filtered noise: no samples, no files, nothing sourced from anywhere.
//
// The game is designed to be fully playable with sound off, and nothing below
// carries information the picture does not. What sound adds is the half of a
// morning that a picture cannot: the river, the air moving, a whistle that
// sounds like a boy, an answer that comes from where the dog is.
//
// The bed is chapter data: `audio.bed` in the manifest names a synth patch
// (`synth:canyon-morning`), so a chapter without a river simply asks for a
// different one. An empty id is silence.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let bedNodes: AudioNode[] = []
let bedId = ''
let birdTimer = 0
let unlocked = false

/** Listener frame, in world space: where the ear is and which way it faces. */
const ear = { x: 0, z: 0, fx: 0, fz: 1 }

const MASTER = 0.7

function noise(): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const c = ctx!
  const len = c.sampleRate * 4
  noiseBuf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = noiseBuf.getChannelData(ch)
    // pink-ish: white noise through a cheap one-pole so it is air, not hiss
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = last * 0.96 + w * 0.04
      d[i] = last * 6 + w * 0.15
    }
  }
  return noiseBuf
}

/** True once the user has gestured and the context is running. */
export function audioReady(): boolean {
  return unlocked && !!ctx && ctx.state === 'running'
}

/**
 * Called on the first real gesture. Browsers refuse to start audio before
 * one, and the legend dismisses on the same input, so the two coincide.
 */
export function unlockAudio(): void {
  if (unlocked) {
    if (ctx && ctx.state === 'suspended') void ctx.resume()
    return
  }
  const AC = (window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
    | typeof AudioContext
    | undefined
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  // fade the master in so the bed arrives rather than switches on
  master.gain.setTargetAtTime(MASTER, ctx.currentTime + 0.05, 0.9)
  unlocked = true
  void ctx.resume()
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  })
  if (bedId) startBed(bedId)
}

/** Where the ear is this frame. The camera, in practice. */
export function setListener(x: number, z: number, fx: number, fz: number): void {
  ear.x = x
  ear.z = z
  const l = Math.hypot(fx, fz) || 1
  ear.fx = fx / l
  ear.fz = fz / l
}

/** Stereo position and distance falloff for a world point. */
function spatial(x: number, z: number, reach: number): { pan: number; gain: number; dist: number } {
  const dx = x - ear.x
  const dz = z - ear.z
  const dist = Math.hypot(dx, dz)
  // right of the listener is forward rotated -90 degrees about y
  const rx = ear.fz
  const rz = -ear.fx
  const pan = dist < 0.5 ? 0 : Math.max(-0.85, Math.min(0.85, ((dx * rx + dz * rz) / dist) * 0.85))
  const gain = 1 / (1 + (dist / reach) * (dist / reach))
  return { pan, gain, dist }
}

function out(pan: number, lowpassHz = 0): AudioNode {
  const c = ctx!
  const p = c.createStereoPanner()
  p.pan.value = pan
  if (lowpassHz > 0) {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = lowpassHz
    lp.connect(p)
    p.connect(master!)
    return lp
  }
  p.connect(master!)
  return p
}

// --- the bed ----------------------------------------------------------------

export function requestBed(id: string): void {
  bedId = id
  if (unlocked) startBed(id)
}

function lfo(target: AudioParam, hz: number, depth: number, phase = 0): void {
  const c = ctx!
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.value = hz
  const g = c.createGain()
  g.gain.value = depth
  o.connect(g)
  g.connect(target)
  o.start(c.currentTime + phase)
  bedNodes.push(o, g)
}

function noiseLayer(
  type: BiquadFilterType,
  hz: number,
  q: number,
  level: number,
  wobbleHz: number,
  wobble: number,
): void {
  const c = ctx!
  const src = c.createBufferSource()
  src.buffer = noise()
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = hz
  f.Q.value = q
  const g = c.createGain()
  g.gain.value = level
  src.connect(f)
  f.connect(g)
  g.connect(master!)
  lfo(g.gain, wobbleHz, level * wobble, Math.random())
  src.start()
  bedNodes.push(src, f, g)
}

function stopBed(): void {
  for (const n of bedNodes) {
    try {
      ;(n as AudioScheduledSourceNode).stop?.()
    } catch {
      /* not a source */
    }
    n.disconnect()
  }
  bedNodes = []
  if (birdTimer) window.clearTimeout(birdTimer)
  birdTimer = 0
}

function startBed(id: string): void {
  if (!ctx || !master) return
  stopBed()
  if (id === 'synth:canyon-morning') {
    // the river: a body of water moving over stone, and its spray above it
    noiseLayer('bandpass', 620, 0.55, 0.075, 0.07, 0.3)
    noiseLayer('highpass', 2600, 0.7, 0.014, 0.13, 0.5)
    // air moving down the canyon, slow and low
    noiseLayer('lowpass', 220, 0.9, 0.06, 0.045, 0.6)
    scheduleBird()
  }
}

/** Small birds somewhere on the rim, now and then. Never at the dog. */
function scheduleBird(): void {
  birdTimer = window.setTimeout(
    () => {
      if (!ctx || !master) return
      const pan = Math.random() * 1.4 - 0.7
      const o = out(pan)
      const n = 2 + Math.floor(Math.random() * 3)
      const base = 2600 + Math.random() * 900
      const t0 = ctx.currentTime + 0.05
      for (let i = 0; i < n; i++) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        const g = ctx.createGain()
        const t = t0 + i * (0.16 + Math.random() * 0.08)
        osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.15), t)
        osc.frequency.exponentialRampToValueAtTime(base * 1.25, t + 0.05)
        osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.11)
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.022, t + 0.015)
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.13)
        osc.connect(g)
        g.connect(o)
        osc.start(t)
        osc.stop(t + 0.15)
      }
      scheduleBird()
    },
    6000 + Math.random() * 11000,
  )
}

// --- the whistle --------------------------------------------------------------

/** A boy's two-note whistle: up, then down. Pea-less, breathy, close. */
export function playWhistle(): void {
  if (!audioReady() || !ctx) return
  const c = ctx
  const t0 = c.currentTime + 0.01
  const o = out(-0.08)
  const note = (t: number, f0: number, f1: number, dur: number, level: number) => {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8)
    // a little vibrato, which is what makes it a mouth and not a beep
    const vib = c.createOscillator()
    vib.frequency.value = 6.5
    const vg = c.createGain()
    vg.gain.value = 22
    vib.connect(vg)
    vg.connect(osc.frequency)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level, t + 0.03)
    g.gain.setValueAtTime(level, t + dur - 0.06)
    g.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(g)
    g.connect(o)
    osc.start(t)
    vib.start(t)
    osc.stop(t + dur + 0.02)
    vib.stop(t + dur + 0.02)
    // breath under it
    const br = c.createBufferSource()
    br.buffer = noise()
    const bf = c.createBiquadFilter()
    bf.type = 'bandpass'
    bf.frequency.value = (f0 + f1) / 2
    bf.Q.value = 6
    const bg = c.createGain()
    bg.gain.setValueAtTime(0, t)
    bg.gain.linearRampToValueAtTime(level * 0.35, t + 0.04)
    bg.gain.linearRampToValueAtTime(0, t + dur)
    br.connect(bf)
    bf.connect(bg)
    bg.connect(o)
    br.start(t)
    br.stop(t + dur + 0.02)
  }
  note(t0, 1750, 2450, 0.28, 0.16)
  note(t0 + 0.3, 2500, 1650, 0.34, 0.15)
}

// --- the bark ----------------------------------------------------------------

/**
 * The answer. Comes from where he is, panned and dulled by distance, so with
 * sound on the direction arrives twice: the birds in the picture and the ear.
 */
export function playBark(x: number, z: number, kind: 'answer' | 'bolt' = 'answer'): void {
  if (!audioReady() || !ctx) return
  const c = ctx
  const sp = spatial(x, z, 22)
  const o = out(sp.pan, 5200 / (1 + sp.dist / 26))
  const t0 = c.currentTime + 0.01
  const count = kind === 'bolt' ? 1 : 2
  for (let i = 0; i < count; i++) {
    const t = t0 + i * 0.19
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    const f = kind === 'bolt' ? 640 : 560
    osc.frequency.setValueAtTime(f, t)
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.1)
    // the throat: two formants
    const f1 = c.createBiquadFilter()
    f1.type = 'bandpass'
    f1.frequency.value = 900
    f1.Q.value = 1.4
    const f2 = c.createBiquadFilter()
    f2.type = 'bandpass'
    f2.frequency.value = 1900
    f2.Q.value = 2.5
    const g = c.createGain()
    const level = 0.42 * sp.gain
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(level, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
    osc.connect(f1)
    osc.connect(f2)
    f1.connect(g)
    f2.connect(g)
    g.connect(o)
    osc.start(t)
    osc.stop(t + 0.17)
    // the chesty part: a noise burst under the tone
    const n = c.createBufferSource()
    n.buffer = noise()
    const nf = c.createBiquadFilter()
    nf.type = 'bandpass'
    nf.frequency.value = 700
    nf.Q.value = 0.8
    const ng = c.createGain()
    ng.gain.setValueAtTime(0, t)
    ng.gain.linearRampToValueAtTime(level * 0.5, t + 0.01)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    n.connect(nf)
    nf.connect(ng)
    ng.connect(o)
    n.start(t)
    n.stop(t + 0.1)
  }
}

// --- footfalls -----------------------------------------------------------------

let lastStep = 0
/** A shoe or a paw on gravel. Tiny, and only near the ear. */
export function playStep(kind: 'boy' | 'dog', x: number, z: number): void {
  if (!audioReady() || !ctx) return
  const c = ctx
  const now = c.currentTime
  if (now - lastStep < 0.06) return
  lastStep = now
  const sp = spatial(x, z, kind === 'boy' ? 10 : 7)
  if (sp.gain < 0.05) return
  const o = out(sp.pan)
  const n = c.createBufferSource()
  n.buffer = noise()
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = kind === 'boy' ? 640 + Math.random() * 160 : 900 + Math.random() * 300
  f.Q.value = 0.7
  const g = c.createGain()
  const level = (kind === 'boy' ? 0.11 : 0.035) * sp.gain
  const t = now + 0.005
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0008, t + (kind === 'boy' ? 0.07 : 0.045))
  n.connect(f)
  f.connect(g)
  g.connect(o)
  n.start(t)
  n.stop(t + 0.1)
}
