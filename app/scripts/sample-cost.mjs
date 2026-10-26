// Adds synthetic cost data to public/sample. The anonymised source has no cost tables, so this
// derives plausible Copilot Credits and Azure AI spend from the sample's own agents, interactions
// and Azure AI resources. Seeded, so reruns give the same files.
// Usage: node scripts/sample-cost.mjs   (run after prepare-sample.mjs; `npm run sample` runs both)
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'

const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public', 'sample')
const read = (name) => Papa.parse(readFileSync(join(dir, name), 'utf8').replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true }).data
const manifestPath = join(dir, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

let seed = 20260905
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (xs) => xs[Math.floor(rand() * xs.length)]
const round2 = (n) => Math.round(n * 100) / 100
const hex = (n) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('')
const guid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`

const DAYS = 30
const end = new Date(`${manifest.asOf.slice(0, 10)}T00:00:00Z`)
const days = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(end)
  d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i))
  return d.toISOString().slice(0, 10)
})
const from = days[0]
const refreshed = `${manifest.asOf.slice(0, 10)}T06:00:00`

// ---------- Copilot Credits per agent ----------
const agents = read('agents.csv').filter((a) => a.Platform === 'Copilot Studio')
const surfaces = read('surfaces.csv')
const hits = new Map()
for (const r of read('interactions.csv')) {
  if (r.CreationTime.slice(0, 10) < from) continue
  const key = surfaces[Number(r.Surface)]?.AgentKey
  if (key) hits.set(key, (hits.get(key) ?? 0) + 1)
}

// Credits per billable event, from the Copilot Studio billing rates.
const FEATURES = [
  { name: 'Generative answer', rate: 2, share: 0.5 },
  { name: 'Classic answer', rate: 1, share: 0.15 },
  { name: 'Agent action', rate: 5, share: 0.25 },
  { name: 'Tenant graph grounding', rate: 10, share: 0.1 },
]

const credits = []
const addAgent = (envId, botId, key, events, licensedShare) => {
  for (const f of FEATURES) {
    const n = Math.round(events * f.share * (0.6 + rand() * 0.8))
    if (!n) continue
    const total = n * f.rate
    const nonBilled = Math.round(total * licensedShare)
    credits.push({
      AgentKey: key, EnvironmentId: envId, ResourceId: botId, Feature: f.name, ProductName: 'Copilot Studio',
      BilledCredits: total - nonBilled, NonBilledCredits: nonBilled, LastRefreshed: refreshed,
    })
  }
}
for (const a of agents) {
  const seen = hits.get(a.AgentKey) ?? 0
  const recent = a.LastUsed && a.LastUsed.slice(0, 10) >= from
  if (!seen && !(recent && rand() < 0.35)) continue
  // Audit rows undercount agent turns, and each turn can bill more than one event.
  const events = Math.max(4, Math.round((seen || 3 + rand() * 25) * (2 + rand() * 4)))
  // Agents used by Microsoft 365 Copilot licensed users in Teams and Copilot Chat are not billed.
  const licensedShare = rand() < 0.3 ? 0.3 + rand() * 0.6 : 0
  addAgent(a.EnvironmentId, a.AgentId, a.AgentKey, events, licensedShare)
}
// A few agents that were deleted after they consumed credits.
const envIds = [...new Set(agents.map((a) => a.EnvironmentId))]
for (let i = 0; i < 6; i++) {
  const env = pick(envIds)
  const bot = guid()
  addAgent(env, bot, `${env}|${bot}`, 20 + Math.round(rand() * 200), 0)
}

const billed = credits.reduce((s, c) => s + c.BilledCredits, 0)
const pool = [
  { CurrencyType: 'MCSMessages', Purchased: 250000, Allocated: 200000, Consumed: billed, LastUpdated: manifest.asOf.slice(0, 10) },
  { CurrencyType: 'AI', Purchased: 1000000, Allocated: 400000, Consumed: 182340, LastUpdated: manifest.asOf.slice(0, 10) },
]

// ---------- Azure AI spend ----------
const resources = read('ai-resources.csv')
const BILLED = new Set(['AI Foundry account', 'Azure OpenAI', 'Foundry hub', 'SpeechServices', 'FormRecognizer', 'TextAnalytics', 'ContentSafety'])
const priced = resources.filter((r) => BILLED.has(r.Category) && rand() < 0.45)
const METERS = {
  'AI Foundry account': ['gpt-4o Input Tokens', 'gpt-4o Output Tokens', 'gpt-4o-mini Input Tokens', 'gpt-4o-mini Output Tokens', 'text-embedding-3-large Tokens', 'Agent Service Code Interpreter Sessions'],
  'Azure OpenAI': ['gpt-4o Input Tokens', 'gpt-4o Output Tokens', 'gpt-4.1-mini Input Tokens', 'gpt-4.1-mini Output Tokens', 'text-embedding-3-small Tokens'],
  'Foundry hub': ['Standard DSv2 Family vCPU', 'Standard NCADS A100 v4 vCPU', 'Managed Online Endpoint Hours'],
  SpeechServices: ['S1 Speech to Text', 'S1 Neural Text to Speech Characters'],
  FormRecognizer: ['S0 Read Pages', 'S0 Prebuilt Pages'],
  TextAnalytics: ['S Text Records'],
  ContentSafety: ['S0 Text Records', 'S0 Image Images'],
}
const SCALE = { 'AI Foundry account': 60, 'Azure OpenAI': 45, 'Foundry hub': 30, SpeechServices: 4, FormRecognizer: 3, TextAnalytics: 1.5, ContentSafety: 1 }

const daily = []
const meters = []
for (const r of priced) {
  const id = r.ResourceId.toLowerCase()
  const base = SCALE[r.Category] * Math.exp(rand() * 3 - 1.5)
  const growth = 0.6 + rand() * 0.9
  const start = rand() < 0.15 ? Math.floor(rand() * 20) : 0
  let total = 0
  days.forEach((d, i) => {
    if (i < start) return
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
    const weekday = dow === 0 || dow === 6 ? 0.35 : 1
    const trend = 2 - growth + (growth - 1) * (i / (DAYS - 1))
    const cost = round2(base * weekday * trend * (0.7 + rand() * 0.6))
    if (cost <= 0) return
    total += cost
    daily.push({ UsageDate: d.replaceAll('-', ''), ResourceId: id, Cost: cost.toFixed(2), Currency: 'USD' })
  })
  const names = METERS[r.Category]
  const weights = names.map(() => rand() ** 2 + 0.05)
  const sum = weights.reduce((a, b) => a + b, 0)
  names.forEach((m, i) => meters.push({ ResourceId: id, Meter: m, Cost: round2((total * weights[i]) / sum).toFixed(2), Currency: 'USD' }))
}

// ---------- write ----------
const outputs = []
const write = (name, rows, fields) => {
  writeFileSync(join(dir, name), Papa.unparse({ fields, data: rows.map((r) => fields.map((f) => r[f] ?? '')) }, { newline: '\n' }) + '\n')
  outputs.push({ name, rows: rows.length })
}
write('credits.csv', credits, ['AgentKey', 'EnvironmentId', 'ResourceId', 'Feature', 'ProductName', 'BilledCredits', 'NonBilledCredits', 'LastRefreshed'])
write('credit-pool.csv', pool, ['CurrencyType', 'Purchased', 'Allocated', 'Consumed', 'LastUpdated'])
write('ai-cost-daily.csv', daily, ['UsageDate', 'ResourceId', 'Cost', 'Currency'])
write('ai-cost-meters.csv', meters, ['ResourceId', 'Meter', 'Cost', 'Currency'])

const names = new Set(outputs.map((o) => o.name))
manifest.files = [...manifest.files.filter((f) => !names.has(f.name)), ...outputs]
manifest.syntheticCost = true
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
for (const o of outputs) console.log(`${o.name.padEnd(24)} ${String(o.rows).padStart(7)} rows`)
console.log(`billed credits ${billed}; AI spend $${daily.reduce((s, d) => s + Number(d.Cost), 0).toFixed(2)} over ${priced.length} resources`)
