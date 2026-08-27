// Shared input bus. Keyboard is bound here; the mobile joystick and whistle
// button write through setJoystick() / requestWhistle(). Consumers read
// `input.move` per frame; whistle requests are consumed by the whistle system.

export const input = {
  // normalized move intent in camera-relative space: x = strafe, z = forward
  move: { x: 0, z: 0 },
  joystick: { active: false, x: 0, z: 0 },
  whistleRequested: false,
  anyInputSeen: false,
}

const keys = new Set<string>()

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
])

function recompute() {
  let x = 0
  let z = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (input.joystick.active) {
    x = input.joystick.x
    z = input.joystick.z
  }
  const len = Math.hypot(x, z)
  if (len > 1) {
    x /= len
    z /= len
  }
  input.move.x = x
  input.move.z = z
}

export function setJoystick(active: boolean, x = 0, z = 0) {
  input.joystick.active = active
  input.joystick.x = x
  input.joystick.z = z
  if (active) input.anyInputSeen = true
  recompute()
}

export function requestWhistle() {
  input.whistleRequested = true
  input.anyInputSeen = true
}

export function consumeWhistleRequest(): boolean {
  const r = input.whistleRequested
  input.whistleRequested = false
  return r
}

export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (e.repeat) return
    input.anyInputSeen = true
    if (MOVE_KEYS.has(e.code)) {
      keys.add(e.code)
      recompute()
      e.preventDefault()
    } else if (e.code === 'KeyF' || e.code === 'Space') {
      requestWhistle()
      e.preventDefault()
    }
  }
  const up = (e: KeyboardEvent) => {
    if (keys.delete(e.code)) recompute()
  }
  const blur = () => {
    keys.clear()
    recompute()
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}
