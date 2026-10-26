import { useState } from 'react'
import { AskPanel } from './ask/AskPanel'
import { useData } from './data/store'
import { RISK_ORDER } from './metrics/measures'
import { Overview } from './pages/Overview'
import { AgentInventory, AllAgents, Creators } from './pages/Inventory'
import { Adoption, AgentAnalytics, UsagePopularity } from './pages/Usage'
import { ChatCowork, Interactions } from './pages/Activity'
import { HabitStages, LifecycleReview } from './pages/Lifecycle'
import { SharePointAgents } from './pages/SharePoint'
import { Governance } from './pages/Governance'
import { KnowledgeGrounding, KnowledgeSources, Tools } from './pages/Integrations'
import { Foundry } from './pages/Foundry'
import { AzureAiSpend, CopilotCredits } from './pages/Cost'
import { ShadowAI } from './pages/Shadow'
import { DataSourcesGaps, LaneStatusView } from './pages/Setup'
import { TABS, useRoute, type Route } from './routes'
import { DataSourceDialog } from './ui/DataSourceDialog'
import { dateLabel } from './ui/format'
import { Segmented, Select } from './ui/primitives'

function Page({ route }: { route: Route }) {
  const { tab, view } = route
  switch (tab.id) {
    case 'overview':
      return <Overview />
    case 'inventory':
      return view === 'creators' ? <Creators /> : view === 'inventory' ? <AgentInventory /> : view === 'sharepoint' ? <SharePointAgents /> : <AllAgents />
    case 'usage':
      return view === 'popularity' ? <UsagePopularity /> : view === 'adoption' ? <Adoption /> : view === 'lifecycle' ? <LifecycleReview /> : <AgentAnalytics />
    case 'activity':
      return view === 'chat' ? <ChatCowork /> : view === 'habits' ? <HabitStages /> : <Interactions />
    case 'governance':
      return <Governance />
    case 'integrations':
      return view === 'knowledge' ? <KnowledgeGrounding /> : view === 'sources' ? <KnowledgeSources /> : <Tools />
    case 'foundry':
      return <Foundry />
    case 'cost':
      return view === 'azure' ? <AzureAiSpend /> : <CopilotCredits />
    case 'shadow':
      return <ShadowAI />
    default:
      return view === 'lanes' ? <LaneStatusView /> : <DataSourcesGaps />
  }
}

const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }))
const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))

/** Views inside an agent-filtered tab that are not about inventory agents, so the slicers would mislead. */
const UNFILTERED_VIEWS = new Set(['inventory/sharepoint', 'activity/chat', 'activity/habits', 'cost/azure'])

function FilterBar({ route }: { route: Route }) {
  const { ds, filters, setFilter, resetFilters } = useData()
  if (!route.tab.agentFilters || UNFILTERED_VIEWS.has(`${route.tab.id}/${route.view}`)) return null
  const anySet = Object.values(filters).some(Boolean)
  return (
    <div className="filters" role="group" aria-label="Agent filters">
      <Select label="Environment" value={filters.env} onChange={(v) => setFilter('env', v)} options={opts(uniq(ds.agents.map((a) => a.envName)))} allLabel="All" />
      <Select label="Platform" value={filters.platform} onChange={(v) => setFilter('platform', v)} options={opts(uniq(ds.agents.map((a) => a.platform)))} allLabel="All" />
      <Select label="Risk band" value={filters.riskBand} onChange={(v) => setFilter('riskBand', v)} options={opts(RISK_ORDER)} allLabel="All" />
      <Select label="Agent origin" value={filters.origin} onChange={(v) => setFilter('origin', v)} options={opts(uniq(ds.agents.map((a) => a.agentOrigin)))} allLabel="All" />
      {anySet && (
        <button type="button" className="link-btn reset" onClick={resetFilters}>
          Clear filters
        </button>
      )}
    </div>
  )
}

export default function App() {
  const { ds, loading, notice } = useData()
  const [route, go] = useRoute()
  const [sourceOpen, setSourceOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const view = route.tab.views.find((v) => v.id === route.view)
  const lanesWithData = ds.lanes.filter((l) => l.rows > 0).length

  return (
    <div className="shell">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="band">
        <div className="band-inner">
          <div className="band-top">
            <div className="brand">
              <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
                <rect width="28" height="28" rx="7" fill="#ffffff" fillOpacity="0.1" />
                <path d="M7 9h14M7 14h14M7 19h9" stroke="#c4b5fd" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
              <div>
                <h1>Copilot Inventory</h1>
                <p>Agents, Copilot activity and governance across the tenant</p>
              </div>
            </div>
            <div className="band-actions">
            <button type="button" className="ask-btn" onClick={() => setAskOpen(true)} aria-haspopup="dialog" disabled={loading}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M5.5 7.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Ask
            </button>
            <button type="button" className="source-chip" onClick={() => setSourceOpen(true)} aria-label="Data source and lane status">
              <span className={`tag mode-${ds.mode}`}>{ds.mode === 'live' ? 'Live data' : 'Sample data'}</span>
              <span className="source-dates">As of {dateLabel(ds.asOf.slice(0, 10))}</span>
              <span className="source-action">
                {loading ? 'Loading…' : ds.mode === 'live' ? `${lanesWithData}/${ds.lanes.length} lanes with data` : 'Change data'}
              </span>
            </button>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <a key={t.id} href={`#/${t.id}`} aria-current={t.id === route.tab.id ? 'page' : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <div className="toolbar">
        <div className="toolbar-inner">
          <div className="page-head">
            <h2>
              {route.tab.label}
              {view && route.tab.views.length > 1 && <span className="crumb"> · {view.label}</span>}
            </h2>
            <p>{route.tab.intro}</p>
          </div>
          {route.tab.views.length > 1 && (
            <Segmented label={`${route.tab.label} views`} value={route.view} options={route.tab.views} onChange={(v) => go(route.tab.id, v)} />
          )}
        </div>
        <FilterBar route={route} />
      </div>
      <main id="main" className="main" tabIndex={-1}>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <Page route={route} />
      </main>
      <footer className="foot">
        {ds.mode === 'sample'
          ? 'Showing the anonymised sample that ships with the app. Names, sites and users are fictional.'
          : 'Live data read through your own connections. Everything is calculated in your browser.'}
      </footer>
      <DataSourceDialog open={sourceOpen} onClose={() => setSourceOpen(false)} />
      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} route={route} />
    </div>
  )
}
