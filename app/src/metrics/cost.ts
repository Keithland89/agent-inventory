import { CREDIT_ENTITLEMENT, currencyLabel } from '../data/cost'
import type { Agent, AgentCredit, AiCostDaily, AiCostMeter, AzureAIResource, CreditPool, Environment, Interaction } from '../data/types'
import { groupBy, sum, type Bar } from './measures'

/* ---------- Copilot Credits ---------- */

export interface AgentCreditRow {
  key: string
  /** Inventory key, or "" when the agent is not in the inventory (deleted, or in an environment the listing missed). */
  agentKey: string
  name: string
  envName: string
  billed: number
  nonBilled: number
  total: number
  topFeature: string
}

const creditTotal = (c: AgentCredit) => c.billed + c.nonBilled

export function creditTotals(credits: AgentCredit[]) {
  const billed = sum(credits, (c) => c.billed)
  const nonBilled = sum(credits, (c) => c.nonBilled)
  const agents = new Set(credits.filter((c) => creditTotal(c) > 0).map((c) => `${c.envId}|${c.resourceId}`.toLowerCase())).size
  const orphaned = credits.filter((c) => !c.agentKey)
  return {
    billed,
    nonBilled,
    total: billed + nonBilled,
    agents,
    orphanedCredits: sum(orphaned, creditTotal),
    orphanedAgents: new Set(orphaned.map((c) => `${c.envId}|${c.resourceId}`.toLowerCase())).size,
  }
}

export function creditsByAgent(credits: AgentCredit[], agentByKey: Map<string, Agent>, environments: Environment[]): AgentCreditRow[] {
  const envName = new Map(environments.map((e) => [e.id.toLowerCase(), e.name]))
  return [...groupBy(credits, (c) => c.agentKey || `${c.envId}|${c.resourceId}`.toLowerCase())]
    .map(([key, rs]) => {
      const agent = rs[0].agentKey ? agentByKey.get(rs[0].agentKey) : undefined
      const features = [...groupBy(rs, (r) => r.feature)].map(([f, fr]) => ({ f, v: sum(fr, creditTotal) })).sort((a, b) => b.v - a.v)
      const billed = sum(rs, (r) => r.billed)
      const nonBilled = sum(rs, (r) => r.nonBilled)
      return {
        key,
        agentKey: agent ? agent.key : '',
        name: agent?.name || `Not in inventory (${rs[0].resourceId.slice(0, 8)})`,
        envName: agent?.envName || envName.get(rs[0].envId.toLowerCase()) || rs[0].envId,
        billed,
        nonBilled,
        total: billed + nonBilled,
        topFeature: features[0]?.f ?? '',
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

export interface CostUseRow extends AgentCreditRow {
  users: number
  sessions: number
  autonomous: number
  perUser: number
  perSession: number
  /** In the top quarter for credits, with audited use from 2 or fewer users, mostly not autonomous. */
  highCostLowUse: boolean
}

/**
 * Credits set against audited use in the same window. Autonomous agents run without users,
 * so they are never flagged as high cost and low use.
 */
export function costAgainstUse(rows: AgentCreditRow[], interactions: Interaction[], window: { from: string; to: string }) {
  const use = new Map<string, { users: Set<string>; sessions: Set<string>; autonomous: number; n: number }>()
  const allUsers = new Set<string>()
  const allSessions = new Set<string>()
  for (const i of interactions) {
    if (!i.agentKey || i.date < window.from || i.date > window.to) continue
    let u = use.get(i.agentKey)
    if (!u) use.set(i.agentKey, (u = { users: new Set(), sessions: new Set(), autonomous: 0, n: 0 }))
    u.n++
    if (i.appHost === 'Autonomous') u.autonomous++
    if (i.user) u.users.add(i.user)
    if (i.threadId) u.sessions.add(i.threadId)
  }
  const inInventory = rows.filter((r) => r.agentKey)
  const totals = inInventory.map((r) => r.total).sort((a, b) => a - b)
  const p75 = totals.length >= 4 ? totals[Math.floor(totals.length * 0.75)] : Infinity
  let credits = 0
  const out: CostUseRow[] = inInventory.map((r) => {
    const u = use.get(r.agentKey)
    const users = u?.users.size ?? 0
    const sessions = u?.sessions.size ?? 0
    const autonomous = u?.autonomous ?? 0
    if (u) {
      credits += r.total
      for (const x of u.users) allUsers.add(x)
      for (const x of u.sessions) allSessions.add(x)
    }
    return {
      ...r,
      users,
      sessions,
      autonomous,
      perUser: users ? r.total / users : NaN,
      perSession: sessions ? r.total / sessions : NaN,
      highCostLowUse: !!u && r.total >= p75 && users <= 2 && autonomous <= u.n / 2,
    }
  })
  return {
    rows: out,
    perUser: allUsers.size ? credits / allUsers.size : NaN,
    perSession: allSessions.size ? credits / allSessions.size : NaN,
    flagged: out.filter((r) => r.highCostLowUse).length,
  }
}

export const creditBars = (credits: AgentCredit[], key: (c: AgentCredit) => string): Bar[] =>
  [...groupBy(credits, key)].map(([k, rs]) => ({ key: k, label: k || '(Blank)', value: sum(rs, creditTotal) })).filter((b) => b.value > 0)

export function poolRows(pool: CreditPool[]) {
  return pool
    .map((p) => ({ ...p, name: currencyLabel(p.currency), used: p.purchased ? p.consumed / p.purchased : NaN, remaining: p.purchased - p.consumed }))
    .sort((a, b) => (a.currency === CREDIT_ENTITLEMENT ? -1 : b.currency === CREDIT_ENTITLEMENT ? 1 : a.name.localeCompare(b.name)))
}

/* ---------- Azure AI spend ---------- */

/** The currency most of the spend is in; Cost Management reports in the billing currency, so mixes are rare. */
export function mainCurrency(rows: { currency: string; cost: number }[]): { currency: string; mixed: boolean } {
  const by = [...groupBy(rows, (r) => r.currency)].map(([c, rs]) => ({ c, v: sum(rs, (r) => r.cost) })).sort((a, b) => b.v - a.v)
  return { currency: by[0]?.c ?? '', mixed: by.length > 1 }
}

export interface ResourceSpendRow {
  id: string
  name: string
  category: string
  resourceGroup: string
  region: string
  cost: number
  topMeter: string
  /** False when the resource is not in the Foundry listing (deleted, or another resource type in the same scope). */
  listed: boolean
}

const lastSegment = (id: string) => id.split('/').filter(Boolean).pop() ?? id
const rgOf = (id: string) => /\/resourcegroups\/([^/]+)/i.exec(id)?.[1] ?? ''

export function spendByResource(daily: AiCostDaily[], meters: AiCostMeter[], resources: AzureAIResource[], currency: string): ResourceSpendRow[] {
  const byId = new Map(resources.map((r) => [r.id.toLowerCase(), r]))
  const topMeter = new Map(
    [...groupBy(meters.filter((m) => m.currency === currency), (m) => m.resourceId)].map(([id, ms]) => [id, [...ms].sort((a, b) => b.cost - a.cost)[0]?.meter ?? '']),
  )
  return [...groupBy(daily.filter((d) => d.currency === currency), (d) => d.resourceId)]
    .map(([id, rs]) => {
      const r = byId.get(id)
      return {
        id,
        name: r?.name || lastSegment(id),
        category: r?.category || 'Not in listing',
        resourceGroup: r?.resourceGroup || rgOf(id),
        region: r?.region || '',
        cost: sum(rs, (x) => x.cost),
        topMeter: topMeter.get(id) ?? '',
        listed: !!r,
      }
    })
    .filter((r) => r.cost > 0)
    .sort((a, b) => b.cost - a.cost)
}

/** Daily spend over the window, with days that had no spend filled as zero. */
export function dailySpend(daily: AiCostDaily[], currency: string, window: { from: string; to: string }) {
  const by = new Map([...groupBy(daily.filter((d) => d.currency === currency), (d) => d.date)].map(([d, rs]) => [d, sum(rs, (r) => r.cost)]))
  const out: { key: string; values: number[] }[] = []
  if (!window.from || !window.to || window.from > window.to) return out
  for (let d = new Date(`${window.from}T00:00:00Z`); d.toISOString().slice(0, 10) <= window.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10)
    out.push({ key: k, values: [by.get(k) ?? 0] })
  }
  return out
}

/** The window the data actually covers: earliest to latest day with spend. */
export function spendWindow(daily: AiCostDaily[]): { from: string; to: string } {
  const days = daily.map((d) => d.date).filter(Boolean).sort()
  return { from: days[0] ?? '', to: days[days.length - 1] ?? '' }
}

export const meterBars = (meters: AiCostMeter[], currency: string): Bar[] =>
  [...groupBy(meters.filter((m) => m.currency === currency), (m) => m.meter)].map(([k, rs]) => ({ key: k, label: k || '(Blank)', value: sum(rs, (r) => r.cost) })).filter((b) => b.value > 0)

export const categoryBars = (rows: ResourceSpendRow[]): Bar[] =>
  [...groupBy(rows, (r) => r.category)].map(([k, rs]) => ({ key: k, label: k, value: sum(rs, (r) => r.cost) })).sort((a, b) => b.value - a.value)
