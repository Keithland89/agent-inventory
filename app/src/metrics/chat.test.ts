import { describe, expect, it } from 'vitest'
import type { Interaction } from '../data/types'
import { appGroup, groupSummary, habitMix, habitOf, hourGrid, userActivity, weekOf, weeklyCount, weeklyUsers } from './chat'

const row = (date: string, user: string, appHost: string, threadId = `${user}-${date}`): Interaction => ({
  date, time: `${date}T10:00:00`, surfaceKey: '', agentKey: '', user, appHost, threadId, resourceCount: 0,
})

describe('appGroup', () => {
  it('groups hosts ignoring case and whitespace', () => {
    expect(appGroup('m365copilot')).toBe('Copilot Chat')
    expect(appGroup('M365COPILOT')).toBe('Copilot Chat')
    expect(appGroup(' Office ')).toBe('Copilot Chat')
    expect(appGroup('Word')).toBe('In-app Copilot')
    expect(appGroup('SharePoint')).toBe('In-app Copilot')
    expect(appGroup('cowork')).toBe('Cowork')
    expect(appGroup('Cowork')).toBe('Cowork')
    expect(appGroup('Autonomous')).toBe('Agents')
    expect(appGroup('Copilot Studio')).toBe('Agents')
    expect(appGroup('')).toBe('Other')
    expect(appGroup('SomethingNew')).toBe('Other')
  })
})

describe('weeks and habits', () => {
  it('starts weeks on Monday', () => {
    expect(weekOf('2026-06-01')).toBe('2026-06-01')
    expect(weekOf('2026-06-07')).toBe('2026-06-01')
    expect(weekOf('2026-06-08T23:59:00')).toBe('2026-06-08')
    expect(weekOf('nope')).toBe('')
  })

  it('assigns habit cohorts from days per active week', () => {
    expect(habitOf(8, 2)).toBe('Daily habit')
    expect(habitOf(4, 2)).toBe('Regular')
    expect(habitOf(3, 2)).toBe('Occasional')
    expect(habitOf(1, 1)).toBe('One-off')
    expect(habitOf(0, 0)).toBe('One-off')
  })
})

describe('user activity and group summary', () => {
  const rows = [
    ...['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'].map((d) => row(d, 'ada', 'm365copilot')),
    row('2026-06-04', 'ada', 'cowork', 'cw1'),
    row('2026-06-04', 'ada', 'cowork', 'cw1'),
    row('2026-06-01', 'bob', 'Word'),
    row('2026-06-17', 'bob', 'Word'),
    row('2026-06-02', 'cy', 'Cowork'),
    row('2026-06-02', '', 'Autonomous'),
  ]

  it('derives sessions, active days and cohorts per user', () => {
    const users = new Map(userActivity(rows).map((u) => [u.user, u]))
    expect(users.size).toBe(3)
    expect(users.get('ada')).toMatchObject({ turns: 6, sessions: 5, activeDays: 4, activeWeeks: 1, habit: 'Daily habit', groups: ['Copilot Chat', 'Cowork'] })
    expect(users.get('bob')).toMatchObject({ activeDays: 2, activeWeeks: 2, habit: 'Occasional', lastActive: '2026-06-17T10:00:00' })
    expect(users.get('cy')?.habit).toBe('One-off')
    expect(habitMix([...users.values()])).toEqual({ 'Daily habit': 1, Regular: 0, Occasional: 1, 'One-off': 1 })
  })

  it('summarises every group, including empty ones', () => {
    const s = new Map(groupSummary(rows).map((g) => [g.group, g]))
    expect(s.get('Copilot Chat')).toMatchObject({ users: 1, sessions: 4, turns: 4, activeDays: 4, turnsPerUser: 4 })
    expect(s.get('Cowork')).toMatchObject({ users: 2, sessions: 2, turns: 3, activeDays: 2, turnsPerUser: 1.5 })
    expect(s.get('Agents')).toMatchObject({ users: 0, turns: 1, activeDays: 0 })
    expect(Number.isNaN(s.get('Other')?.turnsPerUser)).toBe(true)
  })

  it('emits every week between the first and last, gaps included', () => {
    expect(weeklyCount(rows)).toEqual([
      { key: '2026-06-01', values: [9] },
      { key: '2026-06-08', values: [0] },
      { key: '2026-06-15', values: [1] },
    ])
    const w = weeklyUsers(rows, ['Copilot Chat', 'Cowork', 'In-app Copilot'])
    expect(w[0].values).toEqual([1, 2, 1])
    expect(w[1].values).toEqual([0, 0, 0])
    expect(weeklyCount([])).toEqual([])
  })
})

describe('hourGrid', () => {
  it('buckets by UTC weekday (Monday first) and hour, skipping bad timestamps', () => {
    const at = (time: string): Interaction => ({ ...row(time.slice(0, 10), 'a', 'Word'), time })
    const g = hourGrid([at('2026-06-01T09:15:00'), at('2026-06-01T09:59:59'), at('2026-06-07T23:00:00'), at('2026-06-04T00:00:00'), at(''), at('2026-06-02')])
    expect(g).toHaveLength(7)
    expect(g.every((d) => d.length === 24)).toBe(true)
    expect(g[0][9]).toBe(2)
    expect(g[6][23]).toBe(1)
    expect(g[3][0]).toBe(1)
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(4)
  })
})