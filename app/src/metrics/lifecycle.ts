import type { Agent, Interaction } from '../data/types'
import { dayNum } from './periods'

export const LIFECYCLE = ['New', 'Growing', 'Steady', 'Declining', 'Dormant', 'Never used'] as const
export type Lifecycle = (typeof LIFECYCLE)[number]

export const LIFECYCLE_HELP: Record<Lifecycle, string> = {
  New: 'Created in the last 30 days.',
  Growing: 'At least 2 more users, and 25% more, in the last 4 weeks than in the 4 weeks before.',
  Steady: 'Used in the last 90 days without a clear rise or fall in users.',
  Declining: 'At least 2 fewer users, and 25% fewer, in the last 4 weeks than in the 4 weeks before.',
  Dormant: 'No activity for 90 days or more.',
  'Never used': 'No usage signal at all, 30 or more days after it was created.',
}

export const VERDICTS = ['Promote', 'Keep', 'Watch', 'Review', 'Retire'] as const
export type Verdict = (typeof VERDICTS)[number]

export const VERDICT_HELP: Record<Verdict, string> = {
  Promote: 'Growing, low risk and not yet shared tenant-wide: a candidate to share more widely.',
  Keep: 'In use with no flags.',
  Watch: 'Too new to judge, or use is falling.',
  Review: 'High risk, or no owner. Check it before anything else.',
  Retire: 'Dormant for 90 days, or never used 60 days after it was created.',
}

export interface AgentTrend {
  /** Distinct users in the last 28 days. */
  users: number
  /** Distinct users in the 28 days before that. */
  prevUsers: number
  sessions: number
  /** Of the users in the last 8 weeks, the share active in 2 or more different weeks. */
  returnRate: number
  returning: number
  usersIn8Weeks: number
}

/** Per-agent audit trends over the 8 weeks to `end`, in one pass over the interactions. */
export function agentTrends(rows: readonly Interaction[], end: string): Map<string, AgentTrend> {
  const e = dayNum(end)
  const acc = new Map<string, { cur: Set<string>; prev: Set<string>; sessions: Set<string>; weeks: Map<string, Set<number>> }>()
  if (Number.isNaN(e)) return new Map()
  for (const r of rows) {
    if (!r.agentKey) continue
    const ago = e - dayNum(r.date)
    if (!(ago >= 0 && ago < 56)) continue
    let a = acc.get(r.agentKey)
    if (!a) acc.set(r.agentKey, (a = { cur: new Set(), prev: new Set(), sessions: new Set(), weeks: new Map() }))
    if (ago < 28) {
      if (r.user) a.cur.add(r.user)
      if (r.threadId) a.sessions.add(r.threadId)
    } else if (r.user) a.prev.add(r.user)
    if (r.user) {
      const w = a.weeks.get(r.user)
      if (w) w.add(Math.floor(ago / 7))
      else a.weeks.set(r.user, new Set([Math.floor(ago / 7)]))
    }
  }
  const out = new Map<string, AgentTrend>()
  for (const [k, a] of acc) {
    let returning = 0
    for (const w of a.weeks.values()) if (w.size >= 2) returning++
    out.set(k, {
      users: a.cur.size,
      prevUsers: a.prev.size,
      sessions: a.sessions.size,
      returning,
      usersIn8Weeks: a.weeks.size,
      returnRate: a.weeks.size ? returning / a.weeks.size : NaN,
    })
  }
  return out
}

export function lifecycleOf(a: Agent, t: AgentTrend | undefined): Lifecycle {
  if (a.ageDays !== null && a.ageDays < 30) return 'New'
  if (!a.lastActivityAt) return 'Never used'
  if ((a.daysSinceLastActivity ?? Infinity) >= 90) return 'Dormant'
  const cur = t?.users ?? 0
  const prev = t?.prevUsers ?? 0
  if (cur - prev >= 2 && cur >= prev * 1.25) return 'Growing'
  if (prev - cur >= 2 && cur <= prev * 0.75) return 'Declining'
  return 'Steady'
}

export function verdictOf(a: Agent, stage: Lifecycle): { verdict: Verdict; reason: string } {
  if (stage === 'Dormant') return { verdict: 'Retire', reason: `No activity for ${a.daysSinceLastActivity} days` }
  if (stage === 'Never used' && (a.ageDays ?? 0) >= 60) return { verdict: 'Retire', reason: `Never used, created ${a.ageDays} days ago` }
  if (a.riskBand === 'High') return { verdict: 'Review', reason: `High risk (score ${a.riskScore})` }
  if (!a.hasOwner) return { verdict: 'Review', reason: 'No owner' }
  if (stage === 'New') return { verdict: 'Watch', reason: 'Created in the last 30 days' }
  if (stage === 'Never used') return { verdict: 'Watch', reason: 'Not used yet' }
  if (stage === 'Declining') return { verdict: 'Watch', reason: 'Fewer users than the 4 weeks before' }
  if (stage === 'Growing' && a.riskBand === 'Low' && !a.sharedTenantWide) return { verdict: 'Promote', reason: 'Growing, low risk, not shared tenant-wide' }
  return { verdict: 'Keep', reason: stage === 'Growing' ? 'Growing' : 'In steady use' }
}

export interface AgentReview {
  agent: Agent
  stage: Lifecycle
  verdict: Verdict
  reason: string
  trend: AgentTrend | undefined
}

export function reviewAgents(agents: readonly Agent[], trends: Map<string, AgentTrend>): AgentReview[] {
  return agents.map((agent) => {
    const trend = trends.get(agent.key)
    const stage = lifecycleOf(agent, trend)
    return { agent, stage, trend, ...verdictOf(agent, stage) }
  })
}

/** Across agents: users active in 2 or more weeks, out of all agent users, in the last 8 weeks. */
export function overallReturnRate(trends: Iterable<AgentTrend>): number {
  let r = 0
  let n = 0
  for (const t of trends) {
    r += t.returning
    n += t.usersIn8Weeks
  }
  return n ? r / n : NaN
}
