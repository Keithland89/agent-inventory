import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { A, I } from '../metrics/measures'
import { SAMPLE_FILES, sampleDataset, type SampleTexts } from './sample'

const dir = fileURLToPath(new URL('../../public/sample/', import.meta.url))
const read = (name: string) => readFileSync(dir + name, 'utf8')
const texts = { ...Object.fromEntries(SAMPLE_FILES.map((f) => [f, read(`${f}.csv`)])), manifest: read('manifest.json') } as SampleTexts
const ds = sampleDataset(texts)
const manifest = JSON.parse(texts.manifest) as { asOf: string; files: { name: string; rows: number }[] }
const csv = (name: string) => Papa.parse<Record<string, string>>(read(name), { header: true, skipEmptyLines: true }).data

describe('sample', () => {
  it('matches the manifest row counts', () => {
    const counts = Object.fromEntries(manifest.files.map((f) => [f.name, f.rows]))
    expect(ds.agents).toHaveLength(counts['agents.csv'])
    expect(ds.environments).toHaveLength(counts['environments.csv'])
    expect(ds.interactions).toHaveLength(counts['interactions.csv'])
    expect(ds.surfaces.size).toBe(counts['surfaces.csv'])
    expect(ds.spAgents).toHaveLength(counts['sharepoint-agents.csv'])
    expect(ds.asOf).toBe(manifest.asOf)
  })

  it('is internally consistent', () => {
    const agentKeys = new Set(ds.agents.map((a) => a.key))
    const envIds = new Set(ds.environments.map((e) => e.id.toLowerCase()))
    expect(agentKeys.size).toBe(ds.agents.length)
    // A few agents live in environments the source inventory did not list; the model keeps them too.
    const unlisted = ds.agents.filter((x) => x.platform !== 'Azure AI Foundry' && !envIds.has(x.envId.toLowerCase()))
    expect(unlisted.length).toBeLessThan(ds.agents.length * 0.01)
    expect(ds.agents.filter((a) => a.platform !== 'Azure AI Foundry').every((a) => a.envName)).toBe(true)
    for (const c of ds.connectors) expect(agentKeys.has(c.agentKey), c.agentKey).toBe(true)
    for (const k of ds.knowledge) expect(agentKeys.has(k.agentKey), k.agentKey).toBe(true)
    for (const s of ds.surfaces.values()) if (s.agentKey) expect(agentKeys.has(s.agentKey), s.key).toBe(true)
    for (const i of ds.interactions) {
      expect(ds.surfaces.has(i.surfaceKey)).toBe(true)
      expect(i.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    }
    expect(ds.interactions.every((i) => i.user)).toBe(true)
  })

  it('recomputes the risk score, band and reasons the model shipped', () => {
    const shipped = new Map(csv('agents.csv').map((r) => [r.AgentKey, r]))
    const mismatches = ds.agents.filter((a) => {
      const r = shipped.get(a.key)!
      return Number(r.RiskScore) !== a.riskScore || r.RiskBand !== a.riskBand || r.Platform !== a.platform
    })
    expect(mismatches.map((a) => a.key)).toEqual([])
    const withReasons = ds.agents.filter((a) => shipped.get(a.key)!.RiskReasons)
    for (const a of withReasons) expect(a.riskReasons).toBe(shipped.get(a.key)!.RiskReasons)
  })

  it('keeps every Chat and Cowork row and has agents in every risk band', () => {
    const hosts = new Set(ds.interactions.map((i) => i.appHost.toLowerCase()))
    expect(hosts.has('cowork')).toBe(true)
    expect(hosts.has('m365copilot')).toBe(true)
    expect(A.high(ds.agents)).toBeGreaterThan(0)
    expect(A.medium(ds.agents)).toBeGreaterThan(0)
    expect(I.agentsWithInteractions(ds.interactions)).toBeGreaterThan(0)
  })

  it('joins SharePoint agent usage to the SharePoint inventory', () => {
    const sp = [...ds.surfaces.values()].filter((s) => s.type === 'SharePoint agent')
    expect(sp.length).toBeGreaterThan(0)
    expect(sp.filter((s) => s.spAgentKey).length).toBeGreaterThan(0)
  })

  it('marks every lane as sample', () => {
    expect(ds.mode).toBe('sample')
    expect(ds.lanes.every((l) => l.state === 'sample')).toBe(true)
  })
})
