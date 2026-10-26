export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Worst aspect ratio of a row of areas laid along a side of length `side`. */
function worst(row: number[], side: number) {
  const sum = row.reduce((a, b) => a + b, 0)
  if (!sum || !side) return Infinity
  const max = Math.max(...row)
  const min = Math.min(...row)
  const s2 = side * side
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min))
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk). Values must be sorted largest first;
 * returns one rectangle per value, in the same order, tiling a `width` × `height` box.
 */
export function squarify(values: number[], width: number, height: number): Rect[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0)
  if (!total || width <= 0 || height <= 0) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  const scale = (width * height) / total
  const areas = values.map((v) => Math.max(0, v) * scale)
  const out: Rect[] = []
  let box = { x: 0, y: 0, w: width, h: height }
  let i = 0
  while (i < areas.length) {
    const side = Math.min(box.w, box.h)
    const row = [areas[i]]
    let j = i + 1
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++])
    const sum = row.reduce((a, b) => a + b, 0)
    if (box.w >= box.h) {
      // Lay the row as a column down the left edge.
      const cw = box.h ? sum / box.h : 0
      let y = box.y
      for (const a of row) {
        const h = cw ? a / cw : 0
        out.push({ x: box.x, y, w: cw, h })
        y += h
      }
      box = { x: box.x + cw, y: box.y, w: box.w - cw, h: box.h }
    } else {
      // Lay the row along the top edge.
      const rh = box.w ? sum / box.w : 0
      let x = box.x
      for (const a of row) {
        const w = rh ? a / rh : 0
        out.push({ x, y: box.y, w, h: rh })
        x += w
      }
      box = { x: box.x, y: box.y + rh, w: box.w, h: box.h - rh }
    }
    i = j
  }
  return out
}
