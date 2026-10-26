import { useMemo } from 'react'
import { RISK_FACTORS, type RiskFactorRow } from '../data/static'
import { useData } from '../data/store'
import type { Agent } from '../data/types'
import { A, R, RISK_ORDER, bars, div, groupBy } from '../metrics/measures'
import { BarList, Distribution } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { dec2, int, pct } from '../ui/format'
import { Grid, Kpi, KpiRow, Panel } from '../ui/primitives'
import { PALETTE, RISK_COLOR } from '../ui/theme'
import { StatList } from './common'
import { agentCol, num, rowsOf, text, toDistribution } from './helpers'

interface FactorRow {
  factor: string
  points: number
  agents: number
  total: number
  share: number
}

export function Governance() {
  const { scope, openAgent } = useData()
  const { agents, riskDetail } = scope
  const m = useMemo(() => {
    const total = riskDetail.length
    const factors: FactorRow[] = [...groupBy(riskDetail, (r) => r.factor)].map(([factor, rs]) => ({
      factor,
      points: rs[0].points,
      agents: R.agentsAffected(rs),
      total: R.points(rs),
      share: div(rs.length, total),
    }))
    return {
      factors,
      why: bars(riskDetail, (r) => r.factor),
      bands: bars(agents, (a) => a.riskBand),
      auth: bars(agents, (a) => a.authentication ?? '(Blank)'),
      risky: rowsOf(
        agents.filter((a) => a.riskScore > 0),
        (a) => a.key,
      ),
    }
  }, [agents, riskDetail])

  return (
    <>
      <p className="page-intro">Exposure posture: sharing, authentication, quarantine and the heuristic risk score.</p>
      <KpiRow>
        <Kpi label="High risk" value={int(A.high(agents))} tone="unlicensed" help="Risk score of 5 or more." />
        <Kpi label="Medium risk" value={int(A.medium(agents))} help="Risk score of 3 or 4." />
        <Kpi label="Avg risk score" value={dec2(A.avgRisk(agents))} />
        <Kpi label="No authentication" value={int(A.unauthenticated(agents))} help="Authentication is None or blank." />
        <Kpi label="Shared tenant-wide" value={int(A.tenantWide(agents))} />
        <Kpi label="Shared but unused" value={int(A.orphan(agents))} help="Shared with the whole tenant and never used." />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Risk bands">
          <Distribution label="Agents by risk band" items={toDistribution(m.bands, RISK_COLOR, RISK_ORDER)} fmt={int} />
        </Panel>
        <Panel title="Why agents are risky">
          <BarList label="Risk factor instances" items={m.why} color={RISK_COLOR.High} fmt={int} />
        </Panel>
        <StatList
          title="Exposure summary"
          items={[
            ['Web search enabled', int(A.webSearch(agents))],
            ['Agents calling agents', int(A.callingAgents(agents))],
            ['Quarantined', int(A.quarantined(agents))],
            ['No risk factors', int(A.noRiskFactors(agents))],
            ['Avg risk factors per agent', dec2(A.avgRiskFactors(agents))],
          ]}
        />
        <Panel title="Authentication modes">
          <BarList label="Agents by authentication mode" items={m.auth} color={PALETTE[1]} fmt={int} />
        </Panel>
        <Panel title="Risk factor breakdown" span={2}>
          <DataTable
            label="Risk factor breakdown"
            rows={rowsOf(m.factors, (r) => r.factor)}
            initialSort={{ key: 'total', desc: true }}
            columns={[
              text('factor', 'Risk factor', (r: FactorRow) => r.factor, '34%'),
              num('points', 'Points', (r: FactorRow) => r.points),
              num('agents', 'Agents affected', (r: FactorRow) => r.agents, { bar: RISK_COLOR.Medium }),
              num('total', 'Risk points', (r: FactorRow) => r.total),
              num('share', 'Share', (r: FactorRow) => r.share, { fmt: pct }),
            ]}
          />
        </Panel>
        <Panel title="Highest risk agents" span={2}>
          <DataTable
            label="Highest risk agents"
            rows={m.risky}
            search={(a: Agent) => `${a.name} ${a.envName} ${a.riskReasons}`}
            onRowClick={(a) => openAgent(a.key)}
            initialSort={{ key: 'score', desc: true }}
            columns={[
              agentCol((a: Agent) => ({ key: a.key, name: a.name })),
              text('creator', 'Created by', (a: Agent) => a.createdByName),
              text('env', 'Environment', (a: Agent) => a.envName),
              num('score', 'Score', (a: Agent) => a.riskScore, { bar: RISK_COLOR.High }),
              text('band', 'Band', (a: Agent) => a.riskBand),
              text('reasons', 'Reasons', (a: Agent) => a.riskReasons, '30%'),
            ]}
          />
        </Panel>
        <Panel title="Risk scoring model" help="A heuristic, not a Microsoft score. High is 5 points or more, Medium 3 or more.">
          <DataTable
            label="Risk scoring model"
            rows={rowsOf(RISK_FACTORS, (r) => r.factor)}
            initialSort={{ key: 'order' }}
            columns={[
              { key: 'order', label: 'Risk factor', value: (r) => r.sortOrder, render: (r) => r.factor },
              num('score', 'Points', (r: RiskFactorRow) => r.score),
            ]}
          />
        </Panel>
      </Grid>
    </>
  )
}
