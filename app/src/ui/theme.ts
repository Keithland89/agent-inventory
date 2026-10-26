export const COLOR = {
  licensed: '#4f46e5',
  unlicensed: '#b45309',
  agent: '#0f766e',
  neutral: '#4b4f6b',
}

/** Habit buckets, light to daily. */
export const RAMP = ['#c7d2fe', '#818cf8', '#4f46e5', '#312e81']

/** Categorical palette for series without a fixed meaning. */
export const PALETTE = ['#4f46e5', '#0f766e', '#b45309', '#0284c7', '#be185d', '#7c3aed', '#7b8794', '#4d7c0f']

export const RISK_COLOR: Record<string, string> = {
  High: '#b42318',
  Medium: '#b45309',
  Low: '#8187dc',
}

export const ACTIVITY_COLOR: Record<string, string> = {
  'Active (7d)': '#312e81',
  'Active (30d)': '#4f46e5',
  'Idle (90d)': '#b45309',
  'Dormant (90d+)': '#7b8794',
  'No usage signal': '#b8c1cc',
}

export const GROUP_COLOR: Record<string, string> = {
  'Copilot Chat': '#4f46e5',
  'In-app Copilot': '#0284c7',
  Cowork: '#be185d',
  Agents: '#0f766e',
  Other: '#7b8794',
}

export const HABIT_COLOR: Record<string, string> = {
  'Daily habit': '#312e81',
  Regular: '#4f46e5',
  Occasional: '#818cf8',
  'One-off': '#c7d2fe',
}

export const STAGE_COLOR: Record<string, string> = {
  Habitual: '#312e81',
  Regular: '#4f46e5',
  Trying: '#818cf8',
  New: '#0284c7',
  Lapsed: '#b8c1cc',
}

export const LIFECYCLE_COLOR: Record<string, string> = {
  New: '#0284c7',
  Growing: '#312e81',
  Steady: '#4f46e5',
  Declining: '#b45309',
  Dormant: '#7b8794',
  'Never used': '#b8c1cc',
}

export const VERDICT_COLOR: Record<string, string> = {
  Promote: '#312e81',
  Keep: '#4f46e5',
  Watch: '#0284c7',
  Review: '#b42318',
  Retire: '#7b8794',
}

export const colorAt = (i: number) => PALETTE[i % PALETTE.length]
