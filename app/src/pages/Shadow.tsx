import { useMemo, useState } from 'react'
import { SHADOW_WATCHLIST, type WatchItem } from '../data/static'
import { useData } from '../data/store'
import type { ShadowDevice, ShadowSignal } from '../data/types'
import { laneProblem, unknownFrom } from '../metrics/coverage'
import { bars, distinct, sum } from '../metrics/measures'
import { BarList, Distribution } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { int } from '../ui/format'
import { Grid, Kpi, KpiRow, Panel, Select } from '../ui/primitives'
import { COLOR } from '../ui/theme'
import { LaneNotice } from './common'
import { date, num, rowsOf, text, toDistribution } from './helpers'

const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort().map((x) => ({ value: x, label: x }))

export function ShadowAI() {
  const { ds } = useData()
  const [layer, setLayer] = useState('')
  const [posture, setPosture] = useState('')
  const { signals, devices } = useMemo(() => {
    const keep = (r: { layer: string; posture: string }) => (!layer || r.layer === layer) && (!posture || r.posture === posture)
    return { signals: ds.shadowSignals.filter(keep), devices: ds.shadowDevices.filter(keep) }
  }, [ds.shadowSignals, ds.shadowDevices, layer, posture])
  const problem = laneProblem(ds.lanes.find((l) => l.id === 'shadow'))
  const unknown = unknownFrom(problem)
  const watched = distinct(SHADOW_WATCHLIST, (w) => w.appName)
  const found = distinct(
    signals.filter((s) => s.deviceCount > 0),
    (s) => s.appName,
  )
  const hasRows = ds.shadowSignals.length > 0

  return (
    <>
      {hasRows && (
        <div className="filters page-filters" role="group" aria-label="Page filters">
          <Select label="Layer" value={layer} onChange={setLayer} options={uniq(ds.shadowSignals.map((s) => s.layer))} allLabel="All" />
          <Select label="Posture" value={posture} onChange={setPosture} options={uniq(ds.shadowSignals.map((s) => s.posture))} allLabel="All" />
        </div>
      )}
      {problem ? (
        <LaneNotice problems={[problem]} />
      ) : (
        <p className="page-intro">
          {found === 0 ? `None of the ${watched} watched AI tools were found on managed devices.` : `${found} of ${watched} watched AI tools found on managed devices.`}
        </p>
      )}
      <KpiRow>
        <Kpi
          label="Unsanctioned found"
          value={int(
            distinct(
              signals.filter((s) => s.posture === 'Unsanctioned' && s.deviceCount > 0),
              (s) => s.appName,
            ),
          )}
          tone="unlicensed"
          unknown={unknown}
        />
        <Kpi label="Devices affected" value={int(distinct(devices, (d) => d.deviceName))} unknown={unknown} />
        <Kpi label="Users seen" value={int(distinct(devices, (d) => d.userUpn))} unknown={unknown} />
        <Kpi label="AI tools watched" value={int(watched)} />
      </KpiRow>
      <Grid cols={2}>
        {!unknown && (
          <>
            <Panel title="Devices per AI tool">
              <BarList label="Devices per AI tool" items={bars(signals, (s) => s.appName, (rs) => sum(rs, (s) => s.deviceCount)).filter((b) => b.value > 0)} color={COLOR.unlicensed} fmt={int} limit={12} />
            </Panel>
            <Panel title="Detections by category">
              <Distribution label="Detections by category" items={toDistribution(bars(devices, (d) => signals.find((s) => s.appName === d.appName)?.category ?? d.layer))} fmt={int} />
            </Panel>
            <Panel title="Which devices" span={2}>
              <DataTable
                label="Devices with watched AI tools"
                rows={rowsOf(devices, (d, i) => `${d.deviceName}:${d.appName}:${i}`)}
                search={(d) => `${d.deviceName} ${d.appName} ${d.userUpn}`}
                initialSort={{ key: 'seen', desc: true }}
                columns={[
                  text('device', 'Device', (d: ShadowDevice) => d.deviceName, '20%'),
                  text('app', 'AI tool', (d: ShadowDevice) => d.appName),
                  text('posture', 'Posture', (d: ShadowDevice) => d.posture),
                  text('layer', 'Layer', (d: ShadowDevice) => d.layer),
                  text('detected', 'Detected', (d: ShadowDevice) => d.detected),
                  text('user', 'User', (d: ShadowDevice) => d.userUpn),
                  date('seen', 'Last seen', (d: ShadowDevice) => d.lastSeen),
                ]}
              />
            </Panel>
            <Panel title="Every detection" span={2}>
              <DataTable
                label="Every detection"
                rows={rowsOf(signals, (s, i) => `${s.layer}:${s.appName}:${i}`)}
                search={(s) => `${s.appName} ${s.vendor} ${s.category}`}
                initialSort={{ key: 'devices', desc: true }}
                columns={[
                  text('app', 'AI tool', (s: ShadowSignal) => s.appName, '20%'),
                  text('vendor', 'Vendor', (s: ShadowSignal) => s.vendor),
                  text('category', 'Category', (s: ShadowSignal) => s.category),
                  text('posture', 'Posture', (s: ShadowSignal) => s.posture),
                  text('layer', 'Layer', (s: ShadowSignal) => s.layer),
                  num('devices', 'Devices', (s: ShadowSignal) => s.deviceCount, { bar: COLOR.unlicensed }),
                  date('seen', 'Last seen', (s: ShadowSignal) => s.lastSeen),
                ]}
              />
            </Panel>
          </>
        )}
        <Panel title="What was looked for" span={2}>
          <DataTable
            label="Shadow AI watchlist"
            rows={rowsOf(SHADOW_WATCHLIST, (w, i) => `${w.appName}:${i}`)}
            search={(w) => `${w.appName} ${w.vendor} ${w.category}`}
            initialSort={{ key: 'app' }}
            pageSize={10}
            columns={[
              text('app', 'AI tool', (w: WatchItem) => w.appName, '25%'),
              text('vendor', 'Vendor', (w: WatchItem) => w.vendor),
              text('category', 'Category', (w: WatchItem) => w.category),
              text('posture', 'Posture', (w: WatchItem) => w.posture),
            ]}
          />
        </Panel>
      </Grid>
    </>
  )
}
