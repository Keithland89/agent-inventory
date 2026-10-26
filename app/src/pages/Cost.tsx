import { useMemo } from 'react'
import { costWindow, COST_WINDOW_DAYS, CREDIT_ENTITLEMENT } from '../data/cost'
import { useData } from '../data/store'
import {
  categoryBars, costAgainstUse, creditBars, creditsByAgent, creditTotals, dailySpend, mainCurrency, meterBars, poolRows, spendByResource,
  type AgentCreditRow, type CostUseRow, type ResourceSpendRow,
} from '../metrics/cost'
import { laneProblems, unknownFrom } from '../metrics/coverage'
import { div } from '../metrics/measures'
import { BarList, Distribution, LineChart } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { dateLabel, dayLabel, int, money, pct } from '../ui/format'
import { Empty, Grid, Kpi, KpiRow, Panel } from '../ui/primitives'
import { COLOR, PALETTE } from '../ui/theme'
import { LaneNotice } from './common'
import { agentCol, num, rowsOf, text, toDistribution } from './helpers'

const COST_ROLE = 'Cost Management needs Cost Management Reader, or Reader, on each subscription that holds Azure AI resources.'

export function CopilotCredits() {
  const { ds, scope, agentByKey, openAgent } = useData()
  const problems = laneProblems(ds.lanes, ['credits', 'creditpool'])
  const creditsUnknown = unknownFrom(problems.find((p) => p.lane.id === 'credits'))
  const poolUnknown = unknownFrom(problems.find((p) => p.lane.id === 'creditpool'))
  const poolLane = ds.lanes.find((l) => l.id === 'creditpool')
  const credits = scope.credits
  const m = useMemo(() => {
    const rows = creditsByAgent(credits, agentByKey, ds.environments)
    const envOf = new Map(rows.map((r) => [r.key, r.envName]))
    const use = costAgainstUse(rows, scope.interactions, costWindow(new Date(`${ds.asOf.slice(0, 10)}T00:00:00Z`)))
    return {
      totals: creditTotals(credits),
      rows,
      use,
      top: rows.map((r) => ({ key: r.key, label: r.name, value: r.total, hint: r.envName })),
      features: toDistribution(creditBars(credits, (c) => c.feature).sort((a, b) => b.value - a.value)),
      envs: creditBars(credits, (c) => envOf.get(c.agentKey || `${c.envId}|${c.resourceId}`.toLowerCase()) ?? c.envId),
      pool: poolRows(ds.creditPool),
    }
  }, [credits, agentByKey, ds.environments, ds.creditPool, ds.asOf, scope.interactions])
  const copilotPool = m.pool.find((p) => p.currency === CREDIT_ENTITLEMENT)
  const byKey = new Map(m.rows.map((r) => [r.key, r]))

  return (
    <>
      <p className="page-intro">
        Copilot Credits that Copilot Studio agents consumed in the last {COST_WINDOW_DAYS} days, from the Power Platform licensing API, and the tenant's prepaid capacity.
        Billed credits draw down the capacity pool; non-billed credits are covered by Microsoft 365 Copilot licences. The agent slicers apply to per-agent credits, not to the pool.
      </p>
      <LaneNotice problems={problems} />
      <KpiRow>
        <Kpi
          label="Billed credits"
          value={int(m.totals.billed)}
          tone="agent"
          help={`Credits charged to the tenant's capacity in the last ${COST_WINDOW_DAYS} days.`}
          unknown={creditsUnknown}
        />
        <Kpi
          label="Non-billed credits"
          value={int(m.totals.nonBilled)}
          tone="licensed"
          help="Usage by Microsoft 365 Copilot licensed users in Teams, SharePoint and Copilot Chat, which is not charged."
          unknown={creditsUnknown}
        />
        <Kpi
          label="Agents consuming"
          value={int(m.totals.agents)}
          sub={m.totals.orphanedAgents ? `${int(m.totals.orphanedAgents)} not in inventory` : undefined}
          unknown={creditsUnknown}
        />
        <Kpi
          label="Copilot Credits purchased"
          value={copilotPool ? int(copilotPool.purchased) : '–'}
          help="Prepaid Copilot Credit capacity for the tenant, from the licensing currency report."
          unknown={poolUnknown}
        />
        <Kpi
          label="Capacity used"
          value={copilotPool ? pct(copilotPool.used) : '–'}
          tone={copilotPool && copilotPool.used >= 0.8 ? 'unlicensed' : 'neutral'}
          help="Consumed as a share of purchased Copilot Credits for the current period."
          progress={copilotPool ? { value: copilotPool.consumed, total: copilotPool.purchased } : undefined}
          unknown={poolUnknown}
        />
      </KpiRow>
      {credits.length === 0 && m.pool.length === 0 ? (
        scope.filtered ? <Empty>No credits for the agents in view.</Empty> : problems.length ? null : <Empty>No credit data was returned.</Empty>
      ) : (
        <Grid cols={3}>
          <Panel title="Top agents by credits" span={2} note="Billed plus non-billed. Select an agent to open its details.">
            <BarList
              label="Agents by Copilot Credits"
              items={m.top}
              color={COLOR.agent}
              fmt={int}
              limit={12}
              onSelect={(k) => {
                const r = byKey.get(k)
                if (r?.agentKey) openAgent(r.agentKey)
              }}
            />
          </Panel>
          <Panel title="Credits by feature" help="Each billable event has a rate: classic answers 1, generative answers 2, agent actions 5 and tenant graph grounding 10 credits.">
            {m.features.length ? <Distribution label="Copilot Credits by feature" items={m.features} fmt={int} /> : <Empty>No credits.</Empty>}
          </Panel>
          <Panel title="Credits by environment">
            <BarList label="Copilot Credits by environment" items={m.envs} color={PALETTE[1]} fmt={int} limit={10} />
          </Panel>
          <Panel title="Tenant capacity" span={2} note={poolLane?.state === 'ok' ? undefined : 'From the licensing currency report.'}>
            {m.pool.length ? (
              <DataTable
                label="Tenant capacity"
                rows={rowsOf(m.pool, (p) => p.currency)}
                columns={[
                  text('name', 'Currency', (p: (typeof m.pool)[number]) => p.name, '26%'),
                  num('purchased', 'Purchased', (p: (typeof m.pool)[number]) => p.purchased),
                  num('allocated', 'Allocated', (p: (typeof m.pool)[number]) => p.allocated, { help: 'Assigned to environments or billing policies.' }),
                  num('consumed', 'Consumed', (p: (typeof m.pool)[number]) => p.consumed),
                  num('used', 'Used', (p: (typeof m.pool)[number]) => p.used, { fmt: pct, bar: COLOR.agent }),
                  text('updated', 'Updated', (p: (typeof m.pool)[number]) => (p.lastUpdated ? dateLabel(p.lastUpdated.slice(0, 10)) : '')),
                ]}
              />
            ) : (
              <Empty>The capacity report returned nothing.</Empty>
            )}
          </Panel>
          <Panel title="Credits per agent" span={3} note={m.totals.orphanedCredits ? `${int(m.totals.orphanedCredits)} credits belong to agents that are no longer in the inventory.` : undefined}>
            <DataTable
              label="Copilot Credits per agent"
              rows={rowsOf(m.rows, (r) => r.key)}
              search={(r) => `${r.name} ${r.envName} ${r.topFeature}`}
              initialSort={{ key: 'total', desc: true }}
              columns={[
                agentCol((r: AgentCreditRow) => ({ key: r.agentKey, name: r.name })),
                text('env', 'Environment', (r: AgentCreditRow) => r.envName),
                num('billed', 'Billed', (r: AgentCreditRow) => r.billed, { bar: COLOR.agent }),
                num('nonBilled', 'Non-billed', (r: AgentCreditRow) => r.nonBilled),
                num('total', 'Total', (r: AgentCreditRow) => r.total),
                num('share', 'Share', (r: AgentCreditRow) => div(r.total, m.totals.total), { fmt: pct }),
                text('feature', 'Main feature', (r: AgentCreditRow) => r.topFeature),
              ]}
            />
          </Panel>
          {m.use.rows.length > 0 && (
            <Panel
              title="Cost against use"
              span={3}
              note={`${int(m.use.perUser)} credits per active user and ${int(m.use.perSession)} per session over the same ${COST_WINDOW_DAYS} days, from the audit log. ${
                m.use.flagged ? `${int(m.use.flagged)} flagged as high cost with few users.` : 'No agent is flagged as high cost with few users.'
              }`}
              help="Flagged agents are in the top quarter for credits and were used by 2 or fewer people. Mostly autonomous agents are never flagged, because they run without users."
            >
              <DataTable
                label="Copilot Credits against audited use per agent"
                rows={rowsOf(m.use.rows, (r) => r.key)}
                search={(r) => `${r.name} ${r.envName}`}
                onRowClick={(r) => openAgent(r.agentKey)}
                initialSort={{ key: 'total', desc: true }}
                columns={[
                  agentCol((r: CostUseRow) => ({ key: r.agentKey, name: r.name })),
                  num('total', 'Credits', (r: CostUseRow) => r.total, { bar: COLOR.agent }),
                  num('users', 'Users', (r: CostUseRow) => r.users),
                  num('sessions', 'Sessions', (r: CostUseRow) => r.sessions),
                  num('perUser', 'Per user', (r: CostUseRow) => r.perUser),
                  num('perSession', 'Per session', (r: CostUseRow) => r.perSession),
                  num('autonomous', 'Autonomous runs', (r: CostUseRow) => r.autonomous),
                  {
                    key: 'flag',
                    label: 'Flag',
                    value: (r: CostUseRow) => (r.highCostLowUse ? 'High cost, few users' : ''),
                    render: (r: CostUseRow) => (r.highCostLowUse ? <b className="trend-down">High cost, few users</b> : '–'),
                  },
                ]}
              />
            </Panel>
          )}
        </Grid>
      )}
    </>
  )
}

export function AzureAiSpend() {
  const { ds } = useData()
  const lane = ds.lanes.find((l) => l.id === 'aicost')
  const problems = laneProblems(ds.lanes, ['aicost'])
  const unknown = unknownFrom(problems[0])
  const m = useMemo(() => {
    const { currency, mixed } = mainCurrency(ds.aiCostDaily)
    const window = costWindow(new Date(`${ds.asOf.slice(0, 10)}T00:00:00Z`))
    const resources = spendByResource(ds.aiCostDaily, ds.aiCostMeters, ds.aiResources, currency)
    const daily = dailySpend(ds.aiCostDaily, currency, window)
    const total = resources.reduce((s, r) => s + r.cost, 0)
    const last7 = daily.slice(-7).reduce((s, d) => s + d.values[0], 0)
    const prior7 = daily.slice(-14, -7).reduce((s, d) => s + d.values[0], 0)
    return {
      currency,
      mixed,
      fmt: money(currency),
      resources,
      daily,
      total,
      trend: prior7 ? last7 / prior7 - 1 : NaN,
      categories: toDistribution(categoryBars(resources)),
      meters: meterBars(ds.aiCostMeters, currency),
      top: resources.map((r) => ({ key: r.id, label: r.name, value: r.cost, hint: r.category })),
    }
  }, [ds.aiCostDaily, ds.aiCostMeters, ds.aiResources, ds.asOf])
  const unlisted = m.resources.filter((r) => !r.listed).length

  return (
    <>
      <p className="page-intro">
        Azure spend on AI resources in the last {COST_WINDOW_DAYS} days, from Cost Management, for the subscriptions that hold Azure AI resources. Costs are actual
        billed amounts in your billing currency and lag by about a day. Foundry project spend rolls up to its parent account. The agent slicers do not apply here.
      </p>
      <LaneNotice problems={problems} />
      {!problems.length && lane?.detail && lane.state !== 'sample' && <p className="notice">{lane.detail}</p>}
      {m.mixed && <p className="notice">Spend arrived in more than one currency. Only {m.currency} is shown.</p>}
      <KpiRow>
        <Kpi label={`AI spend (${COST_WINDOW_DAYS} days)`} value={m.fmt(m.total)} tone="agent" unknown={unknown} />
        <Kpi label="Average per day" value={m.fmt(div(m.total, m.daily.length))} unknown={unknown} />
        <Kpi
          label="Last 7 days"
          value={m.fmt(m.daily.slice(-7).reduce((s, d) => s + d.values[0], 0))}
          trend={m.trend}
          help="Change against the 7 days before."
          unknown={unknown}
        />
        <Kpi
          label="Resources with spend"
          value={int(m.resources.length)}
          sub={unlisted ? `${int(unlisted)} not in the Foundry listing` : undefined}
          unknown={unknown}
        />
        <Kpi
          label="Top resource share"
          value={pct(div(m.resources[0]?.cost ?? NaN, m.total))}
          help={m.resources[0] ? `${m.resources[0].name} (${m.resources[0].category})` : undefined}
          unknown={unknown}
        />
      </KpiRow>
      {m.resources.length === 0 ? (
        problems.length ? null : <Empty>No Azure AI spend was returned. {COST_ROLE}</Empty>
      ) : (
        <Grid cols={3}>
          <Panel title="Daily AI spend" span={2}>
            <LineChart label="Daily Azure AI spend" data={m.daily} series={[{ name: 'Spend', color: COLOR.agent, fmt: m.fmt }]} xFmt={dayLabel} area />
          </Panel>
          <Panel title="Spend by resource type">
            <Distribution label="Azure AI spend by resource type" items={m.categories} fmt={m.fmt} />
          </Panel>
          <Panel title="Top resources">
            <BarList label="Azure AI resources by spend" items={m.top} color={COLOR.agent} fmt={m.fmt} limit={10} />
          </Panel>
          <Panel title="Top meters" span={2} help="Cost Management meters, such as model input and output tokens, compute hours or pages read.">
            <BarList label="Azure AI spend by meter" items={m.meters} color={PALETTE[3]} fmt={m.fmt} limit={12} />
          </Panel>
          <Panel title="Spend by resource" span={3}>
            <DataTable
              label="Azure AI spend by resource"
              rows={rowsOf(m.resources, (r) => r.id)}
              search={(r) => `${r.name} ${r.category} ${r.resourceGroup} ${r.topMeter}`}
              initialSort={{ key: 'cost', desc: true }}
              columns={[
                text('name', 'Resource', (r: ResourceSpendRow) => r.name, '20%'),
                text('category', 'Type', (r: ResourceSpendRow) => r.category),
                text('rg', 'Resource group', (r: ResourceSpendRow) => r.resourceGroup),
                text('region', 'Region', (r: ResourceSpendRow) => r.region),
                num('cost', 'Spend', (r: ResourceSpendRow) => r.cost, { fmt: m.fmt, bar: COLOR.agent }),
                num('share', 'Share', (r: ResourceSpendRow) => div(r.cost, m.total), { fmt: pct }),
                text('meter', 'Main meter', (r: ResourceSpendRow) => r.topMeter, '22%'),
              ]}
            />
          </Panel>
        </Grid>
      )}
    </>
  )
}
