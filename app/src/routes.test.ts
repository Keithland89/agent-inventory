import { describe, expect, it } from 'vitest'
import { parse, TABS } from './routes'

const route = (hash: string) => {
  const r = parse(hash)
  return `${r.tab.id}/${r.view}`
}

describe('routes', () => {
  it('sends the old SharePoint tab to its Inventory view', () => {
    expect(route('#/sharepoint')).toBe('inventory/sharepoint')
    expect(TABS.some((t) => (t.id as string) === 'sharepoint')).toBe(false)
  })

  it('opens the new views', () => {
    expect(route('#/usage/lifecycle')).toBe('usage/lifecycle')
    expect(route('#/activity/habits')).toBe('activity/habits')
  })

  it('falls back to the first view or tab', () => {
    expect(route('#/usage/nope')).toBe(`usage/${TABS.find((t) => t.id === 'usage')!.views[0].id}`)
    expect(parse('#/nope').tab).toBe(TABS[0])
  })
})
