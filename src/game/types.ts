// Chapter manifest types. Mirrors the schema in docs/game-design.md.
// Any field added here is added for all chapters — no one-offs.

export type Vec3 = [number, number, number]

export type Surface = 'dust' | 'gravel' | 'sand' | 'stone' | 'wood' | 'rock' | 'water'

// Wait conditions: seconds since the node became active, player proximity in
// meters, or a named trigger volume. First satisfied condition releases the node.
export interface WaitUntil {
  time?: number
  proximity?: number
  trigger?: string
}

// Optional staging played when a wait releases, before the dog moves on.
// `face` turns him toward a world point, `hold` freezes him there in seconds.
// Chapter 1 uses it for the bolt: the stare up-canyon at nothing.
export interface WaitExit {
  face?: Vec3
  hold?: number
}

export type DogNode =
  | { type: 'trot'; path: string; speed?: number }
  | { type: 'wait'; at: Vec3; until: WaitUntil; exit?: WaitExit; idle?: 'stand' | 'sniff' }
  | { type: 'hazard-wait'; at: Vec3; safetyTrigger: string }
  | { type: 'look-back'; at: Vec3; variant: 'auto' | string }
  | {
      type: 'near-miss'
      at: Vec3
      approach: number // authored closing distance in meters (D1)
      contact: 'none' | string // 'none' or an authored variant, e.g. ch2 'collar-touch'
      escape: string // path file the breakaway runs
    }
  | { type: 'vanish'; at: Vec3 }
  | { type: 'appear'; at: Vec3 }

export interface LightingState {
  id: string
  sunDir: [number, number] // azimuth, elevation in degrees
  sun: string
  ambient: string
  fog: { color: string; near: number; far: number }
}

export interface TriggerDef {
  id: string
  shape: 'box'
  at: Vec3
  size: Vec3
}

export interface CameraDef {
  id: string
  trigger: string // framed while the player is inside this trigger volume
  position: Vec3
  lookAt: Vec3
}

export interface ChapterManifest {
  id: string
  title: string
  spawn: { position: Vec3; facing: number }
  gait: { from: string; to: string }
  lighting: { states: LightingState[]; blendBy: 'none' | 'routeProgress' }
  environment: {
    terrain: string // .json greybox at Gate 1, .glb once art exists
    surfaces?: string
    props?: { model: string; at: Vec3 }[]
  }
  dogRoute: DogNode[]
  trail: {
    pawprintSurfaces: Surface[]
    disturbances: unknown[]
    witnesses: unknown[]
    glimpses: { id: string; volume?: string; focus?: string }[]
  }
  whistle: {
    mode: 'honest' | 'misleading' | 'companion'
    falseSources: unknown[]
  }
  triggers: TriggerDef[]
  cameras: CameraDef[]
  map: { shown: boolean; landmarks: string[] }
  audio: { bed: string; barkSet: string }
  exit: { trigger: string; next: string | null }
}

// Grey-box terrain format (Gate 1). A .json terrain is a list of blocks the
// engine builds meshes and collision from. Replaced by .glb terrain at Gate 2+.
export interface GreyboxBlock {
  at: Vec3 // center
  size: Vec3
  rotY?: number // radians, three.js convention
  surface: Surface
  walkable: boolean
  tone?: number // 0..1 grey value hint
}

export interface GreyboxTerrain {
  blocks: GreyboxBlock[]
  decor: GreyboxBlock[] // render-only, no collision (distant town, sea)
}

export interface PathFile {
  points: Vec3[]
}
