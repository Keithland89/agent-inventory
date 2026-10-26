import { useMemo } from 'react'
import { useData } from '../data/store'
import { A, ACTIVITY_ORDER, I, PLATFORM, bars, cumulative, monthly } from '../metrics/measures'
import { BarList, ColumnChart, Distribution, LineChart } from '../ui/charts'
import { dec1, int, monthLabel } from '../ui/format'
import { Grid, Kpi, KpiRow, Panel } from '../ui/primitives'
import { ACTIVITY_COLOR, COLOR, PALETTE } from '../ui/theme'
import { StatList } from './common'
import { toDistribution } from './helpers'

export function Overview() {
  const { scope } = useData()
  const { agents, interactions } = scope
  const m = useMemo(() => {
    const created = monthly(agents, (a) => a.createdMonth)
    return {
      created,
      cumulative: cumulative(created),
      platform: bars(agents, (a) => a.platform),
      activity: bars(agents, (a) => a.activityStatus),
      orchestration: bars(agents, (a) => a.orchestration),
      auth: bars(agents, (a) => a.authentication ?? '(Blank)'),
      envs: bars(agents, (a) => a.envName),
      activeUsers: I.activeUsers(interactions),
      runTime: I.runTimeHours(interactions),
    }
  }, [agents, interactions])

  return (
    <>
      <KpiRow>
        <Kpi label="Total agents" value={int(agents.length)} tone="agent" help="Every agent in the inventory across Copilot Studio, Microsoft 365 Copilot Agent Builder and Azure AI Foundry." />
        <Kpi label="Copilot Studio" value={int(A.platform(PLATFORM.studio)(agents))} />
        <Kpi label="M365 Agent Builder" value={int(A.platform(PLATFORM.builder)(agents))} />
        <Kpi label="Foundry projects" value={int(A.platform(PLATFORM.foundry)(agents))} help="Azure AI Foundry projects that can host agents." />
        <Kpi label="Active (30 days)" value={int(A.active30(agents))} tone="licensed" help="Agents with a usage signal in the last 30 days." />
        <Kpi label="High risk" value={int(A.high(agents))} tone="unlicensed" help="Agents scoring 5 or more on the heuristic risk model. See Governance & risk." />
        <Kpi label="Active users" value={int(m.activeUsers)} help="Distinct people with at least one audited interaction with an agent." />
        <Kpi label="Agent run-time" value={`${dec1(m.runTime)} h`} help="For every conversation and day, the time from the first to the last interaction, summed." />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Agents created over time" span={2}>
          <LineChart label="Cumulative agents by month" data={m.cumulative} series={[{ name: 'Agents', color: COLOR.agent, fmt: int }]} xFmt={monthLabel} area />
        </Panel>
        <StatList
          title="Estate health"
          items={[
            ['Published', int(A.published(agents))],
            ['Active (30d)', int(A.active30(agents))],
            ['Never used', int(A.neverUsed(agents))],
            ['Shared tenant-wide', int(A.tenantWide(agents))],
            ['High risk', int(A.high(agents))],
          ]}
        />
        <Panel title="New agents per month" span={2}>
          <ColumnChart label="New agents per month" data={m.created} series={[{ name: 'Agents created', color: COLOR.licensed, fmt: int }]} xFmt={monthLabel} />
        </Panel>
        <Panel title="Agents by platform">
          <Distribution label="Agents by platform" items={toDistribution(m.platform, undefined)} fmt={int} />
        </Panel>
        <Panel title="Activity status">
          <Distribution label="Agents by activity status" items={toDistribution(m.activity, ACTIVITY_COLOR, ACTIVITY_ORDER)} fmt={int} />
        </Panel>
        <Panel title="Orchestration">
          <BarList label="Agents by orchestration" items={m.orchestration} color={PALETTE[1]} fmt={int} limit={8} />
        </Panel>
        <Panel title="Authentication">
          <BarList label="Agents by authentication" items={m.auth} color={PALETTE[2]} fmt={int} limit={8} />
        </Panel>
        <Panel title="Top environments" span={3}>
          <BarList label="Agents by environment" items={m.envs} color={COLOR.licensed} fmt={int} limit={12} />
        </Panel>
      </Grid>
    </>
  )
}
