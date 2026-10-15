import type { CreateWorkerInput, Id, WorkerCreation, WorkerTemplate } from '@baton/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import type { AsyncState } from '../../hooks/use-async'
import { subscribeProject } from '../projects/project-stream'

export type WorkerSetupState = {
  templates: AsyncState<WorkerTemplate[]>
  creations: AsyncState<WorkerCreation[]>
  creating: boolean
  createError: Error | null
  refresh(): void
  create(input: CreateWorkerInput): Promise<WorkerCreation | null>
}

const initial = <T>(): AsyncState<T> => ({ data: null, loading: true, error: null })
const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

export const useWorkerSetup = (projectId: Id): WorkerSetupState => {
  const api = useApi()
  const [templates, setTemplates] = useState(initial<WorkerTemplate[]>)
  const [creations, setCreations] = useState(initial<WorkerCreation[]>)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<Error | null>(null)
  const lifecycle = useRef<{ alive: boolean } | null>(null)
  const reload = useRef<(() => void) | null>(null)
  const refresh = useCallback(() => reload.current?.(), [])

  useEffect(() => {
    const current = { alive: true }
    lifecycle.current = current
    let templateSequence = 0
    let creationSequence = 0
    let templatePending = false
    let creationPending = false
    setTemplates(initial())
    setCreations(initial())
    setCreating(false)
    setCreateError(null)
    const loadTemplates = async () => {
      templatePending = true
      const sequence = ++templateSequence
      try {
        const data = await api.workerCreations.templates(projectId)
        if (current.alive && sequence === templateSequence)
          setTemplates({ data, loading: false, error: null })
      } catch (error) {
        console.error('[worker-setup] templates failed', error)
        if (current.alive && sequence === templateSequence)
          setTemplates(state => ({ ...state, loading: false, error: asError(error) }))
      } finally {
        if (sequence === templateSequence) templatePending = false
      }
    }
    const loadCreations = async () => {
      creationPending = true
      const sequence = ++creationSequence
      try {
        const data = await api.workerCreations.listByProject(projectId)
        if (current.alive && sequence === creationSequence)
          setCreations({ data, loading: false, error: null })
      } catch (error) {
        console.error('[worker-setup] creations failed', error)
        if (current.alive && sequence === creationSequence)
          setCreations(state => ({ ...state, loading: false, error: asError(error) }))
      } finally {
        if (sequence === creationSequence) creationPending = false
      }
    }
    const load = () => {
      void loadTemplates()
      void loadCreations()
    }
    reload.current = load
    load()
    const unsubscribe = subscribeProject(projectId, 'worker-creations', load)
    const timer = window.setInterval(() => {
      if (!templatePending) void loadTemplates()
      if (!creationPending) void loadCreations()
    }, 5000)
    return () => {
      current.alive = false
      reload.current = null
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [api, projectId])

  const create = useCallback(
    async (input: CreateWorkerInput) => {
      const current = lifecycle.current
      setCreating(true)
      setCreateError(null)
      try {
        const creation = await api.workerCreations.create(projectId, input)
        if (!current?.alive) return null
        setCreations(state => ({
          ...state,
          data: [...(state.data ?? []).filter(item => item.id !== creation.id), creation],
        }))
        refresh()
        return creation
      } catch (error) {
        console.error('[worker-setup] create failed', error)
        if (current?.alive) {
          setCreateError(asError(error))
          refresh()
        }
        return null
      } finally {
        if (current?.alive) setCreating(false)
      }
    },
    [api, projectId, refresh],
  )

  return { templates, creations, creating, createError, refresh, create }
}
