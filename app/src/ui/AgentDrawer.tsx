import { useMemo } from 'react'
import { useData } from '../data/store'
import { weeklyCount } from '../metrics/chat'
import { I } from '../metrics/measures'
import { LineChart } from './charts'
import { dateLabel, dec1, int, DASH } from './format'
import { Sheet } from './Sheet'
import { COLOR, RISK_COLOR } from './theme'

const day = (iso: string) => (iso ? dateLabel(iso.slice(0, 10)) : DASH)

/** Everything known about one agent, opened from any agent name in the app. */
export function AgentDrawer({ agentKey, onClose }: { agentKey: string | null; onClose: () => void }) {
  const { ds, agentByKey } = useData()
  const agent = agentKey ? agentByKey.get(agentKey) : undefined
  const d = useMemo(() => {
    if (!agent) return null
    const rows = ds.interactions.filter((i) => i.agentKey === agent.key)
    return {
      rows,
      weekly: weeklyCount(rows),
      reasons: ds.riskDetail.filter((r) => r.agentKey === agent.key),
      knowledge: ds.knowledge.filter((k) => k.agentKey === agent.key),
      sources: ds.sources.filter((s) => s.agentKey === agent.key),
      connectors: ds.connectors.filter((c) => c.agentKey === agent.key),
      credits: ds.credits.filter((c) => c.agentKey === agent.key),
    }
  }, [agent, ds])
  const billed = d ? d.credits.reduce((s, c) => s + c.billed, 0) : 0
  const nonBilled = d ? d.credits.reduce((s, c) => s + c.nonBilled, 0) : 0

  return (
    <Sheet open={!!agent} onClose={onClose} title={agent?.name || 'Agent'} side>
      {agent && d && (
        <div className="detail">
          <p className="detail-type">
            {agent.platform}
            {agent.authoringSurface && agent.authoringSurface !== agent.platform ? ` · ${agent.authoringSurface}` : ''}
          </p>
          <dl className="stat-grid">
            <div>
              <dt>Risk</dt>
              <dd style={{ color: RISK_COLOR[agent.riskBand] }}>
                {agent.riskBand} ({agent.riskScore})
              </dd>
            </div>
            <div>
              <dt>Activity</dt>
              <dd>{agent.activityStatus}</dd>
            </div>
            <div>
              <dt>Users</dt>
              <dd>{int(I.users(d.rows))}</dd>
            </div>
            <div>
              <dt>Sessions</dt>
              <dd>{int(I.sessions(d.rows))}</dd>
            </div>
            <div>
              <dt>Interactions</dt>
              <dd>{int(d.rows.length)}</dd>
            </div>
            <div>
              <dt>Run-time hours</dt>
              <dd>{dec1(I.runTimeHours(d.rows))}</dd>
            </div>
            {d.credits.length > 0 && (
              <div>
                <dt>Credits billed (30d)</dt>
                <dd title={`${int(nonBilled)} non-billed`}>{int(billed)}</dd>
              </div>
            )}
          </dl>
          {d.weekly.length > 1 && (
            <>
              <h3>Weekly interactions</h3>
              <LineChart label={`Weekly interactions with ${agent.name}`} data={d.weekly} series={[{ name: 'Interactions', color: COLOR.agent, fmt: int }]} xFmt={dateLabel} height={140} area />
            </>
          )}
          <h3>Details</h3>
          <dl className="kv">
            <dt>Environment</dt>
            <dd>
              {agent.envName || DASH}
              {agent.envType ? <small> · {agent.envType}</small> : null}
            </dd>
            <dt>Region</dt>
            <dd>{agent.region || DASH}</dd>
            <dt>Created</dt>
            <dd>{day(agent.createdAt)}</dd>
            <dt>Last used</dt>
            <dd>{day(agent.lastUsed)}</dd>
            <dt>Published</dt>
            <dd>{agent.isPublished ? day(agent.lastPublishedAt) : 'Not published'}</dd>
            <dt>Owner</dt>
            <dd>{agent.ownerName || agent.ownerId || 'Unresolved'}</dd>
            <dt>Created by</dt>
            <dd>{agent.createdByName || agent.createdBy || 'Unresolved'}</dd>
            <dt>Authentication</dt>
            <dd>{agent.authentication || 'None'}</dd>
            <dt>Orchestration</dt>
            <dd>{agent.orchestration || DASH}</dd>
            <dt>Model</dt>
            <dd>{agent.model || DASH}</dd>
            <dt>Sharing</dt>
            <dd>{agent.sharedTenantWide ? 'Whole tenant' : `${int(agent.sharedUserCount)} users, ${int(agent.sharedGroupCount)} groups`}</dd>
            <dt>Components</dt>
            <dd>
              {int(agent.topicCount)} topics, {int(agent.toolCount)} tools, {int(agent.knowledgeCount)} knowledge
            </dd>
          </dl>
          {d.reasons.length > 0 && (
            <>
              <h3>Why it is risky</h3>
              <ul className="detail-list">
                {d.reasons.map((r) => (
                  <li key={r.factor}>
                    {r.factor} <small>+{r.points}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {(d.knowledge.length > 0 || d.sources.length > 0) && (
            <>
              <h3>Knowledge</h3>
              <ul className="detail-list">
                {d.sources.length
                  ? d.sources.slice(0, 20).map((s, i) => (
                      <li key={`${s.sourceId}:${i}`}>
                        {s.sourceName || s.locator} <small>{s.knowledgeType}</small>
                      </li>
                    ))
                  : d.knowledge.map((k) => (
                      <li key={k.type}>
                        {k.type} <small>{int(k.count)}</small>
                      </li>
                    ))}
              </ul>
            </>
          )}
          {d.connectors.length > 0 && (
            <>
              <h3>Connectors</h3>
              <ul className="detail-list">
                {d.connectors.map((c) => (
                  <li key={c.connectorId}>
                    {c.connectorId} {c.isMcp ? <small>MCP</small> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
