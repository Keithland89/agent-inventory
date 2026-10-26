import type { AgentBase, CopilotSurface, SharePointAgent } from './types'

/** Port of FnSurface: classifies a Purview CopilotInteraction AppIdentity. */
export interface SurfaceClass {
  surfaceType: string
  platform: string
  matchKey: string
  matchOn: '' | 'TitleId' | 'SchemaName'
  displayName: string
  isAgent: boolean
}

const hexRun = (s: string) => /^[0-9a-fA-F-]*$/.test(s)

const looksGuid = (s: string) =>
  s.length >= 36 && s[8] === '-' && s[13] === '-' && s[18] === '-' && s[23] === '-' && hexRun(s.slice(0, 36))

const mk = (surfaceType: string, platform: string, matchKey: string, matchOn: SurfaceClass['matchOn'], displayName: string, isAgent: boolean): SurfaceClass =>
  ({ surfaceType, platform, matchKey, matchOn, displayName, isAgent })

export function classifySurface(appIdentity: string | null | undefined): SurfaceClass {
  const a = (appIdentity ?? '').trim()
  if (a === '') return mk('M365 Copilot (base)', 'M365 Copilot', '', '', 'M365 Copilot - no app identity', false)
  if (a.startsWith('Copilot.Studio.Declarative.T_')) return mk('Agent Builder agent', 'M365 Copilot', a.slice(27), 'TitleId', a, true)
  if (a.startsWith('TeamsToolkit.Declarative.T_')) return mk('Teams Toolkit agent', 'M365 Copilot', a.slice(25), 'TitleId', 'Teams Toolkit agent ' + a.slice(27, 35), true)
  if (a.startsWith('U_')) return mk('Personal agent', 'M365 Copilot', a, 'TitleId', 'Personal agent ' + a.slice(2, 10), true)
  if (a.startsWith('SPO_')) {
    const sid = decodeSpo(a).itemId
    return mk('SharePoint agent', 'SharePoint', '', '', 'SharePoint agent ' + (sid.length <= 6 ? sid : sid.slice(-6)), true)
  }
  if (a.startsWith('Copilot.Studio.CustomEngine.T_')) return mk('Custom engine agent', 'M365 Copilot', a.slice(28), 'TitleId', a, true)
  if (a.startsWith('Copilot.Studio.Default-')) {
    // Default environment: org id, then '-', then the schema name.
    const rest = a.slice(23)
    const hit = [32, 33, 34, 35, 36].find((n) => rest.length > n + 1 && rest[n] === '-' && hexRun(rest.slice(0, n)))
    if (hit !== undefined) return mk('Copilot Studio agent', 'Copilot Studio', rest.slice(hit + 1), 'SchemaName', a, true)
  }
  if (a.startsWith('Copilot.Studio.')) {
    const rest = a.slice(15)
    if (looksGuid(rest) && rest[36] === '-' && rest.length > 37) return mk('Copilot Studio agent', 'Copilot Studio', rest.slice(37), 'SchemaName', a, true)
  }
  if (a.startsWith('T_')) return mk('Declarative agent', 'M365 Copilot', a, 'TitleId', a, true)
  if (a.startsWith('MicrosoftAgent.AgentBuilder') || a === 'AgentBuilder') return mk('Agent Builder authoring', 'M365 Copilot', '', '', 'Agent Builder (authoring)', false)
  if (a.startsWith('MicrosoftAgent.')) {
    const rest = a.slice(15)
    const cands = [rest.indexOf('.BuiltIn_'), rest.indexOf('.P_')].filter((n) => n > 0)
    if (cands.length) return mk('Microsoft 1P agent', 'M365 Copilot', '', '', rest.slice(0, Math.min(...cands)), false)
  }
  if (a.startsWith('Copilot.M365Copilot.')) return mk('M365 Copilot (base)', 'M365 Copilot', '', '', 'M365 Copilot - ' + a.slice(20), false)
  if (a.startsWith('Copilot.Fabric.')) return mk('Fabric / Power BI copilot', 'Fabric', '', '', a.slice(15), false)
  if (a.startsWith('Copilot.') && a.includes('PowerBI')) return mk('Fabric / Power BI copilot', 'Power BI', '', '', a.slice(8), false)
  if (a.startsWith('Copilot.Studio.')) return mk('Copilot Studio (other)', 'Copilot Studio', '', '', a, false)
  if (a.startsWith('Copilot.')) return mk('Other Microsoft copilot', 'Microsoft 365', '', '', a, false)
  return mk('Unknown', 'Unknown', '', '', a, false)
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeItemGuid(driveItemId: string): string {
  const enc = driveItemId.startsWith('01') ? driveItemId.slice(2) : driveItemId
  const values = [...enc.toUpperCase()].map((c) => B32.indexOf(c))
  if (enc.length !== 32 || values.some((v) => v < 0)) return ''
  const bits: number[] = []
  for (const v of values) for (let p = 4; p >= 0; p--) bits.push((v >> p) & 1)
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((acc, b) => acc * 2 + b, 0))
  if (bytes.length !== 20) return ''
  const g = bytes.slice(4, 20)
  const hex = (xs: number[]) => xs.map((n) => n.toString(16).padStart(2, '0')).join('')
  return [hex(g.slice(0, 4).reverse()), hex(g.slice(4, 6).reverse()), hex(g.slice(6, 8).reverse()), hex(g.slice(8, 10)), hex(g.slice(10, 16))].join('-')
}

function base64UrlToText(blob: string): string {
  try {
    const std = blob.replace(/-/g, '+').replace(/_/g, '/')
    const pad = std + '='.repeat((4 - (std.length % 4)) % 4)
    const bin = atob(pad)
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

/**
 * Port of FnSpo. A SharePoint agent usage identity is SPO_<base64url "site,web,list">_<drive item id>;
 * the drive item id base32-decodes to the ListItemUniqueId that the SharePoint inventory is keyed on.
 */
export function decodeSpo(appIdentity: string | null | undefined) {
  const a = (appIdentity ?? '').trim()
  const empty = { siteId: '', webId: '', listId: '', itemId: '', itemGuid: '', ok: false }
  if (!a.startsWith('SPO_')) return empty
  const body = a.slice(4)
  const cut = body.lastIndexOf('_')
  const blob = cut > 0 ? body.slice(0, cut) : ''
  const item = cut > 0 ? body.slice(cut + 1) : body
  const dec = blob ? base64UrlToText(blob) : ''
  const ids = dec.split(',')
  const itemGuid = decodeItemGuid(item)
  if (ids.length === 3 && dec.length > 0) return { siteId: ids[0], webId: ids[1], listId: ids[2], itemId: item, itemGuid, ok: itemGuid !== '' }
  return { siteId: '', webId: '', listId: '', itemId: item, itemGuid, ok: itemGuid !== '' }
}

/** Port of FnAgentLookup: TitleId and SchemaName match indexes, first agent wins. */
export function agentLookup(agents: Pick<AgentBase, 'key' | 'name' | 'titleId' | 'schemaName'>[]) {
  const map = new Map<string, { key: string; name: string }>()
  for (const a of agents) {
    if (a.titleId) {
      const k = 'TitleId|' + a.titleId.trim().toLowerCase()
      if (!map.has(k)) map.set(k, { key: a.key, name: a.name })
    }
  }
  for (const a of agents) {
    if (a.schemaName) {
      const k = 'SchemaName|' + a.schemaName.trim().toLowerCase()
      if (!map.has(k)) map.set(k, { key: a.key, name: a.name })
    }
  }
  return map
}

export function matchIndex(c: SurfaceClass): string | null {
  return c.isAgent && c.matchKey !== '' ? `${c.matchOn}|${c.matchKey.toLowerCase()}` : null
}

/** Builds the CopilotSurface rows for a set of app identities, as the CopilotSurface partition does. */
export function buildSurfaces(
  appIdentities: Iterable<string>,
  lookup: Map<string, { key: string; name: string }>,
  spAgents: SharePointAgent[],
): CopilotSurface[] {
  const sp = new Map<string, SharePointAgent>()
  for (const s of spAgents) {
    const k = s.key.trim().toLowerCase()
    if (k && !sp.has(k)) sp.set(k, s)
  }
  const seen = new Set<string>()
  const out: CopilotSurface[] = []
  for (const raw of appIdentities) {
    const key = raw ?? ''
    if (seen.has(key)) continue
    seen.add(key)
    const c = classifySurface(key)
    const mi = matchIndex(c)
    const agent = mi ? lookup.get(mi) : undefined
    const spKey = decodeSpo(key).itemGuid.toLowerCase()
    const spAgent = spKey ? sp.get(spKey) : undefined
    out.push({
      key,
      name: spAgent?.name || agent?.name || c.displayName,
      type: c.surfaceType,
      platform: c.platform,
      isAgent: c.isAgent,
      agentKey: agent?.key ?? '',
      matchOn: c.matchOn,
      isMatched: !!agent || !!spAgent,
      spAgentKey: spAgent ? spKey : '',
    })
  }
  return out
}
