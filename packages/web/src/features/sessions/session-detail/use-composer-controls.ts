import type { AgentEffort, Session, SessionView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../../app/api-context'

export type ComposerSettings = Pick<Session, 'planMode' | 'model' | 'effort'>
export type ComposerControls = {
  settings: ComposerSettings
  saving: 'mode' | 'model' | null
  pending: 'resume' | 'abort' | 'clear' | null
  error: string | null
  notice: string | null
  setMode(planMode: boolean): Promise<boolean>
  setModel(model: string | null, effort: AgentEffort | null): Promise<boolean>
  resume(): Promise<boolean>
  abort(): Promise<boolean>
  clear(): Promise<boolean>
  reportError(cause: unknown): void
}

export const useComposerControls = ({
  session,
  onRefresh,
}: {
  session: SessionView | null
  onRefresh(): void
}): ComposerControls => {
  const api = useApi()
  const id = session?.id
  const planMode = session?.planMode ?? false
  const model = session?.model ?? null
  const effort = session?.effort ?? null
  const [settings, setSettings] = useState<ComposerSettings>({ planMode, model, effort })
  const [saving, setSaving] = useState<ComposerControls['saving']>(null)
  const [pending, setPending] = useState<ComposerControls['pending']>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requesting = useRef(false)
  // Activity replays effects when a tab becomes visible; unchanged server values
  // must not replace a configuration already confirmed by a request response.
  const observed = useRef({ id, planMode, model, effort })
  useEffect(() => {
    const previous = observed.current
    if (
      previous.id === id &&
      previous.planMode === planMode &&
      previous.model === model &&
      previous.effort === effort
    )
      return
    observed.current = { id, planMode, model, effort }
    setSettings({ planMode, model, effort })
  }, [id, planMode, model, effort])
  const reportError = (cause: unknown) => {
    setNotice(null)
    setError(cause instanceof Error ? cause.message : String(cause))
  }
  const request = async (
    kind: NonNullable<ComposerControls['saving'] | ComposerControls['pending']>,
    run: (sessionId: number) => Promise<SessionView>,
  ) => {
    if (id === undefined || requesting.current) return false
    requesting.current = true
    setError(null)
    setNotice(null)
    if (kind === 'mode' || kind === 'model') setSaving(kind)
    else setPending(kind)
    try {
      const result = await run(id)
      if (kind === 'mode' || kind === 'model')
        setSettings({ planMode: result.planMode, model: result.model, effort: result.effort })
      else
        setNotice(
          kind === 'resume'
            ? '已请求恢复会话，等待连接。'
            : kind === 'abort'
              ? '已请求停止，等待执行状态更新。'
              : '已请求重置上下文，历史消息和待发送消息会保留。',
        )
      onRefresh()
      return true
    } catch (cause) {
      reportError(cause)
      return false
    } finally {
      requesting.current = false
      setSaving(null)
      setPending(null)
    }
  }
  return {
    settings,
    saving,
    pending,
    error,
    notice,
    reportError,
    setMode: value => request('mode', id => api.sessions.setMode(id, value)),
    setModel: (value, valueEffort) =>
      request('model', id => api.sessions.setModel(id, value?.trim() || null, valueEffort)),
    resume: () => request('resume', api.sessions.resume),
    abort: () => request('abort', api.sessions.abort),
    clear: () => request('clear', api.sessions.clear),
  }
}
