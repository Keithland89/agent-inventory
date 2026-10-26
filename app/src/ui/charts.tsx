import { Fragment, useState, type ReactNode } from 'react'
import { squarify } from './treemap'
import { useWidth } from './useWidth'
import { compact, dec1, int, niceTicks, pct0, type Fmt } from './format'
import { Empty, Legend } from './primitives'

export interface Series {
  name: string
  color: string
  fmt?: Fmt
}
export interface Point {
  key: string
  values: number[]
}

const fin = (n: number) => (Number.isFinite(n) ? n : 0)

/** A bar with its top corners rounded and a square base on the axis. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  if (h <= 0 || w <= 0) return ''
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

/** Shows every nth axis label so labels never overlap; roughly one per `gap` pixels. */
const tickEvery = (count: number, width: number, gap: number) => Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / gap))))

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 4), width - 200)
  return (
    <div className="chart-tip" style={{ left, top: Math.max(y - 8, 0) }}>
      {children}
    </div>
  )
}

function YAxis({ ticks, y, w, fmt }: { ticks: number[]; y: (v: number) => number; w: number; fmt: Fmt }) {
  return (
    <g className="axis">
      {ticks.map((t) => (
        <g key={t} transform={`translate(0,${y(t)})`}>
          <line x1={44} x2={w - 8} className="grid-line" />
          <text x={38} dy="0.32em" textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

/** Line / area chart over an ordered x axis (weeks or months). */
export function LineChart(props: {
  data: Point[]
  series: Series[]
  xFmt: (k: string) => string
  /** Shorter label for the axis; the tooltip keeps `xFmt`. */
  tickFmt?: (k: string) => string
  height?: number
  area?: boolean
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const h = props.height ?? 220
  const { data, series } = props
  if (!data.length) return <Empty>No activity in this period.</Empty>
  const max = Math.max(...data.flatMap((d) => d.values.map(fin)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const L = 44
  const R = 12
  const T = 10
  const B = 26
  const x = (i: number) => (data.length === 1 ? (L + width - R) / 2 : L + (i * (width - L - R)) / (data.length - 1))
  const y = (v: number) => T + (1 - fin(v) / top) * (h - T - B)
  const every = tickEvery(data.length, width, 80)
  const tick = props.tickFmt ?? props.xFmt
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={h} role="img" aria-label={props.label}>
        <YAxis ticks={ticks} y={y} w={width} fmt={compact} />
        {series.map((s, si) => {
          const pts = data.map((d, i) => `${x(i)},${y(d.values[si])}`)
          return (
            <g key={s.name}>
              {props.area && (
                <path
                  d={`M${x(0)},${y(0)} L${pts.join(' L')} L${x(data.length - 1)},${y(0)} Z`}
                  fill={s.color}
                  opacity={0.12}
                />
              )}
              <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" />
              {data.map((d, i) => (
                <circle key={d.key} cx={x(i)} cy={y(d.values[si])} r={hover === i ? 4.5 : 2.5} fill={s.color} />
              ))}
            </g>
          )
        })}
        <g className="axis">
          {data.map((d, i) =>
            i % every === 0 ? (
              <text key={d.key} x={x(i)} y={h - 8} textAnchor="middle">
                {tick(d.key)}
              </text>
            ) : null,
          )}
        </g>
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={h - B} className="guide" />}
        <rect
          x={L}
          y={0}
          width={width - L - R}
          height={h - B}
          fill="transparent"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
            const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))
            setHover(Math.max(0, Math.min(data.length - 1, i)))
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <Tip x={x(hover)} y={20} width={width}>
          <strong>{props.xFmt(data[hover].key)}</strong>
          {series.map((s, si) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}: <b>{(s.fmt ?? dec1)(data[hover].values[si])}</b>
            </span>
          ))}
        </Tip>
      )}
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
    </div>
  )
}

/** Vertical columns per period, stacked or clustered. */
export function ColumnChart(props: {
  data: Point[]
  series: Series[]
  xFmt: (k: string) => string
  /** Shorter label for the axis; the tooltip keeps `xFmt`. */
  tickFmt?: (k: string) => string
  stacked?: boolean
  height?: number
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const h = props.height ?? 240
  const { data, series, stacked } = props
  if (!data.length) return <Empty>No activity in this period.</Empty>
  const max = Math.max(...data.map((d) => (stacked ? d.values.reduce((a, b) => a + fin(b), 0) : Math.max(...d.values.map(fin)))))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const L = 44
  const R = 8
  const T = 10
  const B = 26
  const band = (width - L - R) / data.length
  const gw = Math.min(band * 0.72, stacked ? 56 : 18 * series.length)
  const y = (v: number) => T + (1 - v / top) * (h - T - B)
  const every = tickEvery(data.length, width, 64)
  const tick = props.tickFmt ?? props.xFmt
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={h} role="img" aria-label={props.label}>
        <YAxis ticks={ticks} y={y} w={width} fmt={compact} />
        {data.map((d, i) => {
          const x0 = L + i * band + (band - gw) / 2
          let acc = 0
          const topSeg = d.values.reduce((last, v, si) => (fin(v) > 0 ? si : last), -1)
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + i * band} y={T} width={band} height={h - T - B} className={hover === i ? 'col-hover on' : 'col-hover'} />
              {d.values.map((v, si) => {
                const val = fin(v)
                if (stacked) {
                  const yTop = y(acc + val)
                  const hh = Math.max(0, y(acc) - yTop)
                  acc += val
                  return si === topSeg ? (
                    <path key={si} d={topRounded(x0, yTop, gw, hh, 3)} fill={series[si].color} />
                  ) : (
                    <rect key={si} x={x0} y={yTop} width={gw} height={hh} fill={series[si].color} />
                  )
                }
                const bw = gw / series.length
                return <path key={si} d={topRounded(x0 + si * bw, y(val), Math.max(1, bw - 2), y(0) - y(val), 3)} fill={series[si].color} />
              })}
              {i % every === 0 && (
                <text x={L + i * band + band / 2} y={h - 8} textAnchor="middle" className="axis-text">
                  {tick(d.key)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <Tip x={L + hover * band + band / 2} y={20} width={width}>
          <strong>{props.xFmt(data[hover].key)}</strong>
          {series.map((s, si) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}: <b>{(s.fmt ?? int)(data[hover].values[si])}</b>
            </span>
          ))}
        </Tip>
      )}
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
    </div>
  )
}

export interface BarItem {
  key: string
  label: string
  value: number
  hint?: string
  color?: string
}

/** Ranked horizontal bars. Replaces the PBI treemaps and single-measure org column charts. */
export function BarList(props: {
  items: BarItem[]
  color: string
  fmt?: Fmt
  limit?: number
  onSelect?: (key: string) => void
  selected?: string
  label: string
  keepOrder?: boolean
}) {
  const [all, setAll] = useState(false)
  const fmt = props.fmt ?? int
  const valid = props.items.filter((i) => Number.isFinite(i.value))
  const items = props.keepOrder ? valid : [...valid].sort((a, b) => b.value - a.value)
  if (!items.length) return <Empty>Nothing to show for these filters.</Empty>
  const limit = props.limit ?? 8
  const shown = all ? items : items.slice(0, limit)
  const max = Math.max(...items.map((i) => i.value)) || 1
  return (
    <div className="barlist" aria-label={props.label}>
      <ol>
        {shown.map((i) => {
          const inner = (
            <>
              <span className="bl-label" title={i.label}>
                {i.label}
                {i.hint && <small>{i.hint}</small>}
              </span>
              <span className="bl-track">
                <span className="bl-bar" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? props.color }} />
              </span>
              <span className="bl-value">{fmt(i.value)}</span>
            </>
          )
          return (
            <li key={i.key} className={props.selected === i.key ? 'sel' : ''}>
              {props.onSelect ? (
                <button type="button" onClick={() => props.onSelect!(i.key)} aria-pressed={props.selected === i.key}>
                  {inner}
                </button>
              ) : (
                <div>{inner}</div>
              )}
            </li>
          )
        })}
      </ol>
      {items.length > limit && (
        <button type="button" className="link-btn" onClick={() => setAll((a) => !a)}>
          {all ? 'Show top ' + limit : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

/** Horizontal grouped bars: one row per category with a bar per series. */
export function GroupedBars(props: { data: { key: string; values: number[] }[]; series: Series[]; label: string }) {
  if (!props.data.length) return <Empty>Nothing to show for these filters.</Empty>
  const max = Math.max(...props.data.flatMap((d) => d.values.map(fin))) || 1
  return (
    <div className="grouped" aria-label={props.label}>
      <ol>
        {props.data.map((d) => (
          <li key={d.key}>
            <span className="gb-label" title={d.key}>
              {d.key}
            </span>
            <span className="gb-bars">
              {d.values.map((v, si) => (
                <span key={si} className="gb-row">
                  <span className="gb-bar" style={{ width: `${(fin(v) / max) * 100}%`, background: props.series[si].color }} />
                  <span className="gb-val">{(props.series[si].fmt ?? int)(v)}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <Legend items={props.series.map((s) => ({ label: s.name, color: s.color }))} />
    </div>
  )
}

export interface ScatterPoint {
  key: string
  label: string
  x: number
  y: number
  size: number
}

/** Bubble scatter. Optional median cross-hair splits the plot into quadrants. */
export function Scatter(props: {
  points: ScatterPoint[]
  color: string
  xLabel: string
  yLabel: string
  sizeLabel: string
  xFmt?: Fmt
  yFmt?: Fmt
  quadrants?: { x: number; y: number; label: string }
  height?: number
  label: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const pts = props.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!pts.length) return <Empty>Nothing to plot for these filters.</Empty>
  const h = props.height ?? 260
  const L = 44
  const R = 16
  const T = 14
  const B = 40
  const xt = niceTicks(Math.max(...pts.map((p) => p.x)))
  const yt = niceTicks(Math.max(...pts.map((p) => p.y)))
  const xMax = xt[xt.length - 1]
  const yMax = yt[yt.length - 1]
  const sx = (v: number) => L + (v / xMax) * (width - L - R)
  const sy = (v: number) => T + (1 - v / yMax) * (h - T - B)
  const sMax = Math.max(...pts.map((p) => p.size)) || 1
  const r = (s: number) => 4 + Math.sqrt(s / sMax) * 14
  const xFmt = props.xFmt ?? dec1
  const yFmt = props.yFmt ?? dec1
  const hp = pts.find((p) => p.key === hover)
  // Label the biggest bubbles first and skip any label that would collide with one already placed.
  const labelled = new Set<string>()
  const boxes: { x1: number; x2: number; y1: number; y2: number }[] = []
  for (const p of [...pts].sort((a, b) => b.size - a.size)) {
    if (labelled.size >= 6) break
    const half = (p.label.length * 6.2) / 2 + 3
    const cy = sy(p.y) - r(p.size) - 8
    const box = { x1: sx(p.x) - half, x2: sx(p.x) + half, y1: cy - 8, y2: cy + 6 }
    if (box.x1 < 0 || box.x2 > width) continue
    if (boxes.some((b) => b.x1 < box.x2 && box.x1 < b.x2 && b.y1 < box.y2 && box.y1 < b.y2)) continue
    boxes.push(box)
    labelled.add(p.key)
  }
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={h} role="img" aria-label={props.label}>
        <YAxis ticks={yt} y={sy} w={width} fmt={compact} />
        <g className="axis">
          {xt.map((t) => (
            <text key={t} x={sx(t)} y={h - 22} textAnchor="middle">
              {compact(t)}
            </text>
          ))}
          <text x={(L + width - R) / 2} y={h - 4} textAnchor="middle" className="axis-title">
            {props.xLabel}
          </text>
        </g>
        {props.quadrants && (
          <g className="quadrant">
            <rect
              x={sx(props.quadrants.x)}
              y={T}
              width={Math.max(0, width - R - sx(props.quadrants.x))}
              height={Math.max(0, sy(props.quadrants.y) - T)}
            />
            <line x1={sx(props.quadrants.x)} x2={sx(props.quadrants.x)} y1={T} y2={h - B} />
            <line x1={L} x2={width - R} y1={sy(props.quadrants.y)} y2={sy(props.quadrants.y)} />
            <text x={width - R - 6} y={T + 14} textAnchor="end">
              {props.quadrants.label}
            </text>
          </g>
        )}
        {pts.map((p) => (
          <g key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={r(p.size)}
              fill={props.color}
              fillOpacity={hover === p.key ? 0.85 : 0.5}
              stroke={props.color}
              strokeWidth={1.25}
            />
            {labelled.has(p.key) && (
              <text x={sx(p.x)} y={sy(p.y) - r(p.size) - 4} textAnchor="middle" className="point-label">
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="axis-y-title">{props.yLabel}</p>
      {hp && (
        <Tip x={sx(hp.x)} y={sy(hp.y)} width={width}>
          <strong>{hp.label}</strong>
          <span>
            {props.xLabel}: <b>{xFmt(hp.x)}</b>
          </span>
          <span>
            {props.yLabel}: <b>{yFmt(hp.y)}</b>
          </span>
          <span>
            {props.sizeLabel}: <b>{int(hp.size)}</b>
          </span>
        </Tip>
      )}
    </div>
  )
}

/** A small trend line for a KPI card, scaled to its own range. */
export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const v = values.map(fin)
  if (v.length < 2) return null
  const W = 100
  const H = 30
  const max = Math.max(...v)
  const min = Math.min(0, ...v)
  const x = (i: number) => (i / (v.length - 1)) * W
  const y = (n: number) => H - 2 - ((n - min) / (max - min || 1)) * (H - 4)
  const pts = v.map((n, i) => `${x(i).toFixed(2)},${y(n).toFixed(2)}`)
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`M0,${H} L${pts.join(' L')} L${W},${H} Z`} fill={color} fillOpacity={0.1} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** 100% bar with a value legend. Replaces the PBI donuts. */
export function Distribution(props: { items: { label: string; value: number; color: string }[]; fmt?: Fmt; label: string }) {
  const total = props.items.reduce((a, b) => a + fin(b.value), 0)
  if (!total) return <Empty>No users in this period.</Empty>
  const fmt = props.fmt ?? int
  return (
    <div className="dist" aria-label={props.label}>
      <div className="dist-bar" role="img" aria-label={props.items.map((i) => `${i.label} ${Math.round((fin(i.value) / total) * 100)}%`).join(', ')}>
        {props.items.map((i) =>
          fin(i.value) > 0 ? (
            <span key={i.label} style={{ flexGrow: fin(i.value), background: i.color }} title={`${i.label}: ${fmt(i.value)}`} />
          ) : null,
        )}
      </div>
      <ul className="dist-legend">
        {props.items.map((i) => (
          <li key={i.label}>
            <span className="swatch" style={{ background: i.color }} />
            <span className="dl-label">{i.label}</span>
            <span className="dl-val">{fmt(i.value)}</span>
            <span className="dl-pct">{Math.round((fin(i.value) / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const OTHER = '#a3a7bd'
/** Share of a whole; tiny non-zero shares read "<1%" rather than a misleading "0%". */
const shareOf = (n: number) => (n > 0 && n < 0.005 ? '<1%' : pct0(n))
const sumOf = (items: { value: number }[]) => items.reduce((a, b) => a + fin(b.value), 0)

export interface Slice {
  label: string
  value: number
  color: string
}

/** Ring chart for parts of a whole: up to `limit` slices, the rest folded into "Other", the total in the centre. */
export function Donut(props: { items: Slice[]; fmt?: Fmt; label: string; limit?: number; unit?: string; keepOrder?: boolean; empty?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const fmt = props.fmt ?? int
  const limit = props.limit ?? 5
  const valid = props.items.filter((i) => fin(i.value) > 0)
  const sorted = props.keepOrder ? valid : [...valid].sort((a, b) => b.value - a.value)
  const items = sorted.length > limit + 1 ? [...sorted.slice(0, limit), { label: `Other (${sorted.length - limit})`, value: sumOf(sorted.slice(limit)), color: OTHER }] : sorted
  const total = sumOf(items)
  if (!total) return <Empty>{props.empty ?? 'Nothing to show for these filters.'}</Empty>
  const S = 150
  const r = 58
  const sw = 18
  const C = 2 * Math.PI * r
  const gap = items.length > 1 ? 2 : 0
  const lens = items.map((i) => (i.value / total) * C)
  const starts = lens.map((_, k) => lens.slice(0, k).reduce((a, b) => a + b, 0))
  const focus = hover === null ? null : items[hover]
  return (
    <div className="donut" aria-label={props.label}>
      <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label={items.map((i) => `${i.label} ${shareOf(i.value / total)}`).join(', ')}>
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={sw} />
        {items.map((i, k) => {
          const len = lens[k]
          return (
            <circle
              key={i.label}
              cx={S / 2}
              cy={S / 2}
              r={r}
              fill="none"
              stroke={i.color}
              strokeWidth={sw}
              strokeDasharray={`${Math.max(len - gap, 0.75)} ${C}`}
              strokeDashoffset={-starts[k]}
              transform={`rotate(-90 ${S / 2} ${S / 2})`}
              opacity={hover === null || hover === k ? 1 : 0.35}
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${i.label}: ${fmt(i.value)} (${shareOf(i.value / total)})`}</title>
            </circle>
          )
        })}
        <text x={S / 2} y={S / 2 - 2} textAnchor="middle" className="donut-value">
          {fmt(focus ? focus.value : total)}
        </text>
        <text x={S / 2} y={S / 2 + 16} textAnchor="middle" className="donut-caption">
          {focus ? shareOf(focus.value / total) : (props.unit ?? 'total')}
        </text>
      </svg>
      <ul className="dist-legend">
        {items.map((i, k) => (
          <li key={i.label} className={hover === k ? 'hot' : ''} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
            <span className="swatch" style={{ background: i.color }} />
            <span className="dl-label" title={i.label}>
              {i.label}
            </span>
            <span className="dl-val">{fmt(i.value)}</span>
            <span className="dl-pct">{shareOf(i.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const hh = (h: number) => String(h).padStart(2, '0')
/** At most four characters, so a count fits inside a heatmap cell. */
const cellNum = (n: number) => (n >= 9950 ? `${Math.round(n / 1000)}k` : n >= 1000 ? compact(n) : String(Math.round(n)))

/** Day-of-week by hour-of-day intensity grid. Shading uses a square-root scale so quieter hours stay visible next to a peak. */
export function Heatmap(props: { grid: number[][]; rows: readonly string[]; color: string; fmt?: Fmt; unit: string; label: string; zone?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const fmt = props.fmt ?? int
  // Counts go inside the cells once each cell is wide enough to hold four narrow characters.
  const showNums = (width - 30 - 24 * 3) / 24 >= 22
  let max = 0
  let peak = [0, 0]
  props.grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > max) {
        max = v
        peak = [d, h]
      }
    }),
  )
  if (!max) return <Empty>No activity in this period.</Empty>
  const zone = props.zone ? ` ${props.zone}` : ''
  const strength = (v: number) => Math.round(10 + 90 * Math.sqrt(v / max))
  const shade = (v: number) => (v > 0 ? `color-mix(in srgb, ${props.color} ${strength(v)}%, var(--surface))` : undefined)
  return (
    <div className={`heatmap${showNums ? ' hm-nums' : ''}`} ref={ref}>
      <div
        className="hm-grid"
        role="img"
        aria-label={`${props.label}. Busiest: ${props.rows[peak[0]]} ${hh(peak[1])}:00${zone}, ${fmt(max)} ${props.unit}.`}
      >
        {props.rows.map((day, d) => (
          <Fragment key={day}>
            <span className="hm-day">{day}</span>
            {props.grid[d].map((v, h) => (
              <span
                key={h}
                className={`hm-cell${v > 0 && strength(v) >= 60 ? ' hm-strong' : ''}`}
                style={{ background: shade(v) }}
                title={`${day} ${hh(h)}:00–${hh(h + 1)}:00${zone}: ${fmt(v)} ${props.unit}`}
              >
                {showNums && v > 0 ? cellNum(v) : null}
              </span>
            ))}
          </Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="hm-hour">
            {h % 6 === 0 ? hh(h) : ''}
          </span>
        ))}
      </div>
      <div className="hm-scale" aria-hidden="true">
        <span>Fewer</span>
        {[0.05, 0.25, 0.55, 1].map((s) => (
          <i key={s} style={{ background: shade(s * max) }} />
        ))}
        <span>More</span>
        <b>
          Peak {props.rows[peak[0]]} {hh(peak[1])}:00{zone}
        </b>
      </div>
    </div>
  )
}

/** Nested steps, each a subset of the one before, with the share of the first step. */
export function Funnel(props: { steps: { label: string; value: number; color: string; help?: string }[]; fmt?: Fmt; label: string }) {
  const fmt = props.fmt ?? int
  const first = fin(props.steps[0]?.value)
  if (!first) return <Empty>Nothing to show for these filters.</Empty>
  return (
    <ol className="funnel" aria-label={props.label}>
      {props.steps.map((s, i) => {
        const share = fin(s.value) / first
        const prev = i ? fin(props.steps[i - 1].value) : 0
        return (
          <li key={s.label} title={s.help}>
            <div className="fn-head">
              <span className="fn-label">{s.label}</span>
              <span className="fn-val">{fmt(s.value)}</span>
              <span className="fn-pct">{pct0(share)}</span>
            </div>
            <div className="fn-track">
              <span className="fn-bar" style={{ width: `${Math.max(share * 100, 1.5)}%`, background: s.color }} />
            </div>
            {i > 0 && prev > 0 && <span className="sr-only">{pct0(fin(s.value) / prev)} of the step before</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** Tiles sized by value, for many-part breakdowns where the few biggest matter. Shows `limit` tiles plus one for the rest. */
export function Treemap(props: { items: BarItem[]; color: string; fmt?: Fmt; label: string; limit?: number; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const fmt = props.fmt ?? int
  const limit = props.limit ?? 10
  const h = props.height ?? 220
  const sorted = props.items.filter((i) => fin(i.value) > 0).sort((a, b) => b.value - a.value)
  const grand = sumOf(sorted)
  // Slivers under 1.5% can't carry a label or a hover target, so they join the "more" tile.
  const shown = sorted.slice(0, limit).filter((t, i) => i < 3 || t.value / grand >= 0.015)
  const rest = sorted.slice(shown.length)
  const tiles: (BarItem & { other?: boolean })[] =
    rest.length > 1 ? [...shown, { key: '__other', label: `${rest.length} more`, value: sumOf(rest), other: true }] : sorted
  if (!tiles.length) return <Empty>Nothing to show for these filters.</Empty>
  const total = sumOf(tiles)
  const rects = squarify(
    tiles.map((t) => t.value),
    width,
    h,
  )
  return (
    <div className="treemap" ref={ref} style={{ height: h }}>
      <ul aria-label={props.label}>
        {tiles.map((t, i) => {
          const r = rects[i]
          // Either strong (white text) or light (ink text), never the mid band where neither reads well.
          const strength = t.other ? 18 : i < 3 ? 100 - i * 6 : Math.max(26, 62 - (i - 3) * 6)
          const big = r.w > 64 && r.h > 36
          return (
            <li
              key={t.key}
              className={strength >= 85 ? 'tm-strong' : ''}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: `color-mix(in srgb, ${t.color ?? props.color} ${strength}%, var(--surface))` }}
              title={`${t.label}${t.hint ? ` (${t.hint})` : ''}: ${fmt(t.value)}, ${shareOf(t.value / total)}`}
            >
              <span className={big ? 'tm-text' : 'sr-only'}>
                <span className="tm-label">{t.label}</span>
                <span className="tm-val">
                  {fmt(t.value)} · {shareOf(t.value / total)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Radial gauge over a 240° arc for one share of a fixed capacity, with an optional marker (such as allocated). */
export function Gauge(props: {
  value: number
  total: number
  label: string
  color: string
  fmt?: Fmt
  marker?: { value: number; label: string }
  warnAt?: number
  warnColor?: string
}) {
  const fmt = props.fmt ?? int
  const share = props.total > 0 ? fin(props.value) / props.total : NaN
  if (!Number.isFinite(share)) return <Empty>No capacity to measure against.</Empty>
  const W = 180
  const cx = 90
  const cy = 88
  const r = 70
  const sw = 14
  const A0 = 150
  const SWEEP = 240
  const pt = (deg: number, rr = r) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)]
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0)
    const [x1, y1] = pt(a1)
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
  }
  const clamp = (s: number) => Math.min(Math.max(s, 0), 1)
  const warn = share >= (props.warnAt ?? 0.8)
  const color = warn ? (props.warnColor ?? '#a8682b') : props.color
  const mk = props.marker && props.total > 0 ? A0 + SWEEP * clamp(props.marker.value / props.total) : null
  return (
    <figure className="gauge">
      <svg viewBox={`0 0 ${W} 136`} width={W} height={136} role="img" aria-label={`${props.label}: ${pct0(share)}, ${fmt(props.value)} of ${fmt(props.total)}`}>
        <path d={arc(A0, A0 + SWEEP)} fill="none" stroke="var(--line-2)" strokeWidth={sw} strokeLinecap="round" />
        {share > 0 && <path d={arc(A0, A0 + Math.max(SWEEP * clamp(share), 1))} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />}
        {mk !== null && (
          <line
            x1={pt(mk, r - sw / 2 - 3)[0]}
            y1={pt(mk, r - sw / 2 - 3)[1]}
            x2={pt(mk, r + sw / 2 + 3)[0]}
            y2={pt(mk, r + sw / 2 + 3)[1]}
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <title>{`${props.marker!.label}: ${fmt(props.marker!.value)}`}</title>
          </line>
        )}
        <text x={cx} y={cy + 6} textAnchor="middle" className="gauge-value">
          {pct0(share)}
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" className="gauge-caption">
          used
        </text>
      </svg>
      <figcaption>
        <b>{fmt(props.value)}</b> of {fmt(props.total)}
        {props.marker && (
          <span>
            <i aria-hidden="true" /> {props.marker.label} {fmt(props.marker.value)}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
