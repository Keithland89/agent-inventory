import { describe, expect, it, vi } from 'vitest'

// The SDK only resolves inside a bundler; these helpers never call it.
vi.mock('@microsoft/managed-apps/app', () => ({ getContext: vi.fn() }))
vi.mock('@microsoft/managed-apps/data', () => ({ getClient: vi.fn() }))

import { costQueryBody, costWindow, mapCredit, mapCreditPool, mapLimit, parseCostQuery, toCostDaily, toCostMeters, usageDate } from './cost'
import { aiCostDetail, loadAiCost, loadCredits } from './live'

describe('cost mappers', () => {
  it('builds an inclusive window ending today (UTC)', () => {
    expect(costWindow(new Date('2026-09-05T20:47:21Z'))).toEqual({ from: '2026-08-07', to: '2026-09-05' })
    expect(costWindow(new Date('2026-03-01T00:30:00Z'), 7)).toEqual({ from: '2026-02-23', to: '2026-03-01' })
  })

  it('maps a credit snapshot, reading metadata case-insensitively', () => {
    const c = mapCredit({
      resourceId: 'bot-1', environmentId: 'env-1', consumed: 42, lastRefreshedDate: '2026-09-05T06:00:00Z',
      metadata: { featurename: 'Generative answer', NONBILLABLECONSUMED: '8' },
    })
    expect(c).toMatchObject({ agentKey: 'env-1|bot-1', envId: 'env-1', resourceId: 'bot-1', feature: 'Generative answer', product: 'Copilot Studio', billed: 42, nonBilled: 8 })
    expect(mapCredit({ consumed: 'x' as unknown as number })).toMatchObject({ agentKey: '', billed: 0, feature: 'Unspecified' })
  })

  it('maps a currency report', () => {
    expect(mapCreditPool({ currencyType: 'MCSMessages', purchased: 250000, allocated: 200000, consumed: { unitsConsumed: 1234, lastUpdatedDay: '2026-09-04' } }))
      .toMatchObject({ currency: 'MCSMessages', purchased: 250000, allocated: 200000, consumed: 1234 })
    expect(mapCreditPool({})).toMatchObject({ currency: 'Unknown', purchased: 0, consumed: 0 })
  })

  it('asks Cost Management for daily spend by resource, and meter totals, on AI resource types only', () => {
    const w = { from: '2026-08-07', to: '2026-09-05' }
    const daily = costQueryBody(w, true) as { dataset: { granularity: string; grouping: { name: string }[]; filter: { dimensions: { values: string[] } } } }
    const meters = costQueryBody(w, false) as typeof daily
    expect(daily.dataset.granularity).toBe('Daily')
    expect(daily.dataset.grouping.map((g) => g.name)).toEqual(['ResourceId'])
    expect(meters.dataset.granularity).toBe('None')
    expect(meters.dataset.grouping.map((g) => g.name)).toEqual(['ResourceId', 'Meter'])
    expect(daily.dataset.filter.dimensions.values).toContain('microsoft.cognitiveservices/accounts')
  })

  it('parses the columns/rows payload and normalises dates, ids and the cost column', () => {
    const res = {
      properties: {
        columns: [{ name: 'PreTaxCost' }, { name: 'UsageDate' }, { name: 'ResourceId' }, { name: 'Currency' }],
        rows: [[1.5, 20260905, '/SUBSCRIPTIONS/S/RESOURCEGROUPS/RG/PROVIDERS/MICROSOFT.COGNITIVESERVICES/ACCOUNTS/A', 'EUR'], [2, 20260904, '', 'EUR']],
      },
    }
    expect(toCostDaily(parseCostQuery(res))).toEqual([
      { date: '2026-09-05', resourceId: '/subscriptions/s/resourcegroups/rg/providers/microsoft.cognitiveservices/accounts/a', cost: 1.5, currency: 'EUR' },
    ])
    expect(toCostMeters(parseCostQuery({ properties: { columns: [{ name: 'Cost' }, { name: 'ResourceId' }, { name: 'Meter' }, { name: 'Currency' }], rows: [[3, 'X', null, 'USD']] } })))
      .toEqual([{ resourceId: 'x', meter: 'Unspecified meter', cost: 3, currency: 'USD' }])
    expect(parseCostQuery(undefined)).toEqual([])
    expect(usageDate('2026-09-05T00:00:00')).toBe('2026-09-05')
  })

  it('limits concurrency and keeps order', async () => {
    let live = 0
    let peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++live)
      await new Promise((r) => setTimeout(r, 1))
      live--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBe(2)
  })
})

describe('cost lanes', () => {
  it('follows continuation tokens, drops zero rows and stops on a repeated token', async () => {
    const pages: Record<string, unknown> = {
      start: { value: [{ resourceId: 'a', environmentId: 'e', consumed: 5 }, { resourceId: 'b', environmentId: 'e', consumed: 0 }], continuationtoken: 't1' },
      t1: { value: [{ resourceId: 'c', environmentId: 'e', consumed: 7 }], '@odata.nextLink': 'https://x/y?api-version=1&continuationToken=t2' },
      t2: { value: [{ resourceId: 'd', environmentId: 'e', consumed: 1 }], continuationtoken: 't2' },
    }
    const seen: (string | undefined)[] = []
    const rows = await loadCredits(async (token) => {
      seen.push(token)
      return pages[token ?? 'start'] as never
    })
    expect(rows.map((r) => r.resourceId)).toEqual(['a', 'c', 'd'])
    expect(seen).toEqual([undefined, 't1', 't2'])
  })

  it('counts subscriptions it could not query or that returned more than one page', async () => {
    const page = (cost: number, nextLink?: string) => ({
      properties: { columns: [{ name: 'Cost' }, { name: 'UsageDate' }, { name: 'ResourceId' }, { name: 'Currency' }], rows: [[cost, 20260905, 'r', 'USD']], nextLink },
    })
    const r = await loadAiCost(['ok', 'big', 'denied'], async (sub, daily) => {
      if (sub === 'denied') throw new Error('403')
      return daily ? page(1, sub === 'big' ? 'https://next' : undefined) : { properties: { columns: [{ name: 'Cost' }, { name: 'ResourceId' }, { name: 'Meter' }], rows: [[1, 'r', 'm']] } }
    })
    expect(r.daily).toHaveLength(2)
    expect(r.meters).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.truncated).toBe(1)
    expect(String(r.firstError)).toContain('403')
    expect(aiCostDetail(r, 3)).toMatch(/1 of 3 subscription\(s\) could not be queried.*1 subscription\(s\) returned more than one page/)
    expect(aiCostDetail({ skipped: 0, truncated: 0 }, 3)).toBeUndefined()
  })
})
