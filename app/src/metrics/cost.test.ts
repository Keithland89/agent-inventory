import { describe, expect, it } from 'vitest'
import type { Agent, AgentCredit, AiCostDaily, AiCostMeter, AzureAIResource } from '../data/types'
import { money } from '../ui/format'
import { categoryBars, creditBars, creditsByAgent, creditTotals, dailySpend, mainCurrency, meterBars, poolRows, spendByResource } from './cost'

const credit = (o: Partial<AgentCredit>): AgentCredit => ({
  agentKey: '', envId: 'E1', resourceId: 'b1', feature: 'Generative answer', product: 'Copilot Studio', billed: 0, nonBilled: 0, lastRefreshed: '', ...o,
})
const agent = { key: 'E1|b1', name: 'Helpdesk', envName: 'Prod' } as Agent

describe('credits', () => {
  const credits = [
    credit({ agentKey: 'E1|b1', billed: 10, nonBilled: 4 }),
    credit({ agentKey: 'E1|b1', feature: 'Agent action', billed: 20 }),
    credit({ resourceId: 'gone', billed: 6 }),
    credit({ resourceId: 'zero' }),
  ]

  it('totals billed and non-billed credits and counts agents outside the inventory', () => {
    expect(creditTotals(credits)).toEqual({ billed: 36, nonBilled: 4, total: 40, agents: 2, orphanedCredits: 6, orphanedAgents: 2 })
  })

  it('rolls credits up per agent, naming agents that are not in the inventory', () => {
    const rows = creditsByAgent(credits, new Map([[agent.key, agent]]), [{ id: 'e1', name: 'Default' } as never])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ agentKey: 'E1|b1', name: 'Helpdesk', envName: 'Prod', billed: 30, nonBilled: 4, total: 34, topFeature: 'Agent action' })
    expect(rows[1]).toMatchObject({ agentKey: '', envName: 'Default', total: 6 })
    expect(rows[1].name).toMatch(/^Not in inventory/)
  })

  it('groups credits by feature', () => {
    expect(creditBars(credits, (c) => c.feature).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: 'Agent action', label: 'Agent action', value: 20 },
      { key: 'Generative answer', label: 'Generative answer', value: 20 },
    ])
  })

  it('puts Copilot Credits first in the pool and works out the share used', () => {
    const rows = poolRows([
      { currency: 'AI', purchased: 100, allocated: 0, consumed: 10, lastUpdated: '' },
      { currency: 'MCSMessages', purchased: 0, allocated: 0, consumed: 5, lastUpdated: '' },
    ])
    expect(rows.map((r) => r.name)).toEqual(['Copilot Credits', 'AI Builder credits'])
    expect(Number.isNaN(rows[0].used)).toBe(true)
    expect(rows[1].used).toBeCloseTo(0.1)
  })
})

describe('Azure AI spend', () => {
  const id = (n: string) => `/subscriptions/s/resourcegroups/rg-ai/providers/microsoft.cognitiveservices/accounts/${n}`
  const daily: AiCostDaily[] = [
    { date: '2026-09-01', resourceId: id('a'), cost: 10, currency: 'USD' },
    { date: '2026-09-03', resourceId: id('a'), cost: 5, currency: 'USD' },
    { date: '2026-09-03', resourceId: id('gone'), cost: 2, currency: 'USD' },
    { date: '2026-09-03', resourceId: id('a'), cost: 1, currency: 'EUR' },
  ]
  const meters: AiCostMeter[] = [
    { resourceId: id('a'), meter: 'gpt-4o Output Tokens', cost: 12, currency: 'USD' },
    { resourceId: id('a'), meter: 'gpt-4o Input Tokens', cost: 3, currency: 'USD' },
    { resourceId: id('gone'), meter: 'gpt-4o Output Tokens', cost: 2, currency: 'USD' },
  ]
  const resources = [{ id: id('A').replace('/subscriptions/s', '/subscriptions/S'), name: 'ai-a', category: 'AI Foundry account', resourceGroup: 'rg-ai', region: 'uksouth' } as AzureAIResource]

  it('picks the currency most spend is in and flags a mix', () => {
    expect(mainCurrency(daily)).toEqual({ currency: 'USD', mixed: true })
    expect(mainCurrency([])).toEqual({ currency: '', mixed: false })
  })

  it('joins spend to the Foundry listing case-insensitively', () => {
    const rows = spendByResource(daily, meters, resources, 'USD')
    expect(rows).toEqual([
      { id: id('a'), name: 'ai-a', category: 'AI Foundry account', resourceGroup: 'rg-ai', region: 'uksouth', cost: 15, topMeter: 'gpt-4o Output Tokens', listed: true },
      { id: id('gone'), name: 'gone', category: 'Not in listing', resourceGroup: 'rg-ai', region: '', cost: 2, topMeter: 'gpt-4o Output Tokens', listed: false },
    ])
    expect(categoryBars(rows).map((b) => b.key)).toEqual(['AI Foundry account', 'Not in listing'])
    expect(meterBars(meters, 'USD').find((b) => b.key === 'gpt-4o Output Tokens')?.value).toBe(14)
  })

  it('fills days without spend', () => {
    expect(dailySpend(daily, 'USD', { from: '2026-09-01', to: '2026-09-04' })).toEqual([
      { key: '2026-09-01', values: [10] },
      { key: '2026-09-02', values: [0] },
      { key: '2026-09-03', values: [7] },
      { key: '2026-09-04', values: [0] },
    ])
    expect(dailySpend(daily, 'USD', { from: '', to: '' })).toEqual([])
  })

  it('formats money, falling back for unknown or missing currencies', () => {
    expect(money('USD')(1234.5)).toBe('US$1,235')
    expect(money('GBP')(12.5)).toBe('£12.50')
    expect(money('')(12.5)).toBe('12.50')
    expect(money('ZZZZ')(1500)).toBe('1,500 ZZZZ')
    expect(money('USD')(NaN)).toBe('–')
  })
})
