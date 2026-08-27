import * as THREE from 'three'
import type { ChapterManifest, GreyboxTerrain, PathFile, TriggerDef } from './types'
import type { ArtTerrain } from '../art/artTerrain'
import { BlockIndex, type GroundSample } from './terrain'
import { Route, ProgressTracker } from './route'

// Mutable per-frame runtime state, shared across systems without React churn.
// Systems write only their own section; everything else is read-only to them.

export type DogActivity =
  | 'idle'
  | 'trot'
  | 'wait'
  | 'hazard-wait'
  | 'look-back'
  | 'near-miss-hold'
  | 'near-miss-escape'
  | 'stare'
  | 'done'

export const world = {
  ready: false,
  startedAt: 0, // performance.now() when play began
  manifest: null as ChapterManifest | null,
  terrain: null as GreyboxTerrain | null,
  art: null as ArtTerrain | null,
  blocks: null as BlockIndex | null,
  route: null as Route | null,
  paths: new Map<string, PathFile>(),

  player: {
    pos: new THREE.Vector3(),
    heading: 0, // radians, three.js yaw convention
    speed: 0,
    moving: false,
    progress: 0, // arc length along the dog's route
    tracker: null as ProgressTracker | null,
  },

  dog: {
    pos: new THREE.Vector3(),
    heading: 0,
    activity: 'idle' as DogActivity,
    nodeIndex: 0,
    s: 0, // arc length along route
    visible: true,
    // whistle answer: the whistle system bumps this; the dog plays a bark-bounce
    bounceSeq: 0,
    lookAtPlayer: 0, // 0..1 blend the dog mesh uses to turn its head
    devSkipToNode: -1, // dev-only staging harness hook; -1 = inactive
  },

  whistle: {
    lastAt: -1e9, // performance.now() ms
    cooldownMs: 3000,
    pendingAnswerAt: 0, // 0 = none pending
    answerSeq: 0, // bumped when an answer fires; cue component watches this
    answerPos: new THREE.Vector3(),
  },

  triggers: [] as TriggerDef[],
  triggersEntered: new Set<string>(),
}

export function sampleGround(x: number, z: number, fromY: number): GroundSample | null {
  return world.blocks ? world.blocks.sampleGround(x, z, fromY) : null
}

export function pointInSolid(x: number, y: number, z: number): boolean {
  return world.blocks ? world.blocks.pointInSolid(x, y, z) : false
}

// Called by the player system each frame; fills triggersEntered.
export function updateTriggers(pos: THREE.Vector3) {
  for (const t of world.triggers) {
    if (world.triggersEntered.has(t.id)) continue
    if (
      Math.abs(pos.x - t.at[0]) <= t.size[0] / 2 &&
      Math.abs(pos.y - t.at[1]) <= t.size[1] / 2 &&
      Math.abs(pos.z - t.at[2]) <= t.size[2] / 2
    ) {
      world.triggersEntered.add(t.id)
    }
  }
}

export function insideTrigger(id: string, pos: THREE.Vector3): boolean {
  const t = world.triggers.find((t) => t.id === id)
  if (!t) return false
  return (
    Math.abs(pos.x - t.at[0]) <= t.size[0] / 2 &&
    Math.abs(pos.y - t.at[1]) <= t.size[1] / 2 &&
    Math.abs(pos.z - t.at[2]) <= t.size[2] / 2
  )
}

export const isDev =
  import.meta.env.DEV ||
  (typeof location !== 'undefined' && location.search.includes('dev'))
