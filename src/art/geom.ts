import * as THREE from 'three'

// Painting helpers. Every art mesh in the game is a non-indexed buffer with a
// per-vertex palette colour and a per-vertex shadow mix, so one ramp material
// can shade a whole character or a whole canyon in a single draw call.

const _c = new THREE.Color()

/** Give a geometry a flat palette colour and shadow mix, ready to merge. */
export function paint(
  geom: THREE.BufferGeometry,
  hex: string,
  shadowMix: number,
  tone = 1,
): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom
  if (g !== geom) geom.dispose()
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  const sh = new Float32Array(n)
  _c.set(hex)
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * tone
    col[i * 3 + 1] = _c.g * tone
    col[i * 3 + 2] = _c.b * tone
    sh[i] = shadowMix
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aShadow', new THREE.BufferAttribute(sh, 1))
  g.computeVertexNormals()
  return g
}

export function place(
  geom: THREE.BufferGeometry,
  pos: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]))
  m.compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    q,
    new THREE.Vector3(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1),
  )
  geom.applyMatrix4(m)
  return geom
}

/** Merge painted geometries into one buffer. Positions, colours, shadow mix. */
export function mergePainted(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0
  for (const g of geoms) count += g.attributes.position.count
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const sh = new Float32Array(count)
  let o = 0
  for (const g of geoms) {
    const n = g.attributes.position.count
    pos.set(g.attributes.position.array as Float32Array, o * 3)
    nor.set(g.attributes.normal.array as Float32Array, o * 3)
    col.set(g.attributes.color.array as Float32Array, o * 3)
    sh.set(g.attributes.aShadow.array as Float32Array, o)
    o += n
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.setAttribute('aShadow', new THREE.BufferAttribute(sh, 1))
  return out
}
