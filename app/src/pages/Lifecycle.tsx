import { Fragment, useMemo, useState } from 'react'
import { useData } from '../data/store'
import { APP_GROUPS, appGroup, type AppGroup } from '../metrics/chat'
import { STAGE_HELP, STAGES, stageMix, stageMoves, stagesByMonth, userDays, type Stage } from '../metrics/habits'
import { agentTrends, LIFECYCLE, LIFECYCLE_HELP, overallReturnRate, reviewAgents, VERDICT_HELP, VERDICTS, type AgentReview, type Verdict } from '../metrics/lifecycle'
import { div } from '../metrics/measures'
import { dayNum, lastDataDay } from '../metrics/periods'
import { BarList, ColumnChart, Distribution, GroupedBars } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { dateLabel, DASH, int, monthLabel, pct } from '../ui/format'
import { Empty, Grid, Kpi, KpiRow, Panel, Select } from '../ui/primitives'
import { LIFECYCLE_COLOR, RISK_COLOR, STAGE_COLOR, VERDICT_COLOR } from '../ui/theme'
import { agentCol, date, num, rowsOf, text } from './helpers'

const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }))
const signed = (n: number) => (Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}` : DASH)

function Rules<K extends string>({ order, help, color }: { order: readonly K[]; help: Record<K, string>; color: Record<string, string> }) {
  return (
    <dl className="kv">
      {order.map((k) => (
        <Fragment key={k}>
          <dt>
            <span className="swatch" style={{ background: color[k], display: 'inline-block' }} /> {k}
          </dt>
          <dd>{help[k]}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

export function HabitStages() {
  const { ds } = useData()
  const [group, setGroup] = useState<AppGroup | ''>('')
  const m = useMemo(() => {
    const all = ds.interactions
    const end = lastDataDay(all)
    const anchor = dayNum(end)
    const rows = group ? all.filter((i) => appGroup(i.appHost) === group) : all
    const days = userDays(rows)
    const mix = stageMix(days, anchor)
    const users = STAGES.reduce((n, s) => n + mix[s], 0)
    const byGroup = APP_GROUPS.filter((g) => g !== 'Other')
      .map((g) => {
        const gm = stageMix(userDays(all.filter((i) => appGroup(i.appHost) === g)), anchor)
        return { key: g, values: STAGES.map((s) => gm[s]) }
      })
      .filter((r) => r.values.some((v) => v > 0))
    return { end, mix, users, months: stagesByMonth(rows, days), moves: stageMoves(days, anchor - 28, anchor), byGroup }
  }, [ds.interactions, group])
  const share = (s: Stage) => pct(div(m.mix[s], m.users))

  return (
    <>
      <p className="page-intro">
        How many weeks people keep coming back to Copilot, in the style of ValueLens habit stages. Habit cohorts on Chat & Cowork measure how often people use
        Copilot in the weeks they are active; stages measure whether they keep returning. Agent filters don't apply here.
      </p>
      <div className="filters page-filters" role="group" aria-label="Product filter">
        <Select label="Product" value={group} onChange={(v) => setGroup(v as AppGroup | '')} options={options(APP_GROUPS)} allLabel="All products" />
      </div>
      {m.users === 0 ? (
        <Empty>No Copilot activity in the 90 days to the last audit day. The audit-log lane feeds this view; see Setup & coverage.</Empty>
      ) : (
        <>
          <KpiRow>
            <Kpi label="Habitual users" value={int(m.mix.Habitual)} tone="licensed" sub={`${share('Habitual')} of users`} help={STAGE_HELP.Habitual} />
            <Kpi label="Regular" value={int(m.mix.Regular)} sub={`${share('Regular')} of users`} help={STAGE_HELP.Regular} />
            <Kpi label="Trying or new" value={int(m.mix.Trying + m.mix.New)} sub={`${int(m.mix.New)} new in 2 weeks`} help={`${STAGE_HELP.Trying} ${STAGE_HELP.New}`} />
            <Kpi label="Lapsed" value={int(m.mix.Lapsed)} tone="unlicensed" sub={`${share('Lapsed')} of users`} help={STAGE_HELP.Lapsed} />
            <Kpi
              label="Moved up in 4 weeks"
              value={int(m.moves.up)}
              sub={
                <>
                  <b>{int(m.moves.down)}</b> moved down
                </>
              }
              help="Users whose stage rose (for example from Trying to Regular, or back from Lapsed) between 4 weeks ago and now, and those whose stage fell."
            />
          </KpiRow>
          <Grid cols={3}>
            <Panel title="Stages by month" span={2} note={`Each month is measured on its last day, the latest to ${dateLabel(m.end)}. Months start once 8 weeks of history exist.`}>
              {m.months.length ? (
                <ColumnChart
                  label="Users by habit stage by month"
                  data={m.months}
                  series={STAGES.map((s) => ({ name: s, color: STAGE_COLOR[s], fmt: int }))}
                  xFmt={monthLabel}
                  stacked
                />
              ) : (
                <Empty>Needs 8 weeks of audit history.</Empty>
              )}
            </Panel>
            <Panel title="Users by stage" note={`As of ${dateLabel(m.end)}.`}>
              <Distribution label="Users by habit stage" items={STAGES.map((s) => ({ label: s, value: m.mix[s], color: STAGE_COLOR[s] }))} fmt={int} />
            </Panel>
            <Panel title="Stages by product" span={2} note="A person can be habitual in one product and trying another.">
              <GroupedBars label="Users per habit stage by product" data={m.byGroup} series={STAGES.map((s) => ({ name: s, color: STAGE_COLOR[s], fmt: int }))} />
            </Panel>
            <Panel title="How stages work">
              <Rules order={STAGES} help={STAGE_HELP} color={STAGE_COLOR} />
            </Panel>
          </Grid>
        </>
      )}
    </>
  )
}

export function LifecycleReview() {
  const { ds, scope, openAgent } = useData()
  const [verdict, setVerdict] = useState<Verdict | ''>('')
  const m = useMemo(() => {
    const end = lastDataDay(ds.interactions)
    const trends = agentTrends(scope.interactions, end)
    const reviews = reviewAgents(scope.agents, trends)
    const inScope = [...trends].filter(([k]) => scope.keys.has(k)).map(([, t]) => t)
    const tally = <K extends string>(order: readonly K[], get: (r: AgentReview) => K) => {
      const n = new Map<K, number>()
      for (const r of reviews) n.set(get(r), (n.get(get(r)) ?? 0) + 1)
      return order.map((k) => ({ key: k, label: k, value: n.get(k) ?? 0 }))
    }
    return {
      end,
      reviews,
      stages: tally(LIFECYCLE, (r) => r.stage),
      verdicts: tally(VERDICTS, (r) => r.verdict),
      returnRate: overallReturnRate(inScope),
    }
  }, [ds.interactions, scope.interactions, scope.agents, scope.keys])
  const n = (k: string, list: { key: string; value: number }[]) => list.find((x) => x.key === k)?.value ?? 0
  const rows = verdict ? m.reviews.filter((r) => r.verdict === verdict) : m.reviews

  return (
    <>
      <p className="page-intro">
        Where each agent is in its life, and what to do about it. Trends compare distinct users in the 4 weeks to {m.end ? dateLabel(m.end) : 'the last audit day'} with
        the 4 weeks before. Rules are simple and visible, so treat a verdict as a prompt to look, not a decision.
      </p>
      <KpiRow>
        <Kpi label="Growing" value={int(n('Growing', m.stages))} tone="licensed" help={LIFECYCLE_HELP.Growing} />
        <Kpi label="Declining" value={int(n('Declining', m.stages))} help={LIFECYCLE_HELP.Declining} />
        <Kpi label="To promote" value={int(n('Promote', m.verdicts))} help={VERDICT_HELP.Promote} />
        <Kpi label="To review" value={int(n('Review', m.verdicts))} tone="unlicensed" help={VERDICT_HELP.Review} />
        <Kpi label="To retire" value={int(n('Retire', m.verdicts))} help={VERDICT_HELP.Retire} />
        <Kpi
          label="Return rate"
          value={pct(m.returnRate)}
          help="Of the people who used an agent in the last 8 weeks, the share who used that same agent in 2 or more different weeks. Counted per agent."
        />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Lifecycle stages">
          <Distribution label="Agents by lifecycle stage" items={m.stages.map((s) => ({ label: s.label, value: s.value, color: LIFECYCLE_COLOR[s.key] }))} fmt={int} />
        </Panel>
        <Panel title="Review verdicts" note="Select a verdict to filter the table.">
          <BarList
            label="Agents by review verdict"
            items={m.verdicts.map((v) => ({ ...v, color: VERDICT_COLOR[v.key] }))}
            color={VERDICT_COLOR.Keep}
            fmt={int}
            keepOrder
            selected={verdict}
            onSelect={(k) => setVerdict((cur) => (cur === k ? '' : (k as Verdict)))}
          />
        </Panel>
        <Panel title="How verdicts work" help="Checked in this order: Retire, Review, then Watch, Promote and Keep.">
          <Rules order={VERDICTS} help={VERDICT_HELP} color={VERDICT_COLOR} />
        </Panel>
        <Panel
          title="Agents to act on"
          span={3}
          actions={<Select label="Verdict" value={verdict} onChange={(v) => setVerdict(v as Verdict | '')} options={options(VERDICTS)} allLabel="All" />}
        >
          {rows.length ? (
            <DataTable
              label="Agents with lifecycle stage and review verdict"
              rows={rowsOf(rows, (r) => r.agent.key)}
              search={(r) => `${r.agent.name} ${r.agent.envName} ${r.agent.ownerName} ${r.reason}`}
              onRowClick={(r) => openAgent(r.agent.key)}
              initialSort={{ key: 'users', desc: true }}
              columns={[
                agentCol((r: AgentReview) => r.agent),
                {
                  key: 'verdict',
                  label: 'Verdict',
                  value: (r: AgentReview) => VERDICTS.indexOf(r.verdict),
                  render: (r: AgentReview) => <b style={{ color: VERDICT_COLOR[r.verdict] }}>{r.verdict}</b>,
                },
                text('reason', 'Why', (r: AgentReview) => r.reason, '20%'),
                text('stage', 'Stage', (r: AgentReview) => r.stage),
                num('users', 'Users (4 wks)', (r: AgentReview) => r.trend?.users ?? 0, { bar: LIFECYCLE_COLOR.Steady }),
                num('change', 'Change', (r: AgentReview) => (r.trend?.users ?? 0) - (r.trend?.prevUsers ?? 0), { fmt: signed, help: 'Users in the last 4 weeks minus users in the 4 weeks before.' }),
                num('return', 'Return rate', (r: AgentReview) => r.trend?.returnRate ?? NaN, { fmt: pct }),
                {
                  key: 'risk',
                  label: 'Risk',
                  value: (r: AgentReview) => r.agent.riskScore,
                  render: (r: AgentReview) => <span style={{ color: RISK_COLOR[r.agent.riskBand] }}>{r.agent.riskBand}</span>,
                },
                text('owner', 'Owner', (r: AgentReview) => r.agent.ownerName),
                date('last', 'Last activity', (r: AgentReview) => r.agent.lastActivityAt),
              ]}
            />
          ) : (
            <Empty>No agents with this verdict.</Empty>
          )}
        </Panel>
      </Grid>
    </>
  )
}
