// Pure mappers for the cost lanes: Copilot Credits from the Power Platform admin API and
// Azure AI spend from the Cost Management query API. Kept apart from live.ts so they can be tested.
import { str, toTime } from './transforms'
import type { AgentCredit, AiCostDaily, AiCostMeter, CreditPool } from './types'

/** Days of history the cost lanes read. */
export const COST_WINDOW_DAYS = 30

/**
 * The licensing entitlement that carries Copilot Studio usage. The connector documents the
 * per-resource endpoint as deprecated, so this lane may need to move when a replacement ships.
 */
export const CREDIT_ENTITLEMENT = 'MCSMessages'

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(str(v))
  return Number.isFinite(n) ? n : 0
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function costWindow(now: Date, days = COST_WINDOW_DAYS): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - (days - 1))
  return { from: isoDay(from), to: isoDay(to) }
}

/* ---------- Copilot Credits ---------- */

const meta = (m: Record<string, unknown> | undefined, ...keys: string[]) => {
  if (!m) return undefined
  const lower = new Map(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v]))
  for (const k of keys) if (lower.has(k.toLowerCase())) return lower.get(k.toLowerCase())
  return undefined
}

export interface CreditSnapshot {
  resourceId?: string
  consumed?: number
  lastRefreshedDate?: string
  metadata?: Record<string, unknown>
  environmentId?: string
}

export function mapCredit(r: CreditSnapshot): AgentCredit {
  const envId = str(r.environmentId)
  const resourceId = str(r.resourceId)
  return {
    agentKey: envId && resourceId ? `${envId}|${resourceId}` : '',
    envId,
    resourceId,
    feature: str(meta(r.metadata, 'Feature', 'FeatureName')) || 'Unspecified',
    product: str(meta(r.metadata, 'ProductName', 'Product')) || 'Copilot Studio',
    billed: num(r.consumed),
    nonBilled: num(meta(r.metadata, 'nonBillableConsumed', 'NonBillableConsumed')),
    lastRefreshed: toTime(r.lastRefreshedDate),
  }
}

export interface CurrencyReport {
  currencyType?: string
  purchased?: number
  allocated?: number
  consumed?: { unitsConsumed?: number; lastUpdatedDay?: string }
}

/** Friendly names for the capacity currencies the licensing API reports. */
export const CURRENCY_LABEL: Record<string, string> = {
  MCSMessages: 'Copilot Credits',
  MCSMessagesStandard: 'Copilot Credits (standard)',
  MCSMessagesGenAI: 'Copilot Credits (generative)',
  MCSMessagesUnbillable: 'Copilot Credits (non-billable)',
  TenantM365Copilot: 'Microsoft 365 Copilot',
  AI: 'AI Builder credits',
  PerFlowPlan: 'Power Automate per-flow',
}

export const currencyLabel = (c: string) => CURRENCY_LABEL[c] ?? c

export function mapCreditPool(r: CurrencyReport): CreditPool {
  return {
    currency: str(r.currencyType) || 'Unknown',
    purchased: num(r.purchased),
    allocated: num(r.allocated),
    consumed: num(r.consumed?.unitsConsumed),
    lastUpdated: toTime(r.consumed?.lastUpdatedDay),
  }
}

/* ---------- Azure Cost Management ---------- */

/** Resource types whose spend counts as Azure AI: Foundry, Azure OpenAI and AI services accounts, and ML / hub workspaces. */
export const AI_RESOURCE_TYPES = ['microsoft.cognitiveservices/accounts', 'microsoft.machinelearningservices/workspaces']

export function costQueryBody(window: { from: string; to: string }, daily: boolean): Record<string, unknown> {
  return {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: { from: `${window.from}T00:00:00Z`, to: `${window.to}T23:59:59Z` },
    dataset: {
      granularity: daily ? 'Daily' : 'None',
      aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
      grouping: daily
        ? [{ type: 'Dimension', name: 'ResourceId' }]
        : [{ type: 'Dimension', name: 'ResourceId' }, { type: 'Dimension', name: 'Meter' }],
      filter: { dimensions: { name: 'ResourceType', operator: 'In', values: AI_RESOURCE_TYPES } },
    },
  }
}

export interface CostQueryResult {
  properties?: { columns?: { name?: string; type?: string }[]; rows?: unknown[][]; nextLink?: string | null }
}

const COST_COLUMNS = ['cost', 'pretaxcost', 'totalcost', 'costusd']

/** Turns the columns/rows payload into records keyed by lower-case column name, with the cost under `cost`. */
export function parseCostQuery(res: CostQueryResult | undefined): Record<string, unknown>[] {
  const cols = (res?.properties?.columns ?? []).map((c) => str(c.name).toLowerCase())
  const costCol = cols.find((c) => COST_COLUMNS.includes(c))
  return (res?.properties?.rows ?? []).map((row) => {
    const rec: Record<string, unknown> = {}
    cols.forEach((c, i) => (rec[c] = row[i]))
    if (costCol) rec.cost = rec[costCol]
    return rec
  })
}

/** Cost Management returns UsageDate as a number such as 20260905. */
export function usageDate(v: unknown): string {
  const s = str(v).replace(/[^0-9]/g, '')
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return toTime(v).slice(0, 10)
}

export function toCostDaily(rows: Record<string, unknown>[]): AiCostDaily[] {
  return rows
    .map((r) => ({ date: usageDate(r.usagedate), resourceId: str(r.resourceid).toLowerCase(), cost: num(r.cost), currency: str(r.currency) }))
    .filter((r) => r.resourceId && r.date)
}

export function toCostMeters(rows: Record<string, unknown>[]): AiCostMeter[] {
  return rows
    .map((r) => ({ resourceId: str(r.resourceid).toLowerCase(), meter: str(r.meter) || 'Unspecified meter', cost: num(r.cost), currency: str(r.currency) }))
    .filter((r) => r.resourceId)
}

/** Runs `fn` over `items` with at most `limit` in flight; Cost Management throttles bursts. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
