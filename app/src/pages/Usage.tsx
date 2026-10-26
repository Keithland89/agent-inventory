import { useMemo, useState } from 'react'
import { TELEMETRY_COVERAGE, type TelemetryCoverageRow } from '../data/static'
import { useData } from '../data/store'
import { adoptionBand } from '../data/transforms'
import type { Agent } from '../data/types'
import { A, ACTIVITY_ORDER, I, bars, distinct, groupBy, monthRange, monthly } from '../metrics/measures'
import { BarList, ColumnChart, Distribution, LineChart, Scatter } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { dec1, int, monthLabel, pct } from '../ui/format'
import { Grid, Kpi, KpiRow, Panel, Select } from '../ui/primitives'
import { ACTIVITY_COLOR, COLOR } from '../ui/theme'
import { agentCol, date, num, ordered, rowsOf, text, toDistribution } from './helpers'

const nameOf = (a: Agent) => ({ key: a.key, name: a.name })
const BANDS = ['No adoption', 'Under 5%', '5-10%', '10-25%', '25% and above', 'No agents']

export function AgentAnalytics() {
  const { scope } = useData()
  const [month, setMonth] = useState('')
  const months = useMemo(() => [...new Set(scope.interactions.map((i) => i.date.slice(0, 7)))].sort(), [scope.interactions])
  const interactions = useMemo(() => (month ? scope.interactions.filter((i) => i.date.startsWith(month)) : scope.interactions), [scope.interactions, month])
  const { agents } = scope
  const m = useMemo(() => {
    const byMonth = groupBy(scope.interactions, (i) => i.date.slice(0, 7))
    const trend = monthRange(months[0], months[months.length - 1]).map((k) => ({ key: k, values: [I.activeUsers(byMonth.get(k) ?? [])] }))
    const names = new Map(agents.map((a) => [a.key, a.name]))
    const trending = bars(interactions.filter((i) => i.agentKey && names.has(i.agentKey)), (i) => i.agentKey, I.activeUsers).map((b) => ({ ...b, label: names.get(b.key) ?? b.key }))
    return {
      trend,
      trending,
      creator: bars(agents, (a) => a.creatorCategory),
      platforms: bars(agents, (a) => a.platform),
      runTime: I.runTimeHours(interactions),
    }
  }, [scope.interactions, interactions, agents, months])
  const { openAgent } = useData()

  return (
    <>
      <div className="filters page-filters" role="group" aria-label="Page filters">
        <Select label="Month" value={month} onChange={setMonth} options={months.map((k) => ({ value: k, label: monthLabel(k) }))} allLabel="All" />
      </div>
      <KpiRow>
        <Kpi label="Active users" value={int(I.activeUsers(interactions))} tone="licensed" />
        <Kpi label="Total sessions" value={int(I.sessions(interactions))} />
        <Kpi label="Avg session length" value={`${dec1(I.avgSessionMinutes(interactions))} min`} help="Run-time divided by sessions." />
        <Kpi label="Agent run-time" value={`${dec1(m.runTime)} h`} />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Active users over time" span={2}>
          <LineChart label="Active users by month" data={m.trend} series={[{ name: 'Active users', color: COLOR.licensed, fmt: int }]} xFmt={monthLabel} area />
        </Panel>
        <Panel title="Agents by creator">
          <Distribution label="Agents by creator category" items={toDistribution(m.creator)} fmt={int} />
        </Panel>
        <Panel title="Trending agents by active users" span={2}>
          <BarList label="Agents by active users" items={m.trending} color={COLOR.agent} fmt={int} limit={12} onSelect={openAgent} />
        </Panel>
        <Panel title="Top platforms used to build agents">
          <BarList label="Agents by platform" items={m.platforms} color={COLOR.licensed} fmt={int} />
        </Panel>
      </Grid>
    </>
  )
}

export function UsagePopularity() {
  const { scope, openAgent } = useData()
  const { agents } = scope
  const m = useMemo(() => {
    const platforms = [...groupBy(agents, (a) => a.platform)].map(([key, rs]) => ({ key, values: [A.used(rs), A.neverUsed(rs)] }))
    const used = agents.filter((a) => a.lastUsed)
    return {
      platforms,
      trend: monthly(used, (a) => a.lastUsedMonth),
      recency: bars(agents, (a) => a.activityStatus),
      rows: rowsOf(used, (a) => a.key),
    }
  }, [agents])
  return (
    <>
      <KpiRow>
        <Kpi label="Agents with usage" value={int(A.used(agents))} tone="licensed" help="Agents with any Power Platform resource-usage record." />
        <Kpi label="Used in 30 days" value={int(A.active30(agents))} />
        <Kpi label="Used this week" value={int(A.active7(agents))} />
        <Kpi label="Active environments" value={int(A.activeEnvs(agents))} />
        <Kpi label="Environment adoption" value={pct(A.envAdoption(agents))} help="Environments with a used agent, out of environments with any agent." />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Usage trend" note="Agents by the month they were last used, from Power Platform resource-usage records." span={2}>
          <LineChart label="Agents by month last used" data={m.trend} series={[{ name: 'Agents used', color: COLOR.licensed, fmt: int }]} xFmt={monthLabel} area />
        </Panel>
        <Panel title="Recency cohorts">
          <Distribution label="Agents by recency" items={toDistribution(m.recency, ACTIVITY_COLOR, ACTIVITY_ORDER)} fmt={int} />
        </Panel>
        <Panel title="Usage by platform" span={3}>
          <ColumnChart
            label="Used and never-used agents by platform"
            data={m.platforms}
            series={[
              { name: 'Agents used', color: COLOR.licensed, fmt: int },
              { name: 'Never used', color: '#b8c1cc', fmt: int },
            ]}
            xFmt={(k) => k}
          />
        </Panel>
        <Panel title="Most active agents" span={3}>
          <DataTable
            label="Most recently used agents"
            rows={m.rows}
            search={(a) => `${a.name} ${a.envName} ${a.createdByName}`}
            onRowClick={(a) => openAgent(a.key)}
            initialSort={{ key: 'used', desc: true }}
            columns={[
              agentCol(nameOf),
              text('creator', 'Created by', (a: Agent) => a.createdByName),
              text('platform', 'Platform', (a: Agent) => a.platform),
              text('env', 'Environment', (a: Agent) => a.envName),
              date('used', 'Last used', (a: Agent) => a.lastUsed),
              num('days', 'Days since use', (a: Agent) => a.daysSinceLastUse ?? NaN),
              text('status', 'Activity', (a: Agent) => a.activityStatus),
            ]}
          />
        </Panel>
        <Panel title="Why some platforms show zero usage" span={3}>
          <DataTable
            label="Usage telemetry per platform"
            rows={rowsOf(TELEMETRY_COVERAGE, (r) => r.platform)}
            initialSort={{ key: 'order' }}
            columns={[
              { key: 'order', label: 'Platform', value: (r) => r.sortOrder, render: (r) => r.platform, width: '18%' },
              text('signal', 'Usage signal', (r: TelemetryCoverageRow) => r.usageSignal),
              text('volume', 'Message volume', (r: TelemetryCoverageRow) => r.messageVolume),
              text('why', 'Why not', (r: TelemetryCoverageRow) => r.whyNot, '45%'),
            ]}
          />
        </Panel>
      </Grid>
    </>
  )
}

interface PlatformRow {
  platform: string
  agents: number
  published: number
  active: number
  rate: number
}

interface EnvRow {
  env: string
  agents: number
  never: number
  active: number
  rate: number
}

export function Adoption() {
  const { ds, scope, openAgent } = useData()
  const { agents } = scope
  const m = useMemo(() => {
    const envRows: EnvRow[] = [...groupBy(agents, (a) => a.envName || '(Blank)')].map(([env, rs]) => ({
      env,
      agents: rs.length,
      never: A.neverUsed(rs),
      active: A.active30(rs),
      rate: A.adoptionRate(rs),
    }))
    const byEnvId = groupBy(agents, (a) => a.envId.toLowerCase())
    const envs = scope.filtered ? ds.environments.filter((e) => byEnvId.has(e.id.toLowerCase())) : ds.environments
    const bands = bars(envs, (e) => {
      const rs = byEnvId.get(e.id.toLowerCase()) ?? []
      return adoptionBand(rs.length, A.active30(rs))
    })
    const platforms = [...groupBy(agents, (a) => a.platform)].map(([platform, rs]) => ({
      platform,
      agents: rs.length,
      published: A.published(rs),
      active: A.active30(rs),
      rate: A.adoptionRate(rs),
    }))
    return {
      envRows,
      bands: ordered(bands, BANDS),
      activity: ordered(bars(agents, (a) => a.activityStatus), ACTIVITY_ORDER),
      lastUsed: monthly(agents.filter((a) => a.lastUsed), (a) => a.lastUsedMonth),
      cleanup: bars(agents.filter((a) => !a.lastUsed), (a) => a.envName),
      platforms,
      recent: rowsOf(agents.filter((a) => a.lastUsed), (a) => a.key),
    }
  }, [agents, ds.environments, scope.filtered])

  return (
    <>
      <KpiRow>
        <Kpi label="Adoption rate (30d)" value={pct(A.adoptionRate(agents))} tone="licensed" help="Agents used in the last 30 days, out of all agents." />
        <Kpi label="Active this week" value={int(A.active7(agents))} />
        <Kpi label="Never used" value={int(A.neverUsed(agents))} tone="unlicensed" />
        <Kpi label="Idle (90d)" value={int(A.idle(agents))} />
        <Kpi label="Dormant (90d+)" value={int(A.dormant(agents))} />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Last-used trend" span={2}>
          <LineChart label="Agents by month last used" data={m.lastUsed} series={[{ name: 'Agents', color: COLOR.licensed, fmt: int }]} xFmt={monthLabel} area />
        </Panel>
        <Panel title="Activity distribution">
          <BarList label="Agents by activity status" items={m.activity.map((b) => ({ ...b, color: ACTIVITY_COLOR[b.key] }))} color={COLOR.neutral} fmt={int} keepOrder />
        </Panel>
        <Panel title="Environment health" note="Bubble size is the 30-day adoption rate." span={2}>
          <Scatter
            label="Environments by never-used and total agents"
            points={m.envRows.map((e) => ({ key: e.env, label: e.env, x: e.never, y: e.agents, size: e.rate || 0 }))}
            color={COLOR.agent}
            xLabel="Agents never used"
            yLabel="Agents"
            sizeLabel="Adoption rate"
            xFmt={int}
            yFmt={int}
          />
        </Panel>
        <Panel title="Environments by adoption band">
          <BarList label="Environments by adoption band" items={m.bands} color={COLOR.licensed} fmt={int} keepOrder />
        </Panel>
        <Panel title="Biggest clean-up targets" note="Environments with the most never-used agents.">
          <BarList label="Never-used agents by environment" items={m.cleanup} color={COLOR.unlicensed} fmt={int} limit={10} />
        </Panel>
        <Panel title="Platform adoption" span={2}>
          <DataTable
            label="Platform adoption"
            rows={rowsOf(m.platforms, (r) => r.platform)}
            initialSort={{ key: 'agents', desc: true }}
            columns={[
              text('platform', 'Platform', (r: PlatformRow) => r.platform),
              num('agents', 'Agents', (r: PlatformRow) => r.agents, { bar: COLOR.agent }),
              num('published', 'Published', (r: PlatformRow) => r.published),
              num('active', 'Active (30d)', (r: PlatformRow) => r.active),
              num('rate', 'Adoption rate', (r: PlatformRow) => r.rate, { fmt: pct }),
            ]}
          />
        </Panel>
        <Panel title="Most recently used agents" span={3}>
          <DataTable
            label="Most recently used agents"
            rows={m.recent}
            search={(a) => `${a.name} ${a.envName}`}
            onRowClick={(a) => openAgent(a.key)}
            initialSort={{ key: 'used', desc: true }}
            columns={[
              agentCol(nameOf),
              text('env', 'Environment', (a: Agent) => a.envName),
              date('used', 'Last used', (a: Agent) => a.lastUsed),
              num('days', 'Days since use', (a: Agent) => a.daysSinceLastUse ?? NaN),
            ]}
          />
        </Panel>
      </Grid>
      <p className="foot-note">{int(distinct(agents, (a) => a.envId.toLowerCase()))} environments contain the agents in view.</p>
    </>
  )
}
