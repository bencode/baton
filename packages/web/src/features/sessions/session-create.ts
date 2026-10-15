import type { Id, SessionView } from '@baton/shared'
import type { Api } from '../../api'

const preferenceKey = (projectId: Id) => `baton.last-worker.${projectId}`

export const readLastWorker = (projectId: Id): Id | null => {
  try {
    const id = Number(localStorage.getItem(preferenceKey(projectId)))
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch (error) {
    console.warn('[sessions] could not read worker preference', error)
    return null
  }
}

export const createSessionOnWorker = async (
  api: Api,
  projectId: Id,
  workerId: Id,
): Promise<SessionView> => {
  const worker = await api.workers.get(workerId)
  if (worker.projectId !== projectId || !worker.connected)
    throw new Error(
      'This worker is unavailable. Wait for it to reconnect before starting a conversation.',
    )
  const session = await api.sessions.create({ projectId, workerId })
  try {
    localStorage.setItem(preferenceKey(projectId), String(workerId))
  } catch (error) {
    console.warn('[sessions] could not remember worker preference', error)
  }
  return session
}
