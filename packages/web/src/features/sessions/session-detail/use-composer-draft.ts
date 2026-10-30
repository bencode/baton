import type { Id, SubmitInputResult } from '@baton/shared'
import { useRef, useState } from 'react'
import { useApi } from '../../../app/api-context'
import type { DraftAttachments } from './use-draft-attachments'

export type ComposerDraft = {
  text: string
  setText(text: string): void
  sending: boolean
  canSend: boolean
  error: string | null
  submit(): Promise<boolean>
  clearIfUnchanged(submittedText: string): void
}

export const useComposerDraft = ({
  sessionId,
  attachments,
  canSubmit,
  resumeBeforeSend,
  onSubmitted,
}: {
  sessionId: Id
  attachments: DraftAttachments
  canSubmit: boolean
  resumeBeforeSend: boolean
  onSubmitted(result: SubmitInputResult): void
}): ComposerDraft => {
  const api = useApi()
  const [text, setTextState] = useState('')
  const currentText = useRef(text)
  const inFlight = useRef(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setText = (value: string) => {
    currentText.current = value
    setTextState(value)
  }
  const clearIfUnchanged = (submittedText: string) => {
    if (currentText.current === submittedText) setText('')
  }
  const canSend =
    canSubmit &&
    !sending &&
    attachments.items.every(item => item.status === 'ready') &&
    (text.trim().length > 0 || attachments.items.length > 0)
  const submit = async () => {
    if (!canSend || inFlight.current) return false
    const submittedText = currentText.current
    const ready = attachments.items.flatMap(item => (item.status === 'ready' ? [item] : []))
    inFlight.current = true
    setSending(true)
    setError(null)
    let failed = '发送失败'
    try {
      // A stopped session is paused: the server would queue the message but never
      // run it, so un-pause first. An idle-reaped session restarts on send alone.
      if (resumeBeforeSend) {
        failed = '恢复会话失败'
        await api.sessions.resume(sessionId)
        failed = '发送失败'
      }
      const result = await api.sessions.sendMessage(
        sessionId,
        submittedText.trim(),
        ready.map(item => item.attachment),
      )
      clearIfUnchanged(submittedText)
      attachments.consume(ready.map(item => item.key))
      onSubmitted(result)
      return true
    } catch (cause) {
      setError(`${failed}，草稿已保留。${cause instanceof Error ? cause.message : String(cause)}`)
      return false
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  return { text, setText, sending, canSend, error, submit, clearIfUnchanged }
}
