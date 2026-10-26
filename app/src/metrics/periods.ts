import type { Interaction } from '../data/types'

const DAY = 86_400_000

/** Whole days since 1970-01-01 (UTC) for a yyyy-mm-dd date or ISO timestamp; NaN when blank or invalid. */
export const dayNum = (d: string | null | undefined) => (d ? Math.floor(Date.parse(d.slice(0, 10) + 'T00:00:00Z') / DAY) : NaN)
export const dayStr = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

/**
 * The last day with audit data. Windows end here rather than at the refresh time,
 * so an export that lags by a day or two doesn't read as a fall in use.
 */
export function lastDataDay(rows: readonly Interaction[]): string {
  let last = ''
  for (const r of rows) if (r.date > last) last = r.date
  return last
}

/** Splits rows into the `days` ending on `end` and the `days` before that. */
export function splitPeriods<T>(rows: readonly T[], date: (r: T) => string | null | undefined, end: string, days = 7): [T[], T[]] {
  const e = dayNum(end)
  const cur: T[] = []
  const prev: T[] = []
  if (Number.isNaN(e)) return [cur, prev]
  for (const r of rows) {
    const ago = e - dayNum(date(r))
    if (ago >= 0 && ago < days) cur.push(r)
    else if (ago >= days && ago < days * 2) prev.push(r)
  }
  return [cur, prev]
}

export interface Change {
  current: number
  previous: number
  delta: number
  /** Relative change; NaN when the previous period is zero. */
  ratio: number
}

export const change = (current: number, previous: number): Change => ({
  current,
  previous,
  delta: current - previous,
  ratio: previous ? current / previous - 1 : NaN,
})

/** A measure over the last `days` against the `days` before, ending on `end`. */
export function periodChange<T>(rows: readonly T[], date: (r: T) => string | null | undefined, end: string, measure: (rs: T[]) => number, days = 7): Change {
  const [cur, prev] = splitPeriods(rows, date, end, days)
  return change(measure(cur), measure(prev))
}
