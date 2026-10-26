import { describe, expect, it } from 'vitest'
import { weeklySeries } from './periods'

describe('weeklySeries', () => {
  const rows = ['2026-09-02', '2026-09-01', '2026-08-27', '2026-08-26', '2026-08-01', 'bad'].map((date) => ({ date }))

  it('buckets rows into 7-day windows ending on the last day, oldest first', () => {
    expect(weeklySeries(rows, (r) => r.date, '2026-09-02', (rs) => rs.length, 3)).toEqual([0, 1, 3])
  })

  it('ignores rows outside the window and invalid dates', () => {
    expect(weeklySeries(rows, (r) => r.date, '2026-09-02', (rs) => rs.length, 1)).toEqual([3])
  })

  it('returns nothing when there is no end date', () => {
    expect(weeklySeries(rows, (r) => r.date, '', (rs) => rs.length)).toEqual([])
  })
})
