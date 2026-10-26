import { createElement } from 'react'
import type { Bar } from '../metrics/measures'
import type { Column } from '../ui/DataTable'
import { dateLabel, int, type Fmt } from '../ui/format'
import { colorAt } from '../ui/theme'
import { AgentName } from './common'

export const text = <T,>(key: string, label: string, get: (r: T) => string | null | undefined, width?: string): Column<T> => ({
  key,
  label,
  value: (r) => get(r) ?? '',
  render: (r) => get(r) || '–',
  width,
})

export const num = <T,>(key: string, label: string, get: (r: T) => number, opts: { fmt?: Fmt; bar?: string; help?: string } = {}): Column<T> => ({
  key,
  label,
  value: get,
  fmt: opts.fmt ?? int,
  align: 'right',
  bar: opts.bar,
  help: opts.help,
})

export const date = <T,>(key: string, label: string, get: (r: T) => string | null | undefined): Column<T> => ({
  key,
  label,
  value: (r) => get(r) ?? '',
  render: (r) => {
    const v = get(r)
    return v ? dateLabel(v.slice(0, 10)) : '–'
  },
})

export const bool = <T,>(key: string, label: string, get: (r: T) => boolean): Column<T> => ({
  key,
  label,
  value: (r) => (get(r) ? 'Yes' : 'No'),
})

export const agentCol = <T,>(get: (r: T) => { key: string; name: string }, label = 'Agent'): Column<T> => ({
  key: 'agent',
  label,
  value: (r) => get(r).name,
  render: (r) => createElement(AgentName, { agentKey: get(r).key, name: get(r).name }),
  width: '22%',
})

export const rowsOf = <T,>(items: T[], id: (r: T, i: number) => string) => items.map((data, i) => ({ id: id(data, i), data }))

/** Colours bars for a donut-style Distribution, honouring a fixed palette where one exists. */
export function toDistribution(items: Bar[], colors?: Record<string, string>, order?: string[]) {
  const sorted = order ? [...items].sort((a, b) => rank(order, a.key) - rank(order, b.key)) : items
  return sorted.map((b, i) => ({ label: b.label, value: b.value, color: colors?.[b.key] ?? colorAt(i) }))
}

const rank = (order: string[], k: string) => {
  const i = order.indexOf(k)
  return i < 0 ? order.length : i
}

export const ordered = (items: Bar[], order: string[]) => [...items].sort((a, b) => rank(order, a.key) - rank(order, b.key))

export const yesNo = (b: boolean) => (b ? 'Yes' : 'No')

export const shortHost = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')
