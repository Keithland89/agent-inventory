import { useId, useState, type ReactNode } from 'react'
import type { Change } from '../metrics/periods'
import { DASH, int, signedPct, type Fmt } from './format'

export function InfoTip({ text, label }: { text?: string; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!text) return null
  return (
    <span className="info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="info-btn"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        i
      </button>
      {open && (
        <span role="tooltip" id={id} className="info-pop">
          {text}
        </span>
      )}
    </span>
  )
}

export function Panel(props: {
  title: string
  note?: string
  help?: string
  actions?: ReactNode
  children: ReactNode
  span?: 1 | 2 | 3
  className?: string
  id?: string
}) {
  return (
    <section id={props.id} className={`panel span-${props.span ?? 1} ${props.className ?? ''}`} aria-label={props.title}>
      <header className="panel-head">
        <div>
          <h3>
            {props.title}
            <InfoTip text={props.help} label={props.title} />
          </h3>
          {props.note && <p className="panel-note">{props.note}</p>}
        </div>
        {props.actions}
      </header>
      <div className="panel-body">{props.children}</div>
    </section>
  )
}

/** Short panels stacked in one grid cell, so they sit beside a tall neighbour instead of stretching to match it. */
export function Stack({ children, span }: { children: ReactNode; span?: 1 | 2 | 3 }) {
  return <div className={`stack span-${span ?? 1}`}>{children}</div>
}

export interface KpiProps {
  label: string
  value: string
  sub?: ReactNode
  help?: string
  tone?: 'licensed' | 'unlicensed' | 'agent' | 'neutral'
  trend?: number
  wide?: boolean
  /** The number cannot be known because its data lane did not load. Shows a dash and this reason instead of a misleading zero. */
  unknown?: string
  /** A change pill beside the value, such as a DeltaPill. */
  delta?: ReactNode
  /** Draws a share meter under the value. */
  progress?: { value: number; total: number }
  /** Makes the whole card a link to the list behind the number. */
  href?: string
  /** A trend drawn along the foot of the card, such as a Sparkline. */
  spark?: ReactNode
}

export function Kpi({ label, value, sub, help, tone = 'neutral', trend, wide, unknown, delta, progress, href, spark }: KpiProps) {
  const dir = trend === undefined || !Number.isFinite(trend) ? '' : trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'
  const shown = unknown ? DASH : value
  const cls = `kpi-value ${dir && !unknown ? `trend-${dir}` : ''} ${shown.length > 18 ? 'kpi-value-text' : ''}`
  const share = progress && progress.total > 0 ? Math.min(1, Math.max(0, progress.value / progress.total)) : undefined
  return (
    <div className={`kpi tone-${tone} ${wide ? 'kpi-wide' : ''} ${unknown ? 'kpi-unknown' : ''} ${href && !unknown ? 'kpi-link' : ''}`}>
      <div className="kpi-label">
        <span>{label}</span>
        <InfoTip text={help} label={label} />
      </div>
      <div className="kpi-figure">
        {href && !unknown ? (
          <a className={cls} href={href} aria-label={`${value} ${label}: show the list`}>
            {shown}
          </a>
        ) : (
          <div className={cls}>{shown}</div>
        )}
        {!unknown && delta}
      </div>
      {share !== undefined && !unknown && (
        <div className="kpi-meter" aria-hidden="true">
          <span style={{ width: `${share * 100}%` }} />
        </div>
      )}
      {unknown ? <div className="kpi-sub kpi-reason">{unknown}</div> : sub && <div className="kpi-sub">{sub}</div>}
      {spark && !unknown && <div className="kpi-spark">{spark}</div>}
    </div>
  )
}

export const KpiRow = ({ children }: { children: ReactNode }) => <div className="kpi-row">{children}</div>

/** A compact change pill for a KPI, such as ▲ 12%. The label is read out to screen readers and shown in the tooltip. */
export function DeltaPill({ change, label = 'vs previous 7 days', upIsGood = true, fmt = int }: { change: Change; label?: string; upIsGood?: boolean; fmt?: Fmt }) {
  const d = change.delta
  const tone = d === 0 ? 'flat' : d > 0 === upIsGood ? 'good' : 'bad'
  const value = Number.isFinite(change.ratio) ? signedPct(change.ratio) : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d))}`
  return (
    <span className={`delta-pill delta-${tone}`} title={`Last 7 days ${fmt(change.current)}, the 7 days before ${fmt(change.previous)}`}>
      <span aria-hidden="true">{d > 0 ? '▲' : d < 0 ? '▼' : '='}</span>
      {value}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

/** Change against the previous period, for a KPI's sub-line. Shows a count when the previous period was zero. */
export function Delta({ change, label = 'vs previous 7 days', upIsGood = true, fmt = int }: { change: Change; label?: string; upIsGood?: boolean; fmt?: Fmt }) {
  const d = change.delta
  const tone = d === 0 ? '' : d > 0 === upIsGood ? 'trend-up' : 'trend-down'
  const value = Number.isFinite(change.ratio) ? signedPct(change.ratio) : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d))}`
  return (
    <span title={`Last 7 days ${fmt(change.current)}, the 7 days before ${fmt(change.previous)}`}>
      <b className={tone}>
        <span aria-hidden="true">{d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}</span>
        {value}
      </b>{' '}
      {label}
    </span>
  )
}
export const Grid = ({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) => (
  <div className={`grid grid-${cols}`}>{children}</div>
)

export function Segmented<T extends string>(props: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="tablist" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={props.value === o.id}
          className={props.value === o.id ? 'on' : ''}
          onClick={() => props.onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select(props: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  const id = useId()
  return (
    <label className={`field ${props.value ? 'field-set' : ''}`} htmlFor={id}>
      <span>{props.label}</span>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.allLabel !== undefined && <option value="">{props.allLabel}</option>}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className="swatch" style={{ background: i.color }} />
          {i.label}
          {i.value && <b>{i.value}</b>}
        </li>
      ))}
    </ul>
  )
}
