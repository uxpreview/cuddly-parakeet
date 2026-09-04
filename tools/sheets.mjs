// Contact sheets, shared by tools/record.mjs (which makes them at capture time)
// and tools/dev/resheet.mjs (which rebuilds them from frames already on disk).
//
// Two kinds of sheet per take, each paged. The wide pages are the take at a
// glance, evenly sampled and time-labelled so a note can cite a moment. The dog
// pages are the same frames cropped and zoomed onto him, because at the ranges
// this chapter stages him he is twenty pixels tall in a wide cell and no
// judgement about his gait, his tail or his look-backs can be made from that.
//
// The browser is the image codec here, as everywhere else in tools/.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Thirty samples per take, but NOT thirty cells in one image.
//
// A sheet is read by an agent, and an agent's vision downsamples whatever it is
// handed to a fixed budget. The old sheet was one 2548x1284 PNG: by the time it
// reached a reader, this chapter's near-horizontal cliff strata had aliased into
// a radial fan of spokes converging on the vanishing point -- an artefact
// present in no captured frame, and the sort of thing a harsh critic would
// correctly call an art fault. Cropping a single cell out at 1:1 shows smooth
// bands and no fan.
//
// So the samples are paged, and a page is sized to be read at 1:1 rather than
// resampled. Judge detail from the dog pages and from tools/dev/beat.mjs; the
// wide pages say where in the take you are.
// A wide cell is EXACTLY half a captured frame, never a fitted 0.44x. The
// canyon's strata sit four to eight pixels apart at 960: any non-power-of-two
// downscale smears them into radial streaks converging on the vanishing point,
// which is what the earlier 420px cells produced. A clean 2:1 box halving keeps
// them as bands. Six cells to a page keeps the page inside a reader's 1:1 range.
export const SAMPLES = 30
export const WIDE_COLS = 2
export const WIDE_ROWS = 3
export const DOG_COLS = 4
export const DOG_ROWS = 4

/** Evenly sample `n` frame indices across a take. */
export function pickFrames(frames, n = SAMPLES) {
  return Array.from({ length: n }, (_, i) =>
    Math.min(frames - 1, Math.round((i * (frames - 1)) / (n - 1))),
  )
}

/** Split a list into pages of at most `per`. */
const paginate = (list, per) => {
  const out = []
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per))
  return out
}

const dataUrls = (frameDir, picks) =>
  picks.map(
    (f) =>
      'data:image/jpeg;base64,' +
      readFileSync(join(frameDir, `${String(f).padStart(4, '0')}.jpg`)).toString('base64'),
  )

// --- the wide sheet --------------------------------------------------------
async function renderWide({ imgs, cols, rows, labels }) {
  const loaded = await Promise.all(
    imgs.map(async (src) => {
      const im = new Image()
      im.src = src
      await im.decode()
      return im
    }),
  )
  const w = loaded[0].width
  const h = loaded[0].height
  // Halve, repeatedly, and stop: 960 -> 480, or 390 -> 390. Never a fitted
  // fractional scale. See the note at the top of this file.
  let cw = w
  let ch = h
  while (cw > 620) {
    cw = Math.round(cw / 2)
    ch = Math.round(ch / 2)
  }
  const shrink = (im) => {
    let src = im
    let sw = im.width
    let sh = im.height
    while (sw > cw) {
      const nw = Math.max(cw, Math.round(sw / 2))
      const nh = Math.max(ch, Math.round(sh / 2))
      const t = document.createElement('canvas')
      t.width = nw
      t.height = nh
      const tx = t.getContext('2d')
      tx.imageSmoothingEnabled = true
      tx.imageSmoothingQuality = 'high'
      tx.drawImage(src, 0, 0, nw, nh)
      src = t
      sw = nw
      sh = nh
    }
    return src
  }
  const pad = 4
  const c = document.createElement('canvas')
  c.width = cols * cw + (cols + 1) * pad
  c.height = rows * (ch + 16) + (rows + 1) * pad
  const x = c.getContext('2d')
  x.fillStyle = '#141414'
  x.fillRect(0, 0, c.width, c.height)
  x.imageSmoothingEnabled = true
  x.imageSmoothingQuality = 'high'
  loaded.forEach((im, i) => {
    const cx = pad + (i % cols) * (cw + pad)
    const cy = pad + Math.floor(i / cols) * (ch + 16 + pad)
    x.drawImage(shrink(im), cx, cy, cw, ch)
    x.fillStyle = '#cfcfcf'
    x.font = '12px monospace'
    x.fillText(labels[i], cx + 2, cy + ch + 12)
  })
  return c.toDataURL('image/png')
}

// --- the dog sheet ---------------------------------------------------------
async function renderDog({ imgs, cols, rows, labels, boxes, dsf }) {
  const loaded = await Promise.all(
    imgs.map(async (src) => {
      const im = new Image()
      im.src = src
      await im.decode()
      return im
    }),
  )
  const CW = 300
  const CH = 190
  const pad = 4
  const c = document.createElement('canvas')
  c.width = cols * CW + (cols + 1) * pad
  c.height = rows * (CH + 16) + (rows + 1) * pad
  const x = c.getContext('2d')
  // A magnifying crop, so nearest-neighbour: this sheet exists to show what the
  // renderer actually drew on him, not a smoothed opinion of it.
  x.imageSmoothingEnabled = false
  x.fillStyle = '#141414'
  x.fillRect(0, 0, c.width, c.height)
  loaded.forEach((im, i) => {
    const cx = pad + (i % cols) * (CW + pad)
    const cy = pad + Math.floor(i / cols) * (CH + 16 + pad)
    // Zoom so the dog is about a third of the cell's height, whatever range he
    // happens to be at, and clamp the crop inside the frame.
    const zoom = Math.max(1, Math.min(9, CH / 3 / Math.max(4, boxes[i][2])))
    const sw = CW / zoom
    const sh = CH / zoom
    const sx = Math.max(0, Math.min(im.width - sw, boxes[i][0] * dsf - sw / 2))
    const sy = Math.max(0, Math.min(im.height - sh, boxes[i][1] * dsf - sh * 0.55))
    x.drawImage(im, sx, sy, sw, sh, cx, cy, CW, CH)
    x.fillStyle = '#cfcfcf'
    x.font = '12px monospace'
    x.fillText(labels[i], cx + 2, cy + CH + 12)
    x.fillStyle = '#141414'
  })
  return c.toDataURL('image/png')
}

const writePng = (path, dataUrl) =>
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))

/**
 * Build both sheets for one take and write them next to it.
 *
 * `page` is any page in the browser -- nothing is loaded into it, it is only
 * borrowed for its canvas. `probes` is the per-frame probe array; the dog sheet
 * reads `dogScreen` and `dog.activity` out of it.
 */
export async function writeSheets(page, { out, name, frameDir, frames, fps, probes, dsf }) {
  const picks = pickFrames(frames)
  const written = []

  const pages = async (suffix, cols, rows, render, extra) => {
    const groups = paginate(picks, cols * rows)
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      // One page per file, and one file per page only when there is more than
      // one: a single-page take keeps the plain `-sheet.png` name.
      const file =
        groups.length === 1 ? `${name}-${suffix}.png` : `${name}-${suffix}-${i + 1}.png`
      writePng(
        join(out, file),
        await page.evaluate(render, {
          imgs: dataUrls(frameDir, g),
          cols,
          rows: Math.ceil(g.length / cols),
          ...extra(g),
        }),
      )
      written.push(file)
    }
  }

  await pages('sheet', WIDE_COLS, WIDE_ROWS, renderWide, (g) => ({
    labels: g.map((f) => `t=${(f / fps).toFixed(2)}s  f${f}`),
  }))

  await pages('dog', DOG_COLS, DOG_ROWS, renderDog, (g) => ({
    dsf,
    boxes: g.map((f) => probes[f]?.dogScreen ?? [0, 0, 20]),
    labels: g.map((f) => `${(f / fps).toFixed(2)}s ${probes[f]?.dog?.activity ?? '-'}`),
  }))

  return written
}
