import { useEffect, useState } from 'react'

export type TabId = 'overview' | 'inventory' | 'usage' | 'activity' | 'sharepoint' | 'governance' | 'integrations' | 'foundry' | 'cost' | 'shadow' | 'setup'

export interface TabDef {
  id: TabId
  label: string
  intro: string
  views: { id: string; label: string }[]
  /** Whether the agent slicers (Environment, Platform, Risk band, Agent origin) apply here. */
  agentFilters: boolean
}

export const TABS: TabDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    intro: 'How many agents exist, how many are used, and how many need attention.',
    views: [],
    agentFilters: true,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    intro: 'Every agent across Copilot Studio, Agent Builder and Azure AI Foundry, and who builds and owns them.',
    views: [
      { id: 'all', label: 'All agents' },
      { id: 'inventory', label: 'Agent inventory' },
      { id: 'creators', label: 'Creators & ownership' },
    ],
    agentFilters: true,
  },
  {
    id: 'usage',
    label: 'Usage',
    intro: 'Which agents people use, how recently, and how adoption grows.',
    views: [
      { id: 'analytics', label: 'Agent analytics' },
      { id: 'popularity', label: 'Usage & popularity' },
      { id: 'adoption', label: 'Adoption & activity' },
    ],
    agentFilters: true,
  },
  {
    id: 'activity',
    label: 'Copilot activity',
    intro: 'Audit-log interactions with agents, Copilot Chat, in-app Copilot and Cowork.',
    views: [
      { id: 'interactions', label: 'Interactions' },
      { id: 'chat', label: 'Chat & Cowork' },
    ],
    agentFilters: true,
  },
  {
    id: 'sharepoint',
    label: 'SharePoint agents',
    intro: 'Agents saved as .agent files in SharePoint sites, from the SharePoint audit log.',
    views: [],
    agentFilters: false,
  },
  {
    id: 'governance',
    label: 'Governance & risk',
    intro: 'Risk scores, the factors behind them, and the agents to review first.',
    views: [],
    agentFilters: true,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    intro: 'The connectors, MCP servers and knowledge that agents reach.',
    views: [
      { id: 'tools', label: 'Tools' },
      { id: 'knowledge', label: 'Knowledge & grounding' },
      { id: 'sources', label: 'Knowledge sources' },
    ],
    agentFilters: true,
  },
  {
    id: 'foundry',
    label: 'Azure AI Foundry',
    intro: 'Foundry accounts, projects and model deployments across your subscriptions.',
    views: [],
    agentFilters: false,
  },
  {
    id: 'cost',
    label: 'Cost & consumption',
    intro: 'Copilot Credits that agents consume, the tenant capacity behind them, and Azure AI spend.',
    views: [
      { id: 'credits', label: 'Copilot Studio credits' },
      { id: 'azure', label: 'Azure AI spend' },
    ],
    agentFilters: true,
  },
  {
    id: 'shadow',
    label: 'Shadow AI',
    intro: 'Unsanctioned AI tooling that Microsoft Defender sees on devices and the network.',
    views: [],
    agentFilters: false,
  },
  {
    id: 'setup',
    label: 'Setup & coverage',
    intro: 'Where each number comes from, what the APIs cannot see, and how each data lane loaded.',
    views: [
      { id: 'sources', label: 'Data sources & gaps' },
      { id: 'lanes', label: 'Live lane status' },
    ],
    agentFilters: false,
  },
]

export interface Route {
  tab: TabDef
  view: string
}

function parse(hash: string): Route {
  const [t, v] = hash.replace(/^#\/?/, '').split('/')
  const tab = TABS.find((x) => x.id === t) ?? TABS[0]
  const view = tab.views.find((x) => x.id === v)?.id ?? tab.views[0]?.id ?? ''
  return { tab, view }
}

export function useRoute(): [Route, (tab: TabId, view?: string) => void] {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const on = () => setRoute(parse(location.hash))
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const go = (tab: TabId, view?: string) => {
    location.hash = `/${tab}${view ? `/${view}` : ''}`
  }
  return [route, go]
}

export const href = (tab: TabId, view?: string) => `#/${tab}${view ? `/${view}` : ''}`
