import { describe, expect, it } from 'vitest'
import { squarify } from './treemap'

describe('squarify', () => {
  it('tiles the box exactly, with areas proportional to values', () => {
    const values = [6, 6, 4, 3, 2, 2, 1]
    const rects = squarify(values, 600, 400)
    expect(rects).toHaveLength(values.length)
    const total = values.reduce((a, b) => a + b, 0)
    rects.forEach((r, i) => {
      expect(r.w * r.h).toBeCloseTo((values[i] / total) * 600 * 400, 6)
      expect(r.x).toBeGreaterThanOrEqual(-1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-9)
    })
    expect(rects.reduce((a, r) => a + r.w * r.h, 0)).toBeCloseTo(600 * 400, 6)
  })

  it('keeps tiles reasonably square', () => {
    const rects = squarify([5, 4, 3, 2, 1], 300, 200)
    for (const r of rects) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(4)
  })

  it('handles empty and zero input', () => {
    expect(squarify([], 100, 100)).toEqual([])
    expect(squarify([0, 0], 100, 100)).toEqual([{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }])
  })
})
