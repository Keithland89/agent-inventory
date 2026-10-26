import { useMemo, useState } from 'react'
import { useData } from '../data/store'
import { A, ACTIVITY_ORDER, I, PLATFORM, bars, cumulative, div, monthly } from '../metrics/measures'
import { lastDataDay, periodChange, weeklySeries } from '../metrics/periods'
import { href } from '../routes'
import { BarList, ColumnChart, Distribution, LineChart, Sparkline } from '../ui/charts'
import { dateLabel, dec1, int, monthLabel, monthTick, pct, pct0 } from '../ui/format'
import { DeltaPill, Grid, InfoTip, Kpi, KpiRow, Panel, Segmented } from '../ui/primitives'
import { ACTIVITY_COLOR, COLOR, PALETTE, RISK_COLOR } from '../ui/theme'
import { CoverageBanner, StatList } from './common'
import { toDistribution } from './helpers'

const SHORT_PLATFORM: Record<string, string> = {
  [PLATFORM.studio]: 'Copilot Studio',
  [PLATFORM.builder]: 'Agent Builder',
  [PLATFORM.foundry]: 'Foundry',
}

const greetingFor = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')

type GrowthView = 'total' | 'monthly'
const GROWTH_VIEWS: { id: GrowthView; label: string }[] = [
  { id: 'total', label: 'Running total' },
  { id: 'monthly', label: 'Per month' },
]

/** The headline card: every agent, split by the platform it was built on. */
function EstateCard({ total, newIn7, parts }: { total: number; newIn7: number; parts: { label: string; value: number; color: string }[] }) {
  return (
    <div className="kpi kpi-hero kpi-link tone-agent">
      <div className="kpi-label">
        <span>Agent estate</span>
        <InfoTip label="Agent estate" text="Every agent in the inventory across Copilot Studio, Microsoft 365 Copilot Agent Builder and Azure AI Foundry projects." />
      </div>
      <div className="kpi-figure">
        <a className="kpi-value" href={href('inventory', 'all')} aria-label={`${int(total)} agents: show the list`}>
          {int(total)}
        </a>
      </div>
      <div className="kpi-sub">
        <b>{int(newIn7)}</b> new in the last 7 days
      </div>
      <ul className="hero-parts">
        {parts.map((p) => {
          const share = div(p.value, total)
          return (
            <li key={p.label}>
              <span className="hero-track" aria-hidden="true">
                <span style={{ width: `${Number.isFinite(share) ? share * 100 : 0}%`, background: p.color }} />
              </span>
              <span className="hp-label">{SHORT_PLATFORM[p.label] ?? p.label}</span>
              <span className="hp-value">
                {int(p.value)}
                <small>{pct0(share)}</small>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Overview() {
  const { ds, scope } = useData()
  const { agents, interactions } = scope
  const [greeting] = useState(() => greetingFor(new Date().getHours()))
  const [growth, setGrowth] = useState<GrowthView>('total')
  const m = useMemo(() => {
    const created = monthly(agents, (a) => a.createdMonth)
    const end = lastDataDay(ds.interactions)
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
      end,
      newAgents: periodChange(agents, (a) => a.createdAt, ds.asOf, (rs) => rs.length),
      usersWow: periodChange(interactions, (i) => i.date, end, I.activeUsers),
      runTimeWow: periodChange(interactions, (i) => i.date, end, I.runTimeHours),
      agentsWow: periodChange(interactions, (i) => i.date, end, I.agentsWithInteractions),
      usersTrend: weeklySeries(interactions, (i) => i.date, end, I.activeUsers),
      runTimeTrend: weeklySeries(interactions, (i) => i.date, end, I.runTimeHours),
      highTrend: cumulative(monthly(agents.filter((a) => a.riskBand === 'High'), (a) => a.createdMonth))
        .slice(-12)
        .map((p) => p.values[0]),
    }
  }, [agents, interactions, ds.interactions, ds.asOf])
  const wowHelp = m.end ? ` The change compares the 7 days to ${dateLabel(m.end)}, the last day with audit data, with the 7 days before.` : ''
  const active = A.active30(agents)
  const high = A.high(agents)
  const trendLabel = (what: string, v: number[], fmt: (n: number) => string, span: string) =>
    v.length > 1 ? `${what}, ${span}: from ${fmt(v[0])} to ${fmt(v[v.length - 1])}` : what

  return (
    <>
      <div className="greeting">
        <h3>{greeting}</h3>
        <p>Here's the agent estate as of {dateLabel(ds.asOf.slice(0, 10))}.</p>
      </div>
      <CoverageBanner />
      <KpiRow>
        <EstateCard total={agents.length} newIn7={m.newAgents.current} parts={toDistribution(m.platform, undefined)} />
        <Kpi
          label="Active (30 days)"
          value={int(active)}
          tone="licensed"
          progress={{ value: active, total: agents.length }}
          delta={m.end ? <DeltaPill change={m.agentsWow} label="agents used, week on week" /> : undefined}
          sub={`${pct(div(active, agents.length))} of all agents`}
          help={`Agents with a usage signal in the last 30 days.${m.end ? ` The pill is the change in agents with audited interactions.${wowHelp}` : ''}`}
        />
        <Kpi
          label="High risk"
          value={int(high)}
          tone="unlicensed"
          href={href('governance', undefined, { band: 'High' })}
          sub={`${pct(div(high, agents.length))} of all agents`}
          spark={<Sparkline values={m.highTrend} color={RISK_COLOR.High} label={trendLabel('High-risk agents', m.highTrend, int, 'cumulative over the last 12 months')} />}
          help="Agents scoring 5 or more on the heuristic risk model. See Governance & risk. The line is the running total of high-risk agents by the month they were created."
        />
        <Kpi
          label="Active users"
          value={int(m.activeUsers)}
          delta={m.end ? <DeltaPill change={m.usersWow} label="week on week" /> : undefined}
          sub="People using agents"
          spark={<Sparkline values={m.usersTrend} color={COLOR.licensed} label={trendLabel('Weekly active users', m.usersTrend, int, 'last 12 weeks')} />}
          help={`Distinct people with at least one audited interaction with an agent. The line shows each of the last 12 weeks.${wowHelp}`}
        />
        <Kpi
          label="Agent run-time"
          value={`${dec1(m.runTime)} h`}
          delta={m.end ? <DeltaPill change={m.runTimeWow} label="week on week" fmt={(h) => `${dec1(h)} h`} /> : undefined}
          sub="Time in agent conversations"
          spark={<Sparkline values={m.runTimeTrend} color={COLOR.licensed} label={trendLabel('Weekly run-time hours', m.runTimeTrend, dec1, 'last 12 weeks')} />}
          help={`For every conversation and day, the time from the first to the last interaction, summed. The line shows each of the last 12 weeks.${wowHelp}`}
        />
      </KpiRow>
      <Grid cols={3}>
        <Panel
          title={growth === 'total' ? 'Agents created over time' : 'New agents per month'}
          span={2}
          actions={<Segmented label="Agent growth view" value={growth} options={GROWTH_VIEWS} onChange={setGrowth} />}
        >
          {growth === 'total' ? (
            <LineChart label="Cumulative agents by month" data={m.cumulative} series={[{ name: 'Agents', color: COLOR.agent, fmt: int }]} xFmt={monthLabel} tickFmt={monthTick} height={200} area />
          ) : (
            <ColumnChart label="New agents per month" data={m.created} series={[{ name: 'Agents created', color: COLOR.licensed, fmt: int }]} xFmt={monthLabel} tickFmt={monthTick} height={200} />
          )}
        </Panel>
        <StatList
          title="Estate health"
          total={agents.length}
          items={[
            ['Published', int(A.published(agents)), A.published(agents)],
            ['Active (30 days)', int(active), active],
            ['Never used', int(A.neverUsed(agents)), A.neverUsed(agents)],
            ['Shared tenant-wide', int(A.tenantWide(agents)), A.tenantWide(agents)],
            ['High risk', int(high), high],
          ]}
        />
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
