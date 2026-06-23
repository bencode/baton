// Interval display + input helpers for the loops UI. Mirrors the CLI's
// fmtInterval / parseDuration (a separate package, so not importable here).

const MIN_INTERVAL_SEC = 30
const MAX_INTERVAL_SEC = 90 * 86_400 // 90d — matches the server ceiling.

// Seconds → the largest whole unit (1d / 2h / 30m / 90s) for compact display.
export const formatInterval = (sec: number): string => {
  if (sec % 86_400 === 0) return `${sec / 86_400}d`
  if (sec % 3_600 === 0) return `${sec / 3_600}h`
  if (sec % 60 === 0) return `${sec / 60}m`
  return `${sec}s`
}

export type IntervalUnit = 'sec' | 'min' | 'hour' | 'day'

const UNIT_SEC: Record<IntervalUnit, number> = { sec: 1, min: 60, hour: 3_600, day: 86_400 }

export const toSeconds = (value: number, unit: IntervalUnit): number =>
  Math.floor(value) * UNIT_SEC[unit]

// Validate against the same floor/ceiling the server enforces; returns an error
// string for the UI, or null when ok.
export const intervalError = (sec: number): string | null => {
  if (!Number.isFinite(sec) || sec < MIN_INTERVAL_SEC) return `min ${MIN_INTERVAL_SEC}s`
  if (sec > MAX_INTERVAL_SEC) return 'max 90d'
  return null
}
