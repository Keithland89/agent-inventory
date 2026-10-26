import type { Interaction } from '../data/types'
import { monthRange } from './measures'
import { dayNum, dayStr, lastDataDay } from './periods'

/** ValueLens-style habit stages, from most to least engaged. */
export const STAGES = ['Habitual', 'Regular', 'Trying', 'New', 'Lapsed'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_HELP: Record<Stage, string> = {
  Habitual: 'Active in 6 or more of the last 8 weeks.',
  Regular: 'Active in 3 to 5 of the last 8 weeks.',
  Trying: 'Active in 1 or 2 of the last 8 weeks, including the last 4.',
  New: 'First seen in the last 2 weeks.',
  Lapsed: 'Active in the last 90 days, but not in the last 4 weeks.',
}

/** Weeks of history a stage needs; months before this would call everyone New or Trying. */
export const STAGE_HISTORY_DAYS = 56

/** Each user's distinct active days, as sorted day numbers. */
export function userDays(rows: readonly Interaction[]): Map<string, number[]> {
  const sets = new Map<string, Set<number>>()
  for (const r of rows) {
    if (!r.user || !r.date) continue
    const d = dayNum(r.date)
    if (Number.isNaN(d)) continue
    const s = sets.get(r.user)
    if (s) s.add(d)
    else sets.set(r.user, new Set([d]))
  }
  return new Map([...sets].map(([u, s]) => [u, [...s].sort((a, b) => a - b)]))
}

/** A user's stage on a given day, or null when they had no activity in the 90 days to that day. */
export function stageAt(days: readonly number[], anchor: number): Stage | null {
  let first = NaN
  let last = NaN
  const weeks = new Set<number>()
  for (const d of days) {
    if (d > anchor) break
    if (Number.isNaN(first)) first = d
    last = d
    const ago = anchor - d
    if (ago < STAGE_HISTORY_DAYS) weeks.add(Math.floor(ago / 7))
  }
  if (Number.isNaN(last) || anchor - last >= 90) return null
  if (anchor - last >= 28) return 'Lapsed'
  if (anchor - first < 14) return 'New'
  return weeks.size >= 6 ? 'Habitual' : weeks.size >= 3 ? 'Regular' : 'Trying'
}

export const emptyMix = () => Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>

export function stageMix(days: Map<string, number[]>, anchor: number): Record<Stage, number> {
  const out = emptyMix()
  for (const d of days.values()) {
    const s = stageAt(d, anchor)
    if (s) out[s]++
  }
  return out
}

export function userStages(days: Map<string, number[]>, anchor: number): Map<string, Stage> {
  const out = new Map<string, Stage>()
  for (const [u, d] of days) {
    const s = stageAt(d, anchor)
    if (s) out.set(u, s)
  }
  return out
}

/**
 * Users per stage at the end of each month (the last data day for the latest month).
 * Months that end before 8 weeks of history are left out.
 */
export function stagesByMonth(rows: readonly Interaction[], days = userDays(rows)) {
  let first = ''
  for (const r of rows) if (r.date && (!first || r.date < first)) first = r.date
  const last = lastDataDay(rows)
  if (!first || !last) return []
  const start = dayNum(first) + STAGE_HISTORY_DAYS - 1
  const end = dayNum(last)
  return monthRange(first.slice(0, 7), last.slice(0, 7))
    .map((month) => {
      const [y, m] = month.split('-').map(Number)
      const monthEnd = Math.floor(Date.UTC(y, m, 0) / 86_400_000)
      return { month, anchor: Math.min(monthEnd, end) }
    })
    .filter((p) => p.anchor >= start)
    .map((p) => {
      const mix = stageMix(days, p.anchor)
      return { key: p.month, anchor: dayStr(p.anchor), values: STAGES.map((s) => mix[s]) }
    })
}

/** How users moved between stages from one day to another; users absent on a day count as "None". */
export function stageMoves(days: Map<string, number[]>, from: number, to: number) {
  let up = 0
  let down = 0
  let same = 0
  const rank = (s: Stage | null) => (s === null ? -1 : s === 'Lapsed' ? 0 : s === 'New' || s === 'Trying' ? 1 : s === 'Regular' ? 2 : 3)
  for (const d of days.values()) {
    const a = stageAt(d, from)
    const b = stageAt(d, to)
    if (a === null && b === null) continue
    const diff = rank(b) - rank(a)
    if (diff > 0) up++
    else if (diff < 0) down++
    else same++
  }
  return { up, down, same }
}
