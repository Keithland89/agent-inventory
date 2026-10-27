import { useMemo } from 'react'
import { useData } from '../data/store'
import type { Agent, KnowledgeSource } from '../data/types'
import { A, C, EXTERNAL_TYPES, K, N, bars, distinct, div, freshness, groupBy, sum } from '../metrics/measures'
import { BarList, ColumnChart } from '../ui/charts'
import { DataTable, type Column } from '../ui/DataTable'
import { connectorLabel, int, pct } from '../ui/format'
import { Empty, Grid, Kpi, KpiRow, Panel, Stack } from '../ui/primitives'
import { COLOR } from '../ui/theme'
import { StatList } from './common'
import { agentCol, bool, num, rowsOf, text } from './helpers'
import { PageIntro } from '../ui/PageFilters'

const nameOf = (a: Agent) => ({ key: a.key, name: a.name })

interface PivotRow {
  key: string
  total: number
  cells: Record<string, number>
}

/** A matrix of counts, rows by `row`, columns by `col`, the way the report's pivot tables lay them out. */
function pivot<T>(items: T[], row: (r: T) => string, col: (r: T) => string, measure: (rs: T[]) => number) {
  const cols = [...new Set(items.map(col))].filter(Boolean).sort()
  const rows: PivotRow[] = [...groupBy(items, (r) => row(r) || '(Blank)')].map(([key, rs]) => {
    const by = groupBy(rs, col)
    return { key, total: measure(rs), cells: Object.fromEntries(cols.map((c) => [c, measure(by.get(c) ?? [])])) }
  })
  const columns: Column<PivotRow>[] = [
    text('key', '', (r: PivotRow) => r.key, '30%'),
    ...cols.map((c) => num(`c:${c}`, c, (r: PivotRow) => r.cells[c] ?? 0)),
    num('total', 'Total', (r: PivotRow) => r.total, { bar: COLOR.agent }),
  ]
  return { rows: rowsOf(rows, (r) => r.key), columns }
}

interface ConnectorRow {
  key: string
  label: string
  links: number
}

export function Tools() {
  const { scope, openAgent } = useData()
  const { agents, connectors } = scope
  const m = useMemo(() => {
    const channels = new Map<string, number>()
    for (const a of agents)
      for (const c of (a.channels || '(None)').split(/[,;]\s*/)) {
        const k = c.trim() || '(None)'
        channels.set(k, (channels.get(k) ?? 0) + 1)
      }
    const mcp = [...groupBy(connectors, (c) => (c.isMcp ? 'MCP servers' : 'Other connectors'))].map(([key, rs]) => ({
      id: key,
      data: { key, label: key, links: rs.length } as ConnectorRow,
      children: bars(rs, (c) => connectorLabel(c.connectorId)).map((b) => ({ id: `${key}:${b.key}`, data: { key: b.key, label: b.label, links: b.value } })),
    }))
    return {
      channels: [...channels].map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value),
      top: bars(connectors, (c) => connectorLabel(c.connectorId)),
      mcp,
      surface: rowsOf(
        agents.filter((a) => a.toolCount + a.connectorCount + a.knowledgeCount + a.connectedAgentCount > 0),
        (a) => a.key,
      ),
    }
  }, [agents, connectors])

  return (
    <>
      <PageIntro>Connectors, Model Context Protocol servers, channels and multi-agent connections. Knowledge & grounding shows what agents read.</PageIntro>
      <KpiRow>
        <Kpi label="Connector links" value={int(C.links(connectors))} tone="agent" />
        <Kpi label="Distinct connectors" value={int(C.distinct(connectors))} />
        <Kpi label="MCP-enabled agents" value={int(C.mcpAgents(connectors))} />
        <Kpi label="MCP server tools" value={int(C.mcpLinks(connectors))} />
        <Kpi label="Agents with tools" value={int(A.withTools(agents))} />
        <Kpi label="Agents with knowledge" value={int(A.withKnowledge(agents))} />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Most used connectors">
          <BarList label="Connector links by connector" items={m.top} color={COLOR.agent} fmt={int} limit={8} />
        </Panel>
        <Panel title="Channels">
          <BarList label="Agents by channel" items={m.channels} color={COLOR.licensed} fmt={int} limit={8} />
        </Panel>
        <Stack>
          <StatList
            title="Component footprint"
            items={[
              ['Topics', int(A.topics(agents))],
              ['Tools', int(A.tools(agents))],
              ['Knowledge sources', int(A.knowledge(agents))],
              ['Connector links', int(C.links(connectors))],
              ['Multi-agent links', int(A.multiAgentLinks(agents))],
            ]}
          />
          <Panel title="MCP server usage">
            {m.mcp.length ? (
              <DataTable
                label="Connector links by MCP status"
                rows={m.mcp}
                childNoun="connectors"
                initialSort={{ key: 'links', desc: true }}
                columns={[text('label', 'Connector', (r: ConnectorRow) => r.label, '60%'), num('links', 'Links', (r: ConnectorRow) => r.links, { bar: COLOR.agent })]}
              />
            ) : (
              <Empty>No connector links in view.</Empty>
            )}
          </Panel>
        </Stack>
        <Panel title="Agents with the largest tool surface" span={3}>
          <DataTable
            label="Agents with the largest tool surface"
            rows={m.surface}
            search={(a) => `${a.name} ${a.envName}`}
            onRowClick={(a) => openAgent(a.key)}
            initialSort={{ key: 'tools', desc: true }}
            columns={[
              agentCol(nameOf),
              text('env', 'Environment', (a: Agent) => a.envName),
              num('tools', 'Tools', (a: Agent) => a.toolCount, { bar: COLOR.agent }),
              num('conn', 'Connectors', (a: Agent) => a.connectorCount),
              num('knowledge', 'Knowledge', (a: Agent) => a.knowledgeCount),
              num('agents', 'Connected agents', (a: Agent) => a.connectedAgentCount),
            ]}
          />
        </Panel>
      </Grid>
    </>
  )
}

interface TypeRow {
  type: string
  grounded: number
  sources: number
}

export function KnowledgeGrounding() {
  const { scope, agentByKey, openAgent } = useData()
  const { agents, knowledge } = scope
  const m = useMemo(() => {
    const groundedKeys = new Set(knowledge.map((k) => k.agentKey))
    const perAgent = new Map<string, number>()
    for (const k of knowledge) perAgent.set(k.agentKey, (perAgent.get(k.agentKey) ?? 0) + k.count)
    const platform = [...groupBy(agents, (a) => a.platform)].map(([key, rs]) => {
      const g = rs.filter((a) => groundedKeys.has(a.key)).length
      return { key, values: [g, rs.length - g] }
    })
    const types: TypeRow[] = [...groupBy(knowledge, (k) => k.type)].map(([type, rs]) => ({ type, grounded: K.grounded(rs), sources: K.sources(rs) }))
    return {
      perAgent,
      platform,
      types,
      byType: bars(knowledge, (k) => k.type, K.sources),
      outside: bars(
        knowledge.filter((k) => EXTERNAL_TYPES.has(k.type)),
        (k) => agentByKey.get(k.agentKey)?.envName ?? '',
      ),
      pivot: pivot(
        knowledge,
        (k) => k.type,
        (k) => agentByKey.get(k.agentKey)?.platform ?? '',
        (rs) => rs.length,
      ),
      heavy: rowsOf(
        agents.filter((a) => a.knowledgeCount > 0 || perAgent.has(a.key)),
        (a) => a.key,
      ),
    }
  }, [agents, knowledge, agentByKey])
  const grounded = K.grounded(knowledge)

  return (
    <>
      <PageIntro>What every agent is connected to: the only integration surface Agent Builder agents expose.</PageIntro>
      <KpiRow>
        <Kpi label="Knowledge sources" value={int(K.sources(knowledge))} tone="agent" />
        <Kpi label="Grounded agents" value={int(grounded)} tone="licensed" />
        <Kpi label="Ungrounded agents" value={int(agents.length - grounded)} />
        <Kpi label="Reads tenant data" value={int(K.tenant(knowledge))} help="Bindings to SharePoint, Dataverse, Graph connectors, Teams messages or uploaded files." />
        <Kpi label="Reaches outside tenant" value={int(K.external(knowledge))} tone="unlicensed" help="Bindings to public websites, web search or Bing custom search." />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Knowledge sources by type">
          <BarList label="Knowledge sources by type" items={m.byType} color={COLOR.agent} fmt={int} />
        </Panel>
        <Panel title="Grounded vs ungrounded">
          <ColumnChart
            label="Grounded and ungrounded agents by platform"
            data={m.platform}
            series={[
              { name: 'Grounded', color: COLOR.licensed, fmt: int },
              { name: 'Ungrounded', color: '#b8c1cc', fmt: int },
            ]}
            xFmt={(k) => k}
          />
        </Panel>
        <Panel title="Reaching outside the tenant">
          <BarList label="External knowledge bindings by environment" items={m.outside} color={COLOR.unlicensed} fmt={int} limit={10} />
        </Panel>
        <Panel title="Source types by platform" span={2}>
          <DataTable label="Knowledge bindings by type and platform" rows={m.pivot.rows} columns={m.pivot.columns} initialSort={{ key: 'total', desc: true }} />
        </Panel>
        <Panel title="Grounding by source type">
          <DataTable
            label="Grounding by source type"
            rows={rowsOf(m.types, (r) => r.type)}
            initialSort={{ key: 'grounded', desc: true }}
            columns={[
              text('type', 'Type', (r: TypeRow) => r.type),
              num('grounded', 'Agents', (r: TypeRow) => r.grounded, { bar: COLOR.licensed }),
              num('sources', 'Sources', (r: TypeRow) => r.sources),
            ]}
          />
        </Panel>
        <Panel title="Most heavily grounded agents" span={3}>
          <DataTable
            label="Most heavily grounded agents"
            rows={m.heavy}
            search={(a) => `${a.name} ${a.envName}`}
            onRowClick={(a) => openAgent(a.key)}
            initialSort={{ key: 'sources', desc: true }}
            columns={[
              agentCol(nameOf),
              text('platform', 'Platform', (a: Agent) => a.platform),
              text('env', 'Environment', (a: Agent) => a.envName),
              num('knowledge', 'Knowledge count', (a: Agent) => a.knowledgeCount),
              num('sources', 'Knowledge sources', (a: Agent) => m.perAgent.get(a.key) ?? 0, { bar: COLOR.agent }),
              bool('web', 'Web search', (a: Agent) => a.webSearch),
            ]}
          />
        </Panel>
      </Grid>
    </>
  )
}

interface LocatorRow {
  locator: string
  agents: number
  named: number
}

export function KnowledgeSources() {
  const { ds, scope, agentByKey } = useData()
  const { sources, knowledge } = scope
  const m = useMemo(() => {
    const envOf = (s: KnowledgeSource) => agentByKey.get(s.agentKey)?.envName ?? s.envName
    const locators: LocatorRow[] = [...groupBy(sources, (s) => s.locator || '(Blank)')].map(([locator, rs]) => ({ locator, agents: N.agents(rs), named: rs.length }))
    return {
      byType: bars(sources, (s) => s.knowledgeType),
      hosts: bars(sources, (s) => s.locatorHost),
      outside: bars(
        sources.filter((s) => s.isExternal),
        envOf,
      ),
      pivot: pivot(
        sources,
        (s) => s.knowledgeType,
        (s) => agentByKey.get(s.agentKey)?.platform ?? '',
        (rs) => rs.length,
      ),
      locators,
      fresh: freshness(
        sources.map((s) => s.collectedAt),
        ds.asOf,
      ),
    }
  }, [sources, agentByKey, ds.asOf])

  if (!ds.sources.length)
    return (
      <Empty>
        No named knowledge sources were collected. The knowledge sweep writes this table into the landing environment; see Setup & coverage for its status.
      </Empty>
    )

  return (
    <>
      <KpiRow>
        <Kpi label="Named sources" value={int(N.named(sources))} tone="agent" />
        <Kpi label="Distinct hosts" value={int(N.hosts(sources))} />
        <Kpi label="Reads outside tenant" value={int(N.external(sources))} tone="unlicensed" />
        <Kpi label="Agents reaching out" value={int(N.agentsOutside(sources))} />
        <Kpi label="Sources collected" value={m.fresh} help="When the knowledge sweep last ran. Older than 7 days is flagged as stale." />
        <Kpi label="Coverage of ARG counts" value={pct(div(N.named(sources), K.sources(knowledge)))} help="Named sources found, out of the knowledge counts Power Platform reports." />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Named sources by type">
          <BarList label="Named sources by type" items={m.byType} color={COLOR.agent} fmt={int} />
        </Panel>
        <Panel title="Hosts grounded in">
          <BarList label="Named sources by host" items={m.hosts} color={COLOR.licensed} fmt={int} limit={10} />
        </Panel>
        <Panel title="Reaching outside the tenant">
          <BarList label="External named sources by environment" items={m.outside} color={COLOR.unlicensed} fmt={int} limit={10} />
        </Panel>
        <Panel title="Named sources by type and platform" span={2}>
          <DataTable label="Named sources by type and platform" rows={m.pivot.rows} columns={m.pivot.columns} initialSort={{ key: 'total', desc: true }} />
        </Panel>
        <Panel title="Most widely shared sources">
          <DataTable
            label="Most widely shared sources"
            rows={rowsOf(m.locators, (r) => r.locator)}
            pageSize={6}
            search={(r) => r.locator}
            initialSort={{ key: 'agents', desc: true }}
            columns={[
              text('locator', 'Locator', (r: LocatorRow) => r.locator, '60%'),
              num('agents', 'Agents', (r: LocatorRow) => r.agents, { bar: COLOR.agent }),
              num('named', 'Sources', (r: LocatorRow) => r.named),
            ]}
          />
        </Panel>
        <Panel title="Every named knowledge source" span={3}>
          <DataTable
            label="Every named knowledge source"
            rows={rowsOf(sources, (s, i) => `${s.agentKey}:${s.sourceId}:${i}`)}
            search={(s) => `${s.agentName} ${s.sourceName} ${s.locator}`}
            initialSort={{ key: 'agent' }}
            columns={[
              agentCol((s: KnowledgeSource) => ({ key: s.agentKey, name: s.agentName })),
              text('env', 'Environment', (s: KnowledgeSource) => s.envName),
              text('type', 'Type', (s: KnowledgeSource) => s.knowledgeType),
              text('name', 'Source', (s: KnowledgeSource) => s.sourceName),
              text('locator', 'Locator', (s: KnowledgeSource) => s.locator, '30%'),
            ]}
          />
        </Panel>
      </Grid>
      <p className="foot-note">{int(distinct(sources, (s) => s.agentKey))} agents have named sources; {int(sum(knowledge, (k) => k.count))} sources are counted by Power Platform.</p>
    </>
  )
}
