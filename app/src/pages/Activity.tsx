import { useMemo, useState } from 'react'
import { useData } from '../data/store'
import type { CopilotSurface, Interaction } from '../data/types'
import { APP_GROUPS, HABITS, WEEKDAYS, appGroup, groupSummary, habitMix, hourGrid, userActivity, weeklyUsers, type AppGroup, type GroupSummary, type UserActivity } from '../metrics/chat'
import { I, bars, groupBy, monthRange, telemetryUplift } from '../metrics/measures'
import { BarList, ColumnChart, Distribution, Donut, GroupedBars, Heatmap, LineChart } from '../ui/charts'
import { DataTable } from '../ui/DataTable'
import { dateLabel, dayLabel, dec1, int, monthLabel, pct } from '../ui/format'
import { Grid, Kpi, KpiRow, Panel, Segmented, Select } from '../ui/primitives'
import { COLOR, GROUP_COLOR, HABIT_COLOR } from '../ui/theme'
import { date, num, rowsOf, text, toDistribution } from './helpers'
import { PageFilters, PageIntro } from '../ui/PageFilters'

const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort()
const options = (v: string[]) => v.map((x) => ({ value: x, label: x }))

type TrendView = 'day' | 'month'
const TREND_VIEWS: { id: TrendView; label: string }[] = [
  { id: 'day', label: 'Per day' },
  { id: 'month', label: 'By month' },
]

interface UserRow {
  user: string
  interactions: number
  sessions: number
}

interface SurfaceRow {
  key: string
  surface: CopilotSurface | undefined
  name: string
  interactions: number
  users: number
  sessions: number
}

export function Interactions() {
  const { ds, scope, openAgent } = useData()
  const [platform, setPlatform] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [trendView, setTrendView] = useState<TrendView>('day')
  const surfaces = ds.surfaces
  const all = scope.interactions
  const dates = useMemo(() => {
    let lo = ''
    let hi = ''
    for (const i of all) {
      if (!lo || i.date < lo) lo = i.date
      if (i.date > hi) hi = i.date
    }
    return { lo, hi }
  }, [all])
  const rows = useMemo(
    () =>
      all.filter((i) => {
        if (from && i.date < from) return false
        if (to && i.date > to) return false
        if (!platform && !type) return true
        const s = surfaces.get(i.surfaceKey)
        return (!platform || s?.platform === platform) && (!type || s?.type === type)
      }),
    [all, from, to, platform, type, surfaces],
  )
  const m = useMemo(() => {
    const byDate = groupBy(rows, (i) => i.date)
    const days = [...byDate.keys()].sort()
    const trend: { key: string; values: number[] }[] = []
    if (days.length) {
      for (let d = new Date(days[0] + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= days[days.length - 1]; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = d.toISOString().slice(0, 10)
        trend.push({ key: k, values: [byDate.get(k)?.length ?? 0] })
      }
    }
    const byMonth = groupBy(rows, (i) => i.date.slice(0, 7))
    const months = [...byMonth.keys()].sort()
    const monthly = monthRange(months[0], months[months.length - 1]).map((k) => {
      const rs = byMonth.get(k) ?? []
      return { key: k, values: [I.sessions(rs), rs.length] }
    })
    const surfaceRows: SurfaceRow[] = [...groupBy(rows, (i) => i.surfaceKey)].map(([key, rs]) => {
      const s = surfaces.get(key)
      return { key, surface: s, name: s?.name ?? key, interactions: rs.length, users: I.users(rs), sessions: I.sessions(rs) }
    })
    const users = [...groupBy(rows.filter((i) => i.user), (i) => i.user)].map(([user, rs]) => ({ user, interactions: rs.length, sessions: I.sessions(rs) }))
    return {
      trend,
      monthly,
      hours: hourGrid(rows),
      types: bars(rows, (i) => surfaces.get(i.surfaceKey)?.type ?? 'Unknown'),
      hosts: bars(rows, (i) => i.appHost),
      surfaceRows,
      users,
    }
  }, [rows, surfaces])

  const allSurfaces = [...surfaces.values()]
  return (
    <>
      <PageFilters label="Page filters">
        <Select label="Surface platform" value={platform} onChange={setPlatform} options={options(uniq(allSurfaces.map((s) => s.platform)))} allLabel="All" />
        <Select label="Surface type" value={type} onChange={setType} options={options(uniq(allSurfaces.map((s) => s.type)))} allLabel="All" />
        <label className={`field ${from ? 'field-set' : ''}`}>
          <span>From</span>
          <input type="date" value={from} min={dates.lo} max={dates.hi} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={`field ${to ? 'field-set' : ''}`}>
          <span>To</span>
          <input type="date" value={to} min={dates.lo} max={dates.hi} onChange={(e) => setTo(e.target.value)} />
        </label>
      </PageFilters>
      <KpiRow>
        <Kpi label="Interactions" value={int(rows.length)} tone="agent" help="Audited Copilot interactions, one per prompt or agent turn." />
        <Kpi label="Sessions" value={int(I.sessions(rows))} />
        <Kpi label="Agents with usage" value={int(I.agentsWithInteractions(rows))} help="Inventory agents joined to at least one interaction." />
        <Kpi label="Agent Builder turns" value={int(I.bySurfaceType('Agent Builder agent', surfaces)(rows))} />
        <Kpi label="Autonomous runs" value={int(I.autonomous(rows))} />
        <Kpi
          label="Telemetry uplift"
          value={int(telemetryUplift(scope.agents, rows))}
          tone="licensed"
          help="Agents the audit log shows in use that have no Power Platform usage record: usage you would otherwise miss."
        />
      </KpiRow>
      <Grid cols={3}>
        <Panel
          title={trendView === 'day' ? 'Interaction trend' : 'Sessions and turns by month'}
          note="Per-agent usage from the Purview unified audit log."
          span={2}
          actions={<Segmented label="Trend view" value={trendView} options={TREND_VIEWS} onChange={setTrendView} />}
        >
          {trendView === 'day' ? (
            <LineChart label="Interactions per day" data={m.trend} series={[{ name: 'Interactions', color: COLOR.agent, fmt: int }]} xFmt={dayLabel} height={330} area />
          ) : (
            <ColumnChart
              label="Sessions and interactions by month"
              data={m.monthly}
              series={[
                { name: 'Sessions', color: COLOR.licensed, fmt: int },
                { name: 'Interactions', color: COLOR.agent, fmt: int },
              ]}
              xFmt={monthLabel}
              height={330}
            />
          )}
        </Panel>
        <Panel title="Where the traffic goes">
          <Donut label="Interactions by surface type" items={toDistribution(m.types)} unit="interactions" />
        </Panel>
        <Panel title="When people use Copilot" span={2} note="Interactions by weekday and hour, in UTC.">
          <Heatmap label="Interactions by weekday and hour" grid={m.hours} rows={WEEKDAYS} color={COLOR.licensed} unit="interactions" zone="UTC" />
        </Panel>
        <Panel title="Client surfaces">
          <BarList label="Interactions by client app" items={m.hosts} color={COLOR.licensed} fmt={int} limit={7} />
        </Panel>
        <Panel title="Busiest agents" span={2}>
          <DataTable
            label="Busiest agents and surfaces"
            rows={rowsOf(m.surfaceRows, (r) => r.key)}
            search={(r) => `${r.name} ${r.surface?.type ?? ''}`}
            onRowClick={(r) => r.surface?.agentKey && openAgent(r.surface.agentKey)}
            initialSort={{ key: 'interactions', desc: true }}
            columns={[
              text('name', 'Surface', (r: SurfaceRow) => r.name, '30%'),
              text('type', 'Type', (r: SurfaceRow) => r.surface?.type),
              text('platform', 'Platform', (r: SurfaceRow) => r.surface?.platform),
              num('interactions', 'Interactions', (r: SurfaceRow) => r.interactions, { bar: COLOR.agent }),
              num('users', 'Users', (r: SurfaceRow) => r.users),
              num('sessions', 'Sessions', (r: SurfaceRow) => r.sessions),
            ]}
          />
        </Panel>
        <Panel title="Heaviest users">
          <DataTable
            label="Heaviest users"
            rows={rowsOf(m.users, (r) => r.user)}
            search={(r) => r.user}
            initialSort={{ key: 'interactions', desc: true }}
            columns={[
              text('user', 'User', (r: UserRow) => r.user),
              num('interactions', 'Interactions', (r: UserRow) => r.interactions, { bar: COLOR.licensed }),
              num('sessions', 'Sessions', (r: UserRow) => r.sessions),
            ]}
          />
        </Panel>
      </Grid>
    </>
  )
}

export function ChatCowork() {
  const { ds } = useData()
  const [group, setGroup] = useState<AppGroup | ''>('')
  const [showUsers, setShowUsers] = useState(false)
  const all = ds.interactions
  const rows = useMemo<Interaction[]>(() => (group ? all.filter((i) => appGroup(i.appHost) === group) : all), [all, group])
  const m = useMemo(() => {
    const summary = groupSummary(all)
    const users = userActivity(rows)
    const habitByGroup = APP_GROUPS.map((g) => {
      const mix = habitMix(userActivity(all.filter((i) => appGroup(i.appHost) === g)))
      return { key: g, values: HABITS.map((h) => mix[h]) }
    }).filter((r) => r.values.some((v) => v > 0))
    return {
      summary,
      users,
      habits: habitMix(users),
      habitByGroup,
      weekly: weeklyUsers(all),
      apps: bars(rows, (i) => i.appHost).map((b) => ({ ...b, color: GROUP_COLOR[appGroup(b.key)], hint: appGroup(b.key) })),
    }
  }, [all, rows])
  const get = (g: AppGroup) => m.summary.find((s) => s.group === g)

  return (
    <>
      <PageIntro>
        Every Copilot surface in the audit log, grouped by product. Agent filters don't apply here: this view covers Copilot Chat and Cowork as well as agents.
      </PageIntro>
      <KpiRow>
        {(['Copilot Chat', 'In-app Copilot', 'Cowork', 'Agents'] as AppGroup[]).map((g) => (
          <Kpi key={g} label={`${g} users`} value={int(get(g)?.users ?? 0)} sub={`${int(get(g)?.turns ?? 0)} turns · ${int(get(g)?.sessions ?? 0)} sessions`} tone="neutral" />
        ))}
        <Kpi label="All Copilot users" value={int(I.users(all))} tone="licensed" sub={`${int(all.length)} turns`} />
      </KpiRow>
      <Grid cols={3}>
        <Panel title="Weekly active users by product" span={3}>
          <LineChart
            label="Distinct users per week by product group"
            data={m.weekly}
            series={APP_GROUPS.map((g) => ({ name: g, color: GROUP_COLOR[g], fmt: int }))}
            xFmt={dayLabel}
          />
        </Panel>
        <Panel title="Products compared" span={3}>
          <DataTable
            label="Usage by product group"
            rows={rowsOf(m.summary.filter((s) => s.turns > 0), (s) => s.group)}
            initialSort={{ key: 'users', desc: true }}
            columns={[
              text('group', 'Product', (s: GroupSummary) => s.group),
              num('users', 'Users', (s: GroupSummary) => s.users, { bar: COLOR.licensed }),
              num('sessions', 'Sessions', (s: GroupSummary) => s.sessions),
              num('turns', 'Turns', (s: GroupSummary) => s.turns),
              num('days', 'Active user-days', (s: GroupSummary) => s.activeDays, { help: 'Distinct user and day pairs with at least one turn.' }),
              num('tpu', 'Turns per user', (s: GroupSummary) => s.turnsPerUser, { fmt: dec1 }),
            ]}
          />
        </Panel>
      </Grid>
      <PageFilters label="Product filter">
        <Select label="Product" value={group} onChange={(v) => setGroup(v as AppGroup | '')} options={options([...APP_GROUPS])} allLabel="All products" />
      </PageFilters>
      <Grid cols={3}>
        <Panel title="Split by app" note={group ? `Client apps in ${group}.` : 'Client apps, coloured by product group.'}>
          <BarList label="Turns by client app" items={m.apps} color={COLOR.neutral} fmt={int} limit={9} />
        </Panel>
        <Panel title="Habit cohorts" help="Average active days per active week: 4 or more is a daily habit, 2 or more is regular; otherwise occasional, or one-off for a single day.">
          <Distribution label="Users by habit cohort" items={HABITS.map((h) => ({ label: h, value: m.habits[h], color: HABIT_COLOR[h] }))} fmt={int} />
          <p className="panel-note">
            {int(m.users.length)} users · {pct(m.users.length ? m.habits['Daily habit'] / m.users.length : NaN)} daily habit
          </p>
        </Panel>
        <Panel title="Habits by product">
          <GroupedBars label="Users per habit cohort by product" data={m.habitByGroup} series={HABITS.map((h) => ({ name: h, color: HABIT_COLOR[h], fmt: int }))} />
        </Panel>
        <Panel
          title="Top users"
          note="Hidden by default because it names people."
          span={3}
          actions={
            <button type="button" className="btn" aria-expanded={showUsers} onClick={() => setShowUsers((s) => !s)}>
              {showUsers ? 'Hide' : 'Show'} top users
            </button>
          }
        >
          {showUsers ? (
            <DataTable
              label="Top users"
              rows={rowsOf(m.users, (u) => u.user)}
              search={(u) => u.user}
              initialSort={{ key: 'turns', desc: true }}
              columns={[
                text('user', 'User', (u: UserActivity) => u.user, '26%'),
                text('habit', 'Habit', (u: UserActivity) => u.habit),
                num('turns', 'Turns', (u: UserActivity) => u.turns, { bar: COLOR.licensed }),
                num('sessions', 'Sessions', (u: UserActivity) => u.sessions),
                num('days', 'Active days', (u: UserActivity) => u.activeDays),
                num('dpw', 'Days / week', (u: UserActivity) => u.daysPerWeek, { fmt: dec1 }),
                text('groups', 'Products', (u: UserActivity) => u.groups.join(', ')),
                date('last', 'Last active', (u: UserActivity) => u.lastActive),
              ]}
            />
          ) : (
            <p className="panel-note">
              {int(m.users.length)} users in view{ds.asOf ? `, as of ${dateLabel(ds.asOf.slice(0, 10))}` : ''}.
            </p>
          )}
        </Panel>
      </Grid>
    </>
  )
}
