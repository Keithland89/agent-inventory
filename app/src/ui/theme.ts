export const COLOR = {
  licensed: '#0f766e',
  unlicensed: '#b45309',
  agent: '#6d28d9',
  neutral: '#3f5f5b',
}

/** Habit buckets, light to daily. */
export const RAMP = ['#b6ded8', '#64b5a8', '#23897c', '#0b544c']

/** Categorical palette for series without a fixed meaning. */
export const PALETTE = ['#0f766e', '#6d28d9', '#b45309', '#2563eb', '#be185d', '#4d7c0f', '#7b8794', '#0e7490']

export const RISK_COLOR: Record<string, string> = {
  High: '#b42318',
  Medium: '#b45309',
  Low: '#5a9e94',
}

export const ACTIVITY_COLOR: Record<string, string> = {
  'Active (7d)': '#0b544c',
  'Active (30d)': '#23897c',
  'Idle (90d)': '#b45309',
  'Dormant (90d+)': '#7b8794',
  'No usage signal': '#b8c1cc',
}

export const GROUP_COLOR: Record<string, string> = {
  'Copilot Chat': '#0f766e',
  'In-app Copilot': '#2563eb',
  Cowork: '#be185d',
  Agents: '#6d28d9',
  Other: '#7b8794',
}

export const HABIT_COLOR: Record<string, string> = {
  'Daily habit': '#0b544c',
  Regular: '#23897c',
  Occasional: '#64b5a8',
  'One-off': '#b6ded8',
}

export const colorAt = (i: number) => PALETTE[i % PALETTE.length]
