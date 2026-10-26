import { describe, expect, it } from 'vitest'
import { agentLookup, buildSurfaces, classifySurface, decodeSpo, matchIndex } from './surface'

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const SITE = '11111111-2222-3333-4444-555555555555'
const WEB = '66666666-7777-8888-9999-aaaaaaaaaaaa'
const LIST = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
// Drive item id for ListItemUniqueId 59908df5-0572-402c-aeab-bcc669a28bcc, taken from the anonymised sample.
const ITEM = '01LNQ6KEXVRWIFS4QFFRAK5K54YZU2FC6M'
const SPO = `SPO_${b64url(`${SITE},${WEB},${LIST}`)}_${ITEM}`

describe('classifySurface', () => {
  it('treats a missing identity as base Copilot', () => {
    expect(classifySurface('')).toMatchObject({ surfaceType: 'M365 Copilot (base)', isAgent: false })
    expect(classifySurface(null).surfaceType).toBe('M365 Copilot (base)')
  })

  it('recognises agent identities and their match keys', () => {
    expect(classifySurface('Copilot.Studio.Declarative.T_abc')).toMatchObject({ surfaceType: 'Agent Builder agent', matchKey: 'T_abc', matchOn: 'TitleId', isAgent: true })
    expect(classifySurface('T_xyz')).toMatchObject({ surfaceType: 'Declarative agent', matchKey: 'T_xyz', matchOn: 'TitleId' })
    expect(classifySurface('U_12345678abc')).toMatchObject({ surfaceType: 'Personal agent', displayName: 'Personal agent 12345678' })
    expect(classifySurface('Copilot.Studio.CustomEngine.T_q')).toMatchObject({ surfaceType: 'Custom engine agent', matchKey: 'T_q' })
    expect(classifySurface(SPO)).toMatchObject({ surfaceType: 'SharePoint agent', platform: 'SharePoint', isAgent: true, displayName: 'SharePoint agent U2FC6M' })
  })

  it('pulls the schema name out of Copilot Studio identities', () => {
    const g = '0123abcd-0000-0000-0000-000000000000'
    expect(classifySurface(`Copilot.Studio.${g}-cr123_helpdesk`)).toMatchObject({ surfaceType: 'Copilot Studio agent', matchKey: 'cr123_helpdesk', matchOn: 'SchemaName' })
    expect(classifySurface('Copilot.Studio.Default-0123abcd000000000000000000000000-cr9_bot')).toMatchObject({ matchKey: 'cr9_bot', matchOn: 'SchemaName' })
  })

  it('names first-party and other Microsoft copilots', () => {
    expect(classifySurface('MicrosoftAgent.Researcher.BuiltIn_1')).toMatchObject({ surfaceType: 'Microsoft 1P agent', displayName: 'Researcher', isAgent: false })
    expect(classifySurface('Copilot.M365Copilot.Word').displayName).toBe('M365 Copilot - Word')
    expect(classifySurface('Copilot.Fabric.Notebook').surfaceType).toBe('Fabric / Power BI copilot')
    expect(classifySurface('Something else').surfaceType).toBe('Unknown')
  })
})

describe('decodeSpo', () => {
  it('decodes site, web, list and the item guid', () => {
    expect(decodeSpo(SPO)).toEqual({ siteId: SITE, webId: WEB, listId: LIST, itemId: ITEM, itemGuid: '59908df5-0572-402c-aeab-bcc669a28bcc', ok: true })
  })

  it('returns an empty result for other identities', () => {
    expect(decodeSpo('T_abc')).toMatchObject({ ok: false, itemGuid: '' })
    expect(decodeSpo('SPO_bad_notbase32')).toMatchObject({ ok: false, itemGuid: '' })
  })
})

describe('agent matching', () => {
  const agents = [
    { key: 'e|1', name: 'First', titleId: 'T_ABC', schemaName: 'cr_one' },
    { key: 'e|2', name: 'Second', titleId: 'T_abc', schemaName: 'cr_two' },
  ]

  it('indexes by title and schema, first agent wins, ignoring case', () => {
    const lookup = agentLookup(agents)
    expect(lookup.get('TitleId|t_abc')).toEqual({ key: 'e|1', name: 'First' })
    expect(lookup.get('SchemaName|cr_two')).toEqual({ key: 'e|2', name: 'Second' })
    expect(matchIndex(classifySurface('T_abc'))).toBe('TitleId|t_abc')
    expect(matchIndex(classifySurface(''))).toBeNull()
  })

  it('builds one surface per identity and joins agents and SharePoint agents', () => {
    const sp = [{ key: '59908df5-0572-402c-aeab-bcc669a28bcc', name: 'Policy helper' }] as Parameters<typeof buildSurfaces>[2]
    const out = buildSurfaces(['T_abc', 'T_abc', SPO, '', 'T_none'], agentLookup(agents), sp)
    expect(out).toHaveLength(4)
    expect(out[0]).toMatchObject({ name: 'First', agentKey: 'e|1', isMatched: true })
    expect(out[1]).toMatchObject({ name: 'Policy helper', isMatched: true, spAgentKey: '59908df5-0572-402c-aeab-bcc669a28bcc' })
    expect(out[2]).toMatchObject({ type: 'M365 Copilot (base)', isMatched: false })
    expect(out[3]).toMatchObject({ name: 'T_none', isMatched: false, agentKey: '' })
  })
})
