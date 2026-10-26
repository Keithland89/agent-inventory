import { type ReactNode } from 'react'
import { useData } from '../data/store'
import { laneProblem, type LaneProblem, type ProblemKind } from '../metrics/coverage'
import { href } from '../routes'
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

const HEADLINE: Record<ProblemKind, string> = { failed: "didn't load", absent: "isn't in the sample", empty: 'returned no rows' }

/** Says which lanes behind a page failed, why, and where to fix them, so their figures are not read as zeros. */
export function LaneNotice({ problems }: { problems: LaneProblem[] }) {
  if (!problems.length) return null
  return (
    <div className="lane-notices" role="status">
      {problems.map((p) => (
        <div key={p.lane.id} className={`lane-notice lane-notice-${p.kind}`}>
          <p>
            <b>
              {p.lane.label} {HEADLINE[p.kind]}.
            </b>{' '}
            {p.message}
            {p.kind !== 'empty' && ' Figures that depend on it show a dash.'}
          </p>
          <a href={href('setup', 'lanes')}>Open lane status</a>
        </div>
      ))}
    </div>
  )
}

/** The lanes that did not load, in one line, on the page people land on. */
export function CoverageBanner() {
  const { ds } = useData()
  const problems = ds.lanes.map((l) => laneProblem(l)).filter((p): p is LaneProblem => !!p && p.kind !== 'empty')
  if (!problems.length) return null
  const names = problems.map((p) => p.lane.label).join(', ')
  const n = problems.length
  const verb = ds.mode === 'sample' ? `${n === 1 ? 'has' : 'have'} no rows in the sample` : "didn't load"
  return (
    <div className="coverage" role="status">
      <p>
        <b>
          {n} of {ds.lanes.length} data lanes {verb}:
        </b>{' '}
        {names}. The pages that depend on {n === 1 ? 'it' : 'them'} say so, and show a dash rather than a zero.
      </p>
      <a href={href('setup', 'lanes')}>Review lane status</a>
    </div>
  )
}
