import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { DASH, type Fmt } from './format'
import { Empty } from './primitives'

export interface Column<T> {
  key: string
  label: string
  value: (row: T) => number | string
  fmt?: Fmt
  render?: (row: T) => ReactNode
  align?: 'left' | 'right'
  /** Shows a proportional bar behind numeric cells. */
  bar?: string
  width?: string
  help?: string
  /** Keeps short values such as dates and verdicts whole instead of truncating them. */
  nowrap?: boolean
  /** Keeps the column even when every row is blank or zero. */
  keep?: boolean
}

export interface TableRow<T> {
  id: string
  data: T
  children?: TableRow<T>[]
}

/** Blank, a dash, zero or not a number: nothing worth a column. */
function blank(v: number | string) {
  return typeof v === 'number' ? !Number.isFinite(v) || v === 0 : !v.trim() || v === DASH || v === '-' || v === '–'
}

function cmp(a: number | string, b: number | string) {
  if (typeof a === 'number' && typeof b === 'number') {
    const an = Number.isFinite(a) ? a : -Infinity
    const bn = Number.isFinite(b) ? b : -Infinity
    return an - bn
  }
  return String(a).localeCompare(String(b))
}

export function DataTable<T>(props: {
  columns: Column<T>[]
  rows: TableRow<T>[]
  initialSort?: { key: string; desc?: boolean }
  onRowClick?: (row: T) => void
  pageSize?: number
  label: string
  search?: (row: T) => string
  childNoun?: string
  /** What to say when the table has no rows at all, before any search. */
  empty?: ReactNode
  /** Width below which the table scrolls sideways; defaults to 110px a column, at least 640px. */
  minWidth?: number
}) {
  const [sort, setSort] = useState(props.initialSort ?? { key: props.columns[0].key, desc: false })
  const pageSize = props.pageSize ?? 12
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(pageSize)
  const [q, setQ] = useState('')
  // Columns that are blank for every row only push the useful ones off the edge, so they drop out with a note saying which.
  const { columns, hidden } = useMemo(() => {
    const all = props.rows.flatMap((r) => [r, ...(r.children ?? [])])
    if (all.length < 2) return { columns: props.columns, hidden: [] as string[] }
    const drop = props.columns.filter((c, i) => i > 0 && !c.keep && all.every((r) => blank(c.value(r.data))))
    return { columns: props.columns.filter((c) => !drop.includes(c)), hidden: drop.map((c) => c.label) }
  }, [props.columns, props.rows])
  const col = columns.find((c) => c.key === sort.key) ?? columns[0]

  const sorted = useMemo(() => {
    const s = (rs: TableRow<T>[]): TableRow<T>[] =>
      [...rs]
        .sort((a, b) => cmp(col.value(a.data), col.value(b.data)) * (sort.desc ? -1 : 1))
        .map((r) => (r.children ? { ...r, children: s(r.children) } : r))
    const needle = q.trim().toLowerCase()
    const filtered =
      needle && props.search
        ? props.rows
            .map((r) => {
              if (props.search!(r.data).toLowerCase().includes(needle)) return r
              const kids = r.children?.filter((c) => props.search!(c.data).toLowerCase().includes(needle))
              return kids?.length ? { ...r, children: kids } : null
            })
            .filter((r): r is TableRow<T> => r !== null)
        : props.rows
    return s(filtered)
  }, [props.rows, props.search, col, sort.desc, q])

  const maxOf = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of columns) {
      if (!c.bar) continue
      m[c.key] = Math.max(0, ...props.rows.map((r) => Number(c.value(r.data))).filter(Number.isFinite))
    }
    return m
  }, [columns, props.rows])

  const hasKids = props.rows.some((r) => r.children?.length)
  const expandAll = !!q.trim()

  const cell = (c: Column<T>, d: T) => {
    if (c.render) return c.render(d)
    const v = c.value(d)
    if (typeof v === 'number') {
      const text = c.fmt ? c.fmt(v) : Number.isFinite(v) ? String(v) : DASH
      if (c.bar && Number.isFinite(v) && maxOf[c.key] > 0)
        return (
          <span className="cell-bar">
            <i>
              <span style={{ width: `${(v / maxOf[c.key]) * 100}%`, minWidth: v > 0 ? 2 : 0, background: c.bar }} />
            </i>
            <b>{text}</b>
          </span>
        )
      return text
    }
    return v || DASH
  }

  const renderRow = (r: TableRow<T>, depth: number) => {
    const isOpen = expandAll || open.has(r.id)
    const kids = r.children ?? []
    return (
      <Fragment key={r.id}>
        <tr
          className={`${depth ? 'child' : ''} ${props.onRowClick ? 'clickable' : ''}`}
          onClick={props.onRowClick ? () => props.onRowClick!(r.data) : undefined}
          tabIndex={props.onRowClick ? 0 : undefined}
          onKeyDown={props.onRowClick ? (e) => e.key === 'Enter' && props.onRowClick!(r.data) : undefined}
        >
          {columns.map((c, ci) => (
            <td
              key={c.key}
              className={`${c.align === 'right' || (c.align !== 'left' && ci > 0 && typeof c.value(r.data) === 'number') ? 'num' : ''} ${c.nowrap ? 'keep' : ''}`}
            >
              {ci === 0 && hasKids ? (
                <span className="tree" style={{ paddingLeft: depth * 22 }}>
                  {kids.length ? (
                    <button
                      type="button"
                      className="twisty"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${String(c.value(r.data))}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen((o) => {
                          const n = new Set(o)
                          if (n.has(r.id)) n.delete(r.id)
                          else n.add(r.id)
                          return n
                        })
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path d={isOpen ? 'M1 3l4 4 4-4' : 'M3 1l4 4-4 4'} fill="none" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    </button>
                  ) : (
                    depth === 0 && <span className="twisty-gap" />
                  )}
                  <span className="tree-label">{cell(c, r.data)}</span>
                  {depth === 0 && kids.length > 0 && <small className="kid-count">{kids.length}</small>}
                </span>
              ) : (
                cell(c, r.data)
              )}
            </td>
          ))}
        </tr>
        {isOpen && kids.map((k) => renderRow(k, depth + 1))}
      </Fragment>
    )
  }

  return (
    <div className="table-wrap">
      {props.search && (
        <div className="table-tools">
          <input
            type="search"
            placeholder={`Search ${props.childNoun ?? 'rows'}`}
            aria-label={`Search ${props.label}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {hasKids && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setOpen((o) => (o.size ? new Set() : new Set(props.rows.map((r) => r.id))))}
            >
              {open.size ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      )}
      {sorted.length === 0 ? (
        <Empty>{props.rows.length ? 'No rows match your search.' : (props.empty ?? 'Nothing to list for these filters.')}</Empty>
      ) : (
        <div className="table-scroll">
          <table aria-label={props.label} style={{ minWidth: props.minWidth ?? columns.length * 96 }}>
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((c, ci) => {
                  const active = sort.key === c.key
                  const numeric = ci > 0 && c.align !== 'left' && props.rows[0] && typeof c.value(props.rows[0].data) === 'number'
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={numeric || c.align === 'right' ? 'num' : ''}
                      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                      title={c.help ?? c.label}
                    >
                      <button
                        type="button"
                        onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : ci > 0 })}
                      >
                        <span className="th-label">{c.label}</span>
                        <span className={`sort ${active ? 'on' : ''}`} aria-hidden="true">
                          {active ? (sort.desc ? '↓' : '↑') : '↕'}
                        </span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>{sorted.slice(0, limit).map((r) => renderRow(r, 0))}</tbody>
          </table>
        </div>
      )}
      {(sorted.length > pageSize || hidden.length > 0) && (
        <div className="table-foot">
          {sorted.length > pageSize && (
            <span>
              {Math.min(limit, sorted.length).toLocaleString()} of {sorted.length.toLocaleString()}
              {sorted.length > limit && (
                <button type="button" className="link-btn" onClick={() => setLimit((l) => l + 25)}>
                  Show {Math.min(25, sorted.length - limit)} more
                </button>
              )}
              {limit > pageSize && (
                <button type="button" className="link-btn" onClick={() => setLimit(pageSize)}>
                  Show fewer
                </button>
              )}
            </span>
          )}
          {hidden.length > 0 && <small>No data in these rows for {hidden.join(', ')}</small>}
        </div>
      )}
    </div>
  )
}
