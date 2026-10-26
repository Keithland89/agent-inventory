import { describe, expect, it } from 'vitest'
import type { Agent, Interaction } from '../data/types'
import { stageAt, stageMix, stageMoves, stagesByMonth, userDays } from './habits'
import { agentTrends, lifecycleOf, overallReturnRate, reviewAgents, verdictOf } from './lifecycle'
import { change, dayNum, lastDataDay, periodChange, splitPeriods } from './periods'

const ix = (date: string, user: string, o: Partial<Interaction> = {}): Interaction =>
  ({ date, time: `${date}T10:00:00`, surfaceKey: 's', agentKey: 'A', user, appHost: 'Copilot Studio', threadId: `${user}-${date}`, resourceCount: 0, ...o }) as Interaction

/** yyyy-mm-dd `n` days before 2026-09-01. */
const ago = (n: number) => new Date(Date.UTC(2026, 8, 1) - n * 86_400_000).toISOString().slice(0, 10)
const END = dayNum('2026-09-01')

describe('periods', () => {
  const rows = [ix(ago(0), 'a'), ix(ago(6), 'b'), ix(ago(7), 'c'), ix(ago(13), 'd'), ix(ago(14), 'e')]

  it('finds the last day with data', () => {
    expect(lastDataDay(rows)).toBe('2026-09-01')
    expect(lastDataDay([])).toBe('')
  })

  it('splits into this week and the week before', () => {
    const [cur, prev] = splitPeriods(rows, (r) => r.date, ago(0))
    expect(cur.map((r) => r.user)).toEqual(['a', 'b'])
    expect(prev.map((r) => r.user)).toEqual(['c', 'd'])
  })

  it('works out the change, with NaN for a zero base', () => {
    expect(change(12, 10)).toEqual({ current: 12, previous: 10, delta: 2, ratio: expect.closeTo(0.2) })
    expect(change(3, 0).ratio).toBeNaN()
    expect(periodChange(rows, (r) => r.date, ago(0), (rs) => rs.length)).toMatchObject({ current: 2, previous: 2, delta: 0 })
  })
})

describe('habit stages', () => {
  const weekly = (weeks: number[]) => weeks.map((w) => END - w * 7).sort((a, b) => a - b)

  it('grades users by the weeks they were active in the last 8', () => {
    expect(stageAt(weekly([0, 1, 2, 3, 4, 5, 9]), END)).toBe('Habitual')
    expect(stageAt(weekly([0, 2, 4, 9]), END)).toBe('Regular')
    expect(stageAt(weekly([1, 9]), END)).toBe('Trying')
  })

  it('calls first-time users New and quiet users Lapsed', () => {
    expect(stageAt([END - 13, END - 2], END)).toBe('New')
    expect(stageAt([END - 40, END - 28], END)).toBe('Lapsed')
    expect(stageAt([END - 90], END)).toBeNull()
    expect(stageAt([END + 1], END)).toBeNull()
  })

  it('counts users per stage and per month once 8 weeks of history exist', () => {
    const rows: Interaction[] = []
    for (let d = 0; d < 100; d++) rows.push(ix(ago(d), 'daily'))
    rows.push(ix(ago(3), 'newbie'), ix(ago(60), 'gone'))
    const days = userDays(rows)
    expect(stageMix(days, END)).toEqual({ Habitual: 1, Regular: 0, Trying: 0, New: 1, Lapsed: 1 })
    const months = stagesByMonth(rows)
    expect(months.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(months.at(-1)).toMatchObject({ anchor: '2026-09-01', values: [1, 0, 0, 1, 1] })
  })

  it('tracks who moved up or down between two days', () => {
    const days = userDays([ix(ago(0), 'back'), ix(ago(70), 'back'), ix(ago(35), 'quiet')])
    expect(stageMoves(days, END - 30, END)).toEqual({ up: 1, down: 1, same: 0 })
  })
})

const agent = (o: Partial<Agent>): Agent =>
  ({ key: 'A', name: 'Agent', ageDays: 200, lastActivityAt: '2026-08-30', daysSinceLastActivity: 2, riskBand: 'Low', riskScore: 1, hasOwner: true, sharedTenantWide: false, ...o }) as Agent

describe('agent lifecycle', () => {
  const rows = [
    ...['a', 'b', 'c', 'd'].map((u) => ix(ago(3), u)),
    ix(ago(10), 'a'),
    ix(ago(40), 'e'),
    ix(ago(3), 'z', { agentKey: 'B' }),
    ix(ago(60), 'old'),
  ]
  const trends = agentTrends(rows, ago(0))

  it('counts users this 4 weeks and last, and how many came back in another week', () => {
    expect(trends.get('A')).toMatchObject({ users: 4, prevUsers: 1, sessions: 5, returning: 1, usersIn8Weeks: 5, returnRate: 0.2 })
    expect(overallReturnRate(trends.values())).toBeCloseTo(1 / 6)
  })

  it('stages agents by age, activity and the change in users', () => {
    expect(lifecycleOf(agent({ ageDays: 5 }), undefined)).toBe('New')
    expect(lifecycleOf(agent({ lastActivityAt: '' }), undefined)).toBe('Never used')
    expect(lifecycleOf(agent({ daysSinceLastActivity: 120 }), undefined)).toBe('Dormant')
    expect(lifecycleOf(agent({}), trends.get('A'))).toBe('Growing')
    expect(lifecycleOf(agent({}), { users: 1, prevUsers: 5 } as never)).toBe('Declining')
    expect(lifecycleOf(agent({}), { users: 4, prevUsers: 4 } as never)).toBe('Steady')
  })

  it('gives each agent a verdict with a reason, retiring before reviewing', () => {
    expect(verdictOf(agent({ daysSinceLastActivity: 120, riskBand: 'High' }), 'Dormant')).toEqual({ verdict: 'Retire', reason: 'No activity for 120 days' })
    expect(verdictOf(agent({ lastActivityAt: '', ageDays: 90 }), 'Never used').verdict).toBe('Retire')
    expect(verdictOf(agent({ riskBand: 'High', riskScore: 7 }), 'Growing')).toEqual({ verdict: 'Review', reason: 'High risk (score 7)' })
    expect(verdictOf(agent({ hasOwner: false }), 'Steady').reason).toBe('No owner')
    expect(verdictOf(agent({}), 'New').verdict).toBe('Watch')
    expect(verdictOf(agent({}), 'Declining').verdict).toBe('Watch')
    expect(verdictOf(agent({}), 'Growing').verdict).toBe('Promote')
    expect(verdictOf(agent({ sharedTenantWide: true }), 'Growing').verdict).toBe('Keep')
    expect(verdictOf(agent({}), 'Steady').verdict).toBe('Keep')
  })

  it('reviews a list of agents', () => {
    const [r] = reviewAgents([agent({})], trends)
    expect(r).toMatchObject({ stage: 'Growing', verdict: 'Promote' })
  })
})
