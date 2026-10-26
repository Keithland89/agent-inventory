import type { ReactNode } from 'react'
import { useData } from '../data/store'
import { Panel } from '../ui/primitives'

/** An agent name that opens the drill-in drawer. */
export function AgentName({ agentKey, name }: { agentKey: string; name: string }) {
  const { openAgent, agentByKey } = useData()
  if (!agentByKey.has(agentKey)) return <>{name || '–'}</>
  return (
    <button type="button" className="link-btn" onClick={() => openAgent(agentKey)}>
      {name || '(unnamed agent)'}
    </button>
  )
}

/** Mirrors a Power BI multi-row card: several labelled figures in one panel. */
export function StatList({ title, help, items, span }: { title: string; help?: string; items: [string, ReactNode][]; span?: 1 | 2 | 3 }) {
  return (
    <Panel title={title} help={help} span={span}>
      <dl className="kv">
        {items.map(([k, v]) => (
          <div key={k} className="kv-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

/** Shown where a figure depends on owner or creator names that live mode cannot resolve yet. */
export function NamesNote() {
  const { ds } = useData()
  if (ds.namesResolved) return null
  return (
    <p className="notice">
      Owner and creator names need the Dataverse user table, which this load could not read, so ids are shown instead. Directory name resolution is a planned follow-up.
    </p>
  )
}

export function Intro({ children }: { children: ReactNode }) {
  return <p className="page-intro">{children}</p>
}
