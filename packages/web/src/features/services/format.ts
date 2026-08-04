export const formatServiceUptime = (startedAt: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

export const formatServiceStartedAt = (startedAt: number): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(startedAt)
