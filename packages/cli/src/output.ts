import type {
  Loop,
  Project,
  Requirement,
  SessionView,
  Task,
  TaskComment,
  WorkerView,
  Workspace,
} from '@baton/shared'

export const toJson = (data: unknown): string => JSON.stringify(data, null, 2)

export const fmtWorkspace = (w: Workspace): string => `${w.id}  ${w.name}`
export const fmtProject = (p: Project): string => `${p.id}  ${p.name}`
export const fmtRequirement = (r: Requirement): string => `${r.code}  [${r.status}]  ${r.title}`
export const fmtTask = (t: Task): string => `${t.code}  [${t.status}]  ${t.title}`
export const fmtComment = (c: TaskComment): string =>
  `${c.workerId !== undefined ? `worker#${c.workerId}` : 'you'}  ${c.body}`
export const fmtSession = (s: SessionView): string =>
  `${s.id}  ${s.name}  ${s.attached ? '[active]' : '[inactive]'}  ${s.worktreePath ?? '(pending)'}`
// Workers wear a global W-N handle (the int id with a prefix) — unlike R-N/T-N
// these are NOT per-project: W-7 means the same worker from anywhere.
export const fmtWorker = (w: WorkerView): string => {
  const offline = w.connected === false ? '  [offline]' : ''
  return `W-${w.id}  ${w.name}  ${w.hostname}${offline}`
}

// Seconds → the largest whole unit (1d / 2h / 30m / 90s) for compact display.
export const fmtInterval = (sec: number): string => {
  if (sec % 86400 === 0) return `${sec / 86400}d`
  if (sec % 3600 === 0) return `${sec / 3600}h`
  if (sec % 60 === 0) return `${sec / 60}m`
  return `${sec}s`
}

export const fmtLoop = (l: Loop): string => {
  const label = l.name ? `${l.name}  ` : ''
  const last = l.lastStatus ? `  last:${l.lastStatus}` : ''
  return `${l.id}  [${l.enabled ? 'on' : 'off'}]  ${label}every ${fmtInterval(l.intervalSec)}${last}  "${l.message}"`
}

export const renderOne = <T>(item: T, fmt: (x: T) => string, json: boolean): string =>
  json ? toJson(item) : fmt(item)

export const renderList = <T>(items: T[], fmt: (x: T) => string, json: boolean): string => {
  if (json) return toJson(items)
  return items.length ? items.map(fmt).join('\n') : '(none)'
}

export const removed = (kind: string, id: string | number, json: boolean): string =>
  json ? toJson({ ok: true, deleted: id }) : `deleted ${kind} ${id}`
