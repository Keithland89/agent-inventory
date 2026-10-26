import { useMemo } from 'react'
import { useData } from '../data/store'
import type { AzureAIResource } from '../data/types'
import { laneProblems, unknownFrom } from '../metrics/coverage'
import { bars, distinct } from '../metrics/measures'
import { BarList, Distribution } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { int, regionLabel } from '../ui/format'
import { Empty, Grid, Kpi, KpiRow, Panel } from '../ui/primitives'
import { COLOR } from '../ui/theme'
import { LaneNotice } from './common'
import { rowsOf, text, toDistribution } from './helpers'

export function Foundry() {
  const { ds } = useData()
  const res = ds.aiResources
  const flows = ds.flows
  const problems = laneProblems(ds.lanes, ['foundry', 'flows'])
  const resUnknown = unknownFrom(problems.find((p) => p.lane.id === 'foundry'))
  const flowsUnknown = unknownFrom(problems.find((p) => p.lane.id === 'flows'))
  const m = useMemo(
    () => ({
      categories: toDistribution(bars(res, (r) => r.category)),
      skus: bars(res, (r) => r.sku),
      regions: bars(res, (r) => regionLabel(r.region)),
      flowStates: bars(flows, (f) => f.state),
      flowTypes: bars(flows, (f) => f.type),
    }),
    [res, flows],
  )

  return (
    <>
      <p className="page-intro">
        Azure AI resources and Foundry projects found through Azure Resource Manager, plus Power Platform agent flows. The agent slicers do not apply here.
      </p>
      <LaneNotice problems={problems} />
      <KpiRow>
        <Kpi label="Azure AI resources" value={int(res.length)} tone="agent" unknown={resUnknown} />
        <Kpi label="Foundry projects" value={int(res.filter((r) => r.isAgentHost).length)} help="Projects host Foundry agents." unknown={resUnknown} />
        <Kpi label="Resource groups" value={int(distinct(res, (r) => `${r.subscriptionId}/${r.resourceGroup}`))} unknown={resUnknown} />
        <Kpi label="Regions" value={int(distinct(res, (r) => r.region))} unknown={resUnknown} />
        <Kpi
          label="Public network open"
          value={int(res.filter((r) => r.publicAccess === 'Enabled').length)}
          tone="unlicensed"
          help="Public network access is enabled. Live listings may omit this property, in which case the resource is not counted."
          unknown={resUnknown}
        />
        <Kpi label="Agent flows" value={int(flows.length)} unknown={flowsUnknown} />
      </KpiRow>
      {res.length === 0 && flows.length === 0 ? (
        problems.length ? null : <Empty>No Azure AI resources or agent flows were returned. Foundry needs Reader on the subscriptions; see Setup & coverage.</Empty>
      ) : (
        <Grid cols={3}>
          <Panel title="Resource categories">
            {res.length ? <Distribution label="Azure AI resources by category" items={m.categories} fmt={int} /> : <Empty>No Azure AI resources.</Empty>}
          </Panel>
          <Panel title="SKUs">
            <BarList label="Azure AI resources by SKU" items={m.skus} color={COLOR.agent} fmt={int} limit={10} />
          </Panel>
          <Panel title="Regions">
            <BarList label="Azure AI resources by region" items={m.regions} color={COLOR.licensed} fmt={int} limit={10} />
          </Panel>
          <Panel title="Agent flows by state">
            <BarList label="Agent flows by state" items={m.flowStates} color={COLOR.licensed} fmt={int} />
          </Panel>
          <Panel title="Agent flows by type">
            <BarList label="Agent flows by type" items={m.flowTypes} color={COLOR.licensed} fmt={int} />
          </Panel>
          <Panel title="Azure AI estate" span={3}>
            <DataTable
              label="Azure AI estate"
              rows={rowsOf(res, (r) => r.id)}
              search={(r) => `${r.name} ${r.parentAccount} ${r.resourceGroup} ${r.region}`}
              initialSort={{ key: 'name' }}
              columns={[
                text('name', 'Name', (r: AzureAIResource) => r.name, '20%'),
                text('category', 'Category', (r: AzureAIResource) => r.category),
                text('kind', 'Kind', (r: AzureAIResource) => r.kind),
                text('parent', 'Parent account', (r: AzureAIResource) => r.parentAccount),
                text('region', 'Region', (r: AzureAIResource) => regionLabel(r.region)),
                text('rg', 'Resource group', (r: AzureAIResource) => r.resourceGroup),
                text('sku', 'SKU', (r: AzureAIResource) => r.sku),
                text('public', 'Public access', (r: AzureAIResource) => r.publicAccess),
              ]}
            />
          </Panel>
        </Grid>
      )}
    </>
  )
}
