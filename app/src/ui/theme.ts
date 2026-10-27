export const COLOR = {
  licensed: '#4b47c2',
  unlicensed: '#a8682b',
  agent: '#2f7a72',
  neutral: '#4b4f6b',
}

/** Habit buckets, light to daily. */
export const RAMP = ['#d6d8f2', '#9497dc', '#4b47c2', '#2c2a6e']

/** Categorical palette for series without a fixed meaning. */
export const PALETTE = ['#4b47c2', '#2f7a72', '#a8682b', '#6b93b3', '#9c5a7c', '#7a68ad', '#7b8794', '#6f7d48']

export const RISK_COLOR: Record<string, string> = {
  High: '#b0382c',
  Medium: '#a8682b',
  Low: '#a3a6dd',
}

export const ACTIVITY_COLOR: Record<string, string> = {
  'Active (7d)': '#2c2a6e',
  'Active (30d)': '#4b47c2',
  'Idle (90d)': '#a8682b',
  'Dormant (90d+)': '#7b8794',
  'No usage signal': '#b8c1cc',
}

export const GROUP_COLOR: Record<string, string> = {
  'Copilot Chat': '#4b47c2',
  'In-app Copilot': '#6b93b3',
  Cowork: '#9c5a7c',
  Agents: '#2f7a72',
  Other: '#7b8794',
}

export const HABIT_COLOR: Record<string, string> = {
  'Daily habit': '#2c2a6e',
  Regular: '#4b47c2',
  Occasional: '#9497dc',
  'One-off': '#d6d8f2',
}

export const STAGE_COLOR: Record<string, string> = {
  Habitual: '#2c2a6e',
  Regular: '#4b47c2',
  Trying: '#9497dc',
  New: '#6b93b3',
  Lapsed: '#b8c1cc',
}

export const LIFECYCLE_COLOR: Record<string, string> = {
  New: '#6b93b3',
  Growing: '#2c2a6e',
  Steady: '#4b47c2',
  Declining: '#a8682b',
  Dormant: '#7b8794',
  'Never used': '#b8c1cc',
}

export const VERDICT_COLOR: Record<string, string> = {
  Promote: '#2c2a6e',
  Keep: '#4b47c2',
  Watch: '#6b93b3',
  Review: '#b0382c',
  Retire: '#7b8794',
}

export const colorAt = (i: number) => PALETTE[i % PALETTE.length]
