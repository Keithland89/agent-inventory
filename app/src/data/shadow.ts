import { SHADOW_WATCHLIST, type WatchItem } from './static'
import { str, toInt, toTime } from './transforms'
import type { ShadowDevice, ShadowSignal } from './types'

type Col = 'softwareMatch' | 'vendorMatch' | 'processName' | 'domain'

const values = (col: Col) => [...new Set(SHADOW_WATCHLIST.map((w) => w[col].trim()).filter(Boolean))]

/** FnWatchTerms: a quoted, comma-separated list of the watchlist column. */
export const watchTerms = (col: Col) => values(col).map((v) => `'${v.toLowerCase()}'`).join(', ')

/** FnWatchPrefix: an OR of `field startswith 'term'` tests. */
export const watchPrefix = (col: Col, field: string) => values(col).map((v) => `${field} startswith '${v.toLowerCase()}'`).join(' or ')

/** FnWatchMatch: the longest watchlist term contained in the value. */
export function watchMatch(value: string | null | undefined, col: Col): WatchItem | null {
  const v = (value ?? '').toLowerCase()
  const hits = SHADOW_WATCHLIST.filter((w) => w[col].trim() !== '')
    .sort((a, b) => b[col].length - a[col].length)
    .filter((w) => v.includes(w[col].trim().toLowerCase()))
  return hits[0] ?? null
}

/** FnInstalledMatch: a name that leads with a watched term, else a vendor match. */
export function installedMatch(name: string | null | undefined, vendor: string | null | undefined): WatchItem | null {
  const n = (name ?? '').trim().toLowerCase()
  const byName = SHADOW_WATCHLIST.filter((w) => w.softwareMatch.trim() !== '')
    .sort((a, b) => b.softwareMatch.length - a.softwareMatch.length)
    .find((w) => n.startsWith(w.softwareMatch.trim().toLowerCase()))
  return byName ?? watchMatch(vendor, 'vendorMatch')
}

export const KQL = {
  installed: () =>
    'DeviceTvmSoftwareInventory' +
    ` | where (${watchPrefix('softwareMatch', 'SoftwareName')})` +
    ` or SoftwareVendor has_any (${watchTerms('vendorMatch')})` +
    ' | summarize DeviceCount = dcount(DeviceId) by SoftwareName, SoftwareVendor' +
    ' | top 200 by DeviceCount desc',
  executed: () =>
    'DeviceProcessEvents' +
    ' | where Timestamp > ago(30d)' +
    ` | where FileName in~ (${watchTerms('processName')})` +
    ' | summarize DeviceCount = dcount(DeviceId), UserCount = dcount(AccountUpn), LastSeen = max(Timestamp) by FileName, ProcessVersionInfoCompanyName' +
    ' | top 200 by DeviceCount desc',
  network: () =>
    'DeviceNetworkEvents' +
    ' | where Timestamp > ago(30d)' +
    ' | where isnotempty(RemoteUrl)' +
    ` | where RemoteUrl has_any (${watchTerms('domain')})` +
    ' | summarize DeviceCount = dcount(DeviceId), UserCount = dcount(InitiatingProcessAccountUpn), LastSeen = max(Timestamp) by RemoteUrl' +
    ' | top 200 by DeviceCount desc',
  deviceInstalled: () =>
    'DeviceTvmSoftwareInventory' +
    ` | where (${watchPrefix('softwareMatch', 'SoftwareName')})` +
    ` or SoftwareVendor has_any (${watchTerms('vendorMatch')})` +
    ' | project DeviceName, Detected = SoftwareName, Vendor = SoftwareVendor, Detail = SoftwareVersion' +
    ' | take 5000',
  deviceExecuted: () =>
    'DeviceProcessEvents' +
    ' | where Timestamp > ago(30d)' +
    ` | where FileName in~ (${watchTerms('processName')})` +
    ' | summarize LastSeen = max(Timestamp), Runs = count() by DeviceName, FileName, AccountUpn' +
    ' | top 5000 by LastSeen desc',
}

type Row = Record<string, unknown>

const nullableInt = (v: unknown) => (v === null || v === undefined || v === '' ? null : toInt(v))

export function mapInstalled(rows: Row[]): ShadowSignal[] {
  const out: ShadowSignal[] = []
  for (const r of rows) {
    const w = installedMatch(str(r.SoftwareName), str(r.SoftwareVendor))
    if (!w) continue
    out.push({ layer: 'Installed', category: w.category, vendor: w.vendor, appName: w.appName, posture: w.posture, detected: str(r.SoftwareName), deviceCount: toInt(r.DeviceCount), userCount: null, lastSeen: '' })
  }
  return out
}

export function mapExecuted(rows: Row[]): ShadowSignal[] {
  return rows.map((r) => {
    const w = watchMatch(str(r.FileName), 'processName')
    return {
      layer: 'Executed',
      category: w?.category ?? 'Unclassified',
      vendor: w?.vendor ?? str(r.ProcessVersionInfoCompanyName),
      appName: w?.appName ?? str(r.FileName),
      posture: w?.posture ?? 'Unsanctioned',
      detected: str(r.FileName),
      deviceCount: toInt(r.DeviceCount),
      userCount: nullableInt(r.UserCount),
      lastSeen: toTime(r.LastSeen),
    }
  })
}

export function mapNetwork(rows: Row[]): ShadowSignal[] {
  return rows.map((r) => {
    const w = watchMatch(str(r.RemoteUrl), 'domain')
    return {
      layer: 'Network',
      category: w?.category ?? 'Unclassified',
      vendor: w?.vendor ?? '',
      appName: w?.appName ?? str(r.RemoteUrl),
      posture: w?.posture ?? 'Unsanctioned',
      detected: str(r.RemoteUrl),
      deviceCount: toInt(r.DeviceCount),
      userCount: nullableInt(r.UserCount),
      lastSeen: toTime(r.LastSeen),
    }
  })
}

export function mapDevices(installed: Row[], executed: Row[]): ShadowDevice[] {
  const out: ShadowDevice[] = []
  for (const r of installed) {
    const w = installedMatch(str(r.Detected), str(r.Vendor))
    if (!w) continue
    out.push({ layer: 'Installed', deviceName: str(r.DeviceName), appName: w.appName, posture: w.posture, detected: str(r.Detected), detail: str(r.Detail), userUpn: '', lastSeen: '' })
  }
  for (const r of executed) {
    const w = watchMatch(str(r.FileName), 'processName')
    out.push({
      layer: 'Executed',
      deviceName: str(r.DeviceName),
      appName: w?.appName ?? str(r.FileName),
      posture: w?.posture ?? 'Unsanctioned',
      detected: str(r.FileName),
      detail: r.Runs === null || r.Runs === undefined ? '' : `${str(r.Runs)} runs`,
      userUpn: str(r.AccountUpn),
      lastSeen: toTime(r.LastSeen),
    })
  }
  return out
}
