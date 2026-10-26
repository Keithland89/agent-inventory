import type { Interaction } from '../data/types'
import { distinct, groupBy } from './measures'

export const APP_GROUPS = ['Copilot Chat', 'In-app Copilot', 'Cowork', 'Agents', 'Other'] as const
export type AppGroup = (typeof APP_GROUPS)[number]

const MEMBERS: Record<Exclude<AppGroup, 'Other'>, string[]> = {
  'Copilot Chat': ['m365copilot', 'M365App', 'Office', 'Edge', 'OfficeCopilotSearchAnswer'],
  'In-app Copilot': ['Word', 'PowerPoint', 'Outlook', 'OutlookSidepane', 'Microsoft Teams', 'Teams', 'Forms', 'sharepoint', 'Power BI', 'PowerBI', 'DataScience', 'Excel', 'Loop', 'OneNote', 'Whiteboard'],
  Cowork: ['cowork'],
  Agents: ['Copilot Studio', 'Autonomous', 'workflow-agents', 'agentic-builder', 'pva-maker-evaluation', 'MCP', 'ThirdPartyCopilot'],
}

const LOOKUP = new Map<string, AppGroup>()
for (const [g, hosts] of Object.entries(MEMBERS)) for (const h of hosts) LOOKUP.set(h.toLowerCase(), g as AppGroup)

/** Maps an audit-log AppHost to its product group; matching ignores case, unknown values go to "Other". */
export const appGroup = (host: string): AppGroup => LOOKUP.get(host.trim().toLowerCase()) ?? 'Other'

/** Monday of the ISO week containing the date. */
export function weekOf(date: string): string {
  const d = new Date(date.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export const HABITS = ['Daily habit', 'Regular', 'Occasional', 'One-off'] as const
export type Habit = (typeof HABITS)[number]

/** ValueLens-style cohort from a user's active days and the weeks those days fall in. */
export function habitOf(activeDays: number, activeWeeks: number): Habit {
  const perWeek = activeWeeks ? activeDays / activeWeeks : 0
  if (perWeek >= 4) return 'Daily habit'
  if (perWeek >= 2) return 'Regular'
  return activeDays > 1 ? 'Occasional' : 'One-off'
}

export interface UserActivity {
  user: string
  turns: number
  sessions: number
  activeDays: number
  activeWeeks: number
  daysPerWeek: number
  habit: Habit
  groups: AppGroup[]
  lastActive: string
}

export function userActivity(rows: Interaction[]): UserActivity[] {
  return [...groupBy(rows.filter((r) => r.user), (r) => r.user)].map(([user, rs]) => {
    const days = new Set(rs.map((r) => r.date))
    const weeks = new Set([...days].map(weekOf))
    const groups = APP_GROUPS.filter((g) => rs.some((r) => appGroup(r.appHost) === g))
    return {
      user,
      turns: rs.length,
      sessions: distinct(rs, (r) => r.threadId),
      activeDays: days.size,
      activeWeeks: weeks.size,
      daysPerWeek: weeks.size ? days.size / weeks.size : 0,
      habit: habitOf(days.size, weeks.size),
      groups,
      lastActive: rs.reduce((m, r) => (r.time > m ? r.time : m), ''),
    }
  })
}

export interface GroupSummary {
  group: AppGroup
  users: number
  sessions: number
  turns: number
  activeDays: number
  turnsPerUser: number
}

export function groupSummary(rows: Interaction[]): GroupSummary[] {
  const by = groupBy(rows, (r) => appGroup(r.appHost))
  return APP_GROUPS.map((group) => {
    const rs = by.get(group) ?? []
    const users = distinct(rs, (r) => r.user)
    return {
      group,
      users,
      sessions: distinct(rs, (r) => r.threadId),
      turns: rs.length,
      activeDays: distinct(rs, (r) => (r.user ? `${r.user}|${r.date}` : '')),
      turnsPerUser: users ? rs.length / users : NaN,
    }
  })
}

/** Weekly distinct users per group, every week from first to last present. */
export function weeklyUsers(rows: Interaction[], groups: readonly AppGroup[] = APP_GROUPS) {
  return weekly(rows, (rs) => groups.map((g) => distinct(rs, (r) => (appGroup(r.appHost) === g ? r.user : ''))))
}

export const weeklyCount = (rows: Interaction[]) => weekly(rows, (rs) => [rs.length])

/** One point per Monday-start week from the first to the last week seen, empty weeks included. */
function weekly(rows: Interaction[], measure: (rs: Interaction[]) => number[]) {
  const by = groupBy(rows.filter((r) => r.date), (r) => weekOf(r.date))
  const keys = [...by.keys()].sort()
  if (!keys.length) return []
  const out: { key: string; values: number[] }[] = []
  for (let w = keys[0]; w <= keys[keys.length - 1]; ) {
    out.push({ key: w, values: measure(by.get(w) ?? []) })
    const d = new Date(w + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 7)
    w = d.toISOString().slice(0, 10)
  }
  return out
}

export function habitMix(users: UserActivity[]): Record<Habit, number> {
  const out = Object.fromEntries(HABITS.map((h) => [h, 0])) as Record<Habit, number>
  for (const u of users) out[u.habit]++
  return out
}
