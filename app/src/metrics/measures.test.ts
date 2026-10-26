import { describe, expect, it } from 'vitest'
import type { Interaction } from '../data/types'
import { bars, cumulative, div, freshness, I, monthly, monthRange, telemetryUplift } from './measures'

const ix = (time: string, threadId: string, extra: Partial<Interaction> = {}): Interaction => ({
  date: time.slice(0, 10), time, surfaceKey: '', agentKey: '', user: 'u', appHost: 'Office', threadId, resourceCount: 0, ...extra,
})

describe('interaction measures', () => {
  it('sums run time per thread and day', () => {
    const rows = [
      ix('2026-06-01T10:00:00', 'a'),
      ix('2026-06-01T10:30:00', 'a'),
      ix('2026-06-01T10:15:00', 'a'),
      // Same thread on the next day is a separate span, so the overnight gap is not counted.
      ix('2026-06-02T09:00:00', 'a'),
      ix('2026-06-02T09:06:00', 'a'),
      ix('2026-06-01T12:00:00', 'b'),
    ]
    expect(I.runTimeHours(rows)).toBeCloseTo(0.6)
    expect(I.sessions(rows)).toBe(2)
    expect(I.avgSessionMinutes(rows)).toBeCloseTo(18)
  })

  it('counts users, agent users, grounding and autonomous runs', () => {
    const rows = [
      ix('2026-06-01T10:00:00', 'a', { user: 'x', agentKey: 'k1', resourceCount: 2 }),
      ix('2026-06-01T10:00:00', 'b', { user: 'y', appHost: 'Autonomous' }),
      ix('2026-06-01T10:00:00', 'c', { user: '' }),
    ]
    expect(I.users(rows)).toBe(2)
    expect(I.activeUsers(rows)).toBe(1)
    expect(I.agentsWithInteractions(rows)).toBe(1)
    expect(I.grounded(rows)).toBe(1)
    expect(I.autonomous(rows)).toBe(1)
  })

  it('counts agents the audit log saw that usage records missed', () => {
    const agents = [{ key: 'k1', lastUsed: '' }, { key: 'k2', lastUsed: '2026-01-01T00:00:00' }, { key: 'k3', lastUsed: '' }] as Parameters<typeof telemetryUplift>[0]
    const rows = [ix('2026-06-01T10:00:00', 'a', { agentKey: 'k1' }), ix('2026-06-01T10:00:00', 'a', { agentKey: 'k2' })]
    expect(telemetryUplift(agents, rows)).toBe(1)
  })
})

describe('helpers', () => {
  it('sorts bars by value and labels blanks', () => {
    expect(bars(['a', 'b', 'b', ''], (r) => r)).toEqual([
      { key: 'b', label: 'b', value: 2 },
      { key: '(Blank)', label: '(Blank)', value: 1 },
      { key: 'a', label: 'a', value: 1 },
    ])
  })

  it('fills month gaps and accumulates', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    const m = monthly(['2026-01-05', '2026-03-01', '2026-03-09', ''], (d) => d.slice(0, 7))
    expect(m).toEqual([
      { key: '2026-01', values: [1] },
      { key: '2026-02', values: [0] },
      { key: '2026-03', values: [2] },
    ])
    expect(cumulative(m).map((p) => p.values[0])).toEqual([1, 1, 3])
  })

  it('returns NaN on divide by zero, as DIVIDE returns blank', () => {
    expect(Number.isNaN(div(1, 0))).toBe(true)
  })

  it('describes knowledge freshness', () => {
    expect(freshness([], '2026-06-10T00:00:00')).toBe('Never collected')
    expect(freshness(['2026-06-10T00:00:00'], '2026-06-10T08:00:00')).toBe('2026-06-10 (today)')
    expect(freshness(['2026-06-01T00:00:00', '2026-06-08T00:00:00'], '2026-06-10T00:00:00')).toBe('2026-06-08 (2d ago)')
    expect(freshness(['2026-06-01T00:00:00'], '2026-06-10T00:00:00')).toBe('2026-06-01 (9d ago - STALE)')
  })
})
