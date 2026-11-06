import type { ProjectWorkerView } from '@baton/shared'

export type DirectoryGroup = {
  key: string
  workers: ProjectWorkerView[]
  // Answers this directory's file queries: any online worker sees the same files.
  host: ProjectWorkerView
}

// A worker of unknown directory stands alone: it cannot be shown to share one.
const directoryKey = (worker: ProjectWorkerView): string =>
  worker.directory ?? `worker:${worker.id}`

export const groupByDirectory = (workers: ProjectWorkerView[]): DirectoryGroup[] => {
  const keys = [...new Set(workers.map(directoryKey))]
  return keys.flatMap(key => {
    const members = workers.filter(worker => directoryKey(worker) === key)
    const host = members.find(worker => worker.connected) ?? members[0]
    return host ? [{ key, workers: members, host }] : []
  })
}
