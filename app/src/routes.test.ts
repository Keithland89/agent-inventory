import { describe, expect, it } from 'vitest'
import { href, NAV_GROUPS, parse, TABS } from './routes'

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

  it('reads page parameters from the hash query', () => {
    const r = parse('#/usage/lifecycle?verdict=Retire')
    expect(`${r.tab.id}/${r.view}`).toBe('usage/lifecycle')
    expect(r.params).toEqual({ verdict: 'Retire' })
    expect(parse('#/governance?band=High').params.band).toBe('High')
    expect(parse('#/governance').params).toEqual({})
  })

  it('writes links with only the parameters that are set', () => {
    expect(href('usage', 'lifecycle', { verdict: 'Retire', other: '' })).toBe('#/usage/lifecycle?verdict=Retire')
    expect(href('governance')).toBe('#/governance')
  })

  it('places every section in exactly one nav group', () => {
    const listed = NAV_GROUPS.flatMap((g) => g.tabs)
    expect([...listed].sort()).toEqual(TABS.map((t) => t.id).sort())
  })
})
