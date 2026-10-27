import { useMemo, useState } from 'react'
import { useData } from '../data/store'
import { A, I, PLATFORM, bars, cumulative, div, monthly } from '../metrics/measures'
import { lastDataDay, periodChange, weeklySeries } from '../metrics/periods'
import { ATTENTION, attentionCounts } from '../metrics/attention'
import { groupSummary, type AppGroup } from '../metrics/chat'
import { costAgainstUse, creditTotals, creditsByAgent } from '../metrics/cost'
import { laneProblems, unknownFrom } from '../metrics/coverage'
import { agentTrends, reviewAgents } from '../metrics/lifecycle'
import { COST_WINDOW_DAYS, costWindow } from '../data/cost'
import { href } from '../routes'
import { ColumnChart, LineChart, Sparkline } from '../ui/charts'
import { dateLabel, int, monthLabel, monthTick, pct, pct0 } from '../ui/format'
import { DeltaPill, Grid, InfoTip, Kpi, KpiRow, Panel, Segmented } from '../ui/primitives'
import { COLOR, RISK_COLOR } from '../ui/theme'
import { CoverageBanner } from './common'
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

interface AttentionItem {
  id: string
  count: number
  label: string
  help: string
  to: string
  /** Security exposure to fix first, or housekeeping that can wait for a review cycle. */
  urgent?: boolean
}

const ATTENTION_GROUPS = [
  { urgent: true, title: 'Fix first' },
  { urgent: false, title: 'Tidy up' },
] as const

/** The briefing's second half: the few counts worth acting on, worst first, each linking to the agents behind it. */
function AttentionList({ items, unknown }: { items: AttentionItem[]; unknown?: string }) {
  const shown = items.filter((i) => i.count > 0)
  return (
    <Panel title="What needs attention" note="Security exposure first, then housekeeping. Select a line to see the agents behind it.">
      {shown.length ? (
        ATTENTION_GROUPS.map((g) => {
          const rows = shown.filter((i) => !!i.urgent === g.urgent)
          if (!rows.length) return null
          return (
            <section key={g.title} className={`at-group${g.urgent ? ' urgent' : ''}`} aria-label={g.title}>
              <h4>{g.title}</h4>
              <ul className="attention">
                {rows.map((i) => (
                  <li key={i.id}>
                    <a href={i.to} title={i.help}>
                      <span className="at-count">{int(i.count)}</span>
                      <span className="at-label">{i.label}</span>
                      <span className="at-go" aria-hidden="true">›</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      ) : (
        <p className="panel-note">Nothing stands out: no agent fails a check.</p>
      )}
      {unknown && <p className="panel-note">Credits not loaded ({unknown.toLowerCase()}), so high-cost agents are not checked.</p>}
    </Panel>
  )
}

export function Overview() {
  const { ds, scope, agentByKey } = useData()
  const { agents, interactions, credits } = scope
  const [greeting] = useState(() => greetingFor(new Date().getHours()))
  const [growth, setGrowth] = useState<GrowthView>('total')
  const creditsUnknown = unknownFrom(laneProblems(ds.lanes, ['credits'])[0])
  const m = useMemo(() => {
    const created = monthly(agents, (a) => a.createdMonth)
    const end = lastDataDay(ds.interactions)
    const groups = new Map(groupSummary(interactions).map((g) => [g.group, g.users]))
    const retire = reviewAgents(agents, agentTrends(interactions, end)).filter((r) => r.verdict === 'Retire').length
    const costRows = creditsByAgent(credits, agentByKey, ds.environments)
    const highCost = costAgainstUse(costRows, interactions, costWindow(new Date(`${ds.asOf.slice(0, 10)}T00:00:00Z`))).flagged
    return {
      created,
      cumulative: cumulative(created),
      platform: bars(agents, (a) => a.platform),
      users: I.users(interactions),
      groups,
      credits: creditTotals(credits),
      end,
      checks: attentionCounts(agents),
      retire,
      highCost,
      newAgents: periodChange(agents, (a) => a.createdAt, ds.asOf, (rs) => rs.length),
      usersWow: periodChange(interactions, (i) => i.date, end, I.users),
      agentsWow: periodChange(interactions, (i) => i.date, end, I.agentsWithInteractions),
      usersTrend: weeklySeries(interactions, (i) => i.date, end, I.users),
      highTrend: cumulative(monthly(agents.filter((a) => a.riskBand === 'High'), (a) => a.createdMonth))
        .slice(-12)
        .map((p) => p.values[0]),
    }
  }, [agents, interactions, credits, agentByKey, ds.interactions, ds.environments, ds.asOf])
  const wowHelp = m.end ? ` The change compares the 7 days to ${dateLabel(m.end)}, the last day with audit data, with the 7 days before.` : ''
  const active = A.active30(agents)
  const high = A.high(agents)
  const shared = A.tenantWide(agents)
  const sharedUnused = A.orphan(agents)
  const trendLabel = (what: string, v: number[], fmt: (n: number) => string, span: string) =>
    v.length > 1 ? `${what}, ${span}: from ${fmt(v[0])} to ${fmt(v[v.length - 1])}` : what
  const groupUsers = (g: AppGroup) => int(m.groups.get(g) ?? 0)
  const check = (id: string) => m.checks.find((c) => c.check.id === id)
  const fromCheck = (id: string): AttentionItem => {
    const c = check(id)!
    return { id, count: c.count, label: c.check.label, help: c.check.help, to: href('inventory', 'all', { focus: id }), urgent: id === 'high-no-owner' || id === 'shared-no-auth' }
  }
  const attention: AttentionItem[] = [
    fromCheck('high-no-owner'),
    fromCheck('shared-no-auth'),
    {
      id: 'retire',
      count: m.retire,
      label: 'Due to retire',
      help: 'Dormant for 90 days, or never used 60 days after it was created.',
      to: href('usage', 'lifecycle', { verdict: 'Retire' }),
    },
    {
      id: 'high-cost',
      count: creditsUnknown ? 0 : m.highCost,
      label: 'High credit use, few users',
      help: `In the top quarter for Copilot Credits over ${COST_WINDOW_DAYS} days, with audited use from 2 or fewer people.`,
      to: href('cost', 'credits'),
    },
    ...ATTENTION.slice(2).map((c) => fromCheck(c.id)),
  ]

  return (
    <>
      <div className="greeting">
        <h3>{greeting}</h3>
        <p>Here's the agent estate as of {dateLabel(ds.asOf.slice(0, 10))}.</p>
      </div>
      <p className="headline">
        <b>{int(agents.length)}</b> agents, and <b>{pct0(div(active, agents.length))}</b> of them were used in the last 30 days. <b>{int(high)}</b> {high === 1 ? 'is' : 'are'} high risk
        {shared ? (
          <>
            , and <b>{int(sharedUnused)}</b> of the {int(shared)} shared tenant-wide {sharedUnused === 1 ? 'has' : 'have'} never been used
          </>
        ) : null}
        .
      </p>
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
          label="People using Copilot"
          value={int(m.users)}
          href={href('activity', 'chat')}
          delta={m.end ? <DeltaPill change={m.usersWow} label="week on week" /> : undefined}
          sub={`Chat ${groupUsers('Copilot Chat')} · Cowork ${groupUsers('Cowork')} · Agents ${groupUsers('Agents')}`}
          spark={<Sparkline values={m.usersTrend} color={COLOR.licensed} label={trendLabel('Weekly Copilot users', m.usersTrend, int, 'last 12 weeks')} />}
          help={`Distinct people with at least one audited Copilot interaction: Copilot Chat, Copilot in the Microsoft 365 apps, Cowork or an agent. The line shows each of the last 12 weeks.${wowHelp}`}
        />
        <Kpi
          label="Copilot Credits"
          value={int(m.credits.total)}
          href={href('cost', 'credits')}
          unknown={creditsUnknown}
          sub={`${int(m.credits.billed)} billed, last ${COST_WINDOW_DAYS} days`}
          help={`Copilot Credits that Copilot Studio agents consumed in the last ${COST_WINDOW_DAYS} days. Billed credits draw down the tenant's capacity; the rest are covered by Microsoft 365 Copilot licences.`}
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
      </KpiRow>
      <Grid cols={3}>
        <Panel
          title={growth === 'total' ? 'Agents created over time' : 'New agents per month'}
          span={2}
          actions={<Segmented label="Agent growth view" value={growth} options={GROWTH_VIEWS} onChange={setGrowth} />}
        >
          {growth === 'total' ? (
            <LineChart label="Cumulative agents by month" data={m.cumulative} series={[{ name: 'Agents', color: COLOR.agent, fmt: int }]} xFmt={monthLabel} tickFmt={monthTick} height={340} area />
          ) : (
            <ColumnChart label="New agents per month" data={m.created} series={[{ name: 'Agents created', color: COLOR.licensed, fmt: int }]} xFmt={monthLabel} tickFmt={monthTick} height={340} />
          )}
        </Panel>
        <AttentionList items={attention} unknown={creditsUnknown} />
      </Grid>
    </>
  )
}