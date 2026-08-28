import type { ChapterManifest, GreyboxTerrain, PathFile } from './types'
import type { ArtTerrain } from '../art/artTerrain'
import { BlockIndex } from './terrain'
import { Route, ProgressTracker } from './route'
import { world } from './world'
import { now } from './clock'

const BASE = '/chapters/'

async function fetchJson<T>(rel: string): Promise<T> {
  const res = await fetch(BASE + rel)
  if (!res.ok) throw new Error('failed to load ' + rel + ': ' + res.status)
  return (await res.json()) as T
}

// Loads a chapter manifest and everything it references. The engine knows
// nothing about any specific chapter; it only knows this schema.
export async function loadChapter(id: string): Promise<void> {
  const manifest = await fetchJson<ChapterManifest>(id + '.json')

  const terrain = await fetchJson<GreyboxTerrain>(manifest.environment.terrain)
  const art = manifest.environment.artTerrain
    ? await fetchJson<ArtTerrain>(manifest.environment.artTerrain)
    : null

  // collect every path file the dog route references
  const pathRefs = new Set<string>()
  for (const node of manifest.dogRoute) {
    if (node.type === 'trot') pathRefs.add(node.path)
    if (node.type === 'near-miss') pathRefs.add(node.escape)
  }
  const paths = new Map<string, PathFile>()
  await Promise.all(
    [...pathRefs].map(async (ref) => {
      paths.set(ref, await fetchJson<PathFile>(ref))
    }),
  )

  world.manifest = manifest
  world.terrain = terrain
  world.art = art
  world.blocks = new BlockIndex(terrain.blocks)
  world.paths = paths
  world.route = new Route(manifest.dogRoute, paths)
  world.triggers = manifest.triggers
  world.triggersEntered.clear()

  const [sx, sy, sz] = manifest.spawn.position
  world.player.pos.set(sx, sy, sz)
  world.player.visualY = sy
  world.player.heading = (manifest.spawn.facing * Math.PI) / 180
  world.player.tracker = new ProgressTracker(world.route)
  world.dog.nodeIndex = 0
  world.dog.activity = 'idle'
  const first = world.route.nodes[0]
  world.dog.pos.copy(first.points[0])
  world.dog.s = first.s0
  world.startedAt = now()
  world.ready = true
}
