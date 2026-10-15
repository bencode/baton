import type { CreateWorkerInput, WorkerCreation } from '@baton/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../../api'
import type { WorkerSetupState } from './use-worker-setup'

export const createErrorText = (error: Error): string => {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return 'This name is already in use. Check workers and creation records, or choose another name.'
    if (error.status === 503)
      return 'The mini is unavailable. Try later or register an existing worker.'
    if (error.status === 401) return 'Your sign-in has expired. Sign in again before continuing.'
    if (error.status === 404)
      return 'This project is unavailable. Select an existing project before continuing.'
  }
  return 'The request could not be confirmed. Refresh creation records before submitting again; it may already have been accepted.'
}

type Props = {
  setup: WorkerSetupState
  initialInput?: CreateWorkerInput
  onCreated(creation: WorkerCreation): void
}

export const WorkerTemplateForm = ({ setup, initialInput, onCreated }: Props) => {
  const fieldId = useId()
  const nameInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => nameInput.current?.focus(), [])
  const [name, setName] = useState(initialInput?.name ?? '')
  const [agentKind, setAgentKind] = useState(initialInput?.agentKind ?? 'claude-code')
  const template = setup.templates.data?.find(item => item.id === 'mini-local')
  const agent = template?.agentKinds.includes(agentKind) ? agentKind : template?.agentKinds[0]
  const disabled =
    setup.creating ||
    setup.templates.loading ||
    !!setup.templates.error ||
    !template?.available ||
    !agent ||
    !name.trim()
  const submit = async () => {
    if (disabled || !template || !agent) return
    const creation = await setup.create({
      templateId: template.id,
      name: name.trim(),
      agentKind: agent,
    })
    if (creation) onCreated(creation)
  }
  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-xs text-ui-muted">
        Create a local Git repository and a worker on the mini. A remote repository is optional and
        can be added later.
      </p>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${fieldId}-name`}>
        Worker name
        <input
          id={`${fieldId}-name`}
          ref={nameInput}
          required
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={setup.creating}
          className="ui-input w-full"
          placeholder="e.g. my-app"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${fieldId}-template`}>
        Template
        <select
          id={`${fieldId}-template`}
          value={template?.id ?? ''}
          disabled
          className="ui-input w-full bg-ui-panel"
        >
          <option value={template?.id ?? ''}>
            {template?.name ??
              (setup.templates.loading ? 'Loading templates…' : 'No template available')}
          </option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${fieldId}-agent`}>
        Agent
        <select
          id={`${fieldId}-agent`}
          value={agent ?? ''}
          onChange={event => {
            const selected = template?.agentKinds.find(kind => kind === event.target.value)
            if (selected) setAgentKind(selected)
          }}
          disabled={setup.creating || !agent}
          className="ui-input w-full"
        >
          {!agent && <option value="">No agent available</option>}
          {template?.agentKinds.map(kind => (
            <option key={kind} value={kind}>
              {kind === 'codex' ? 'Codex' : 'Claude Code'}
            </option>
          ))}
        </select>
      </label>
      {setup.templates.error ? (
        <p role="alert" className="text-xs text-ui-danger break-words">
          Templates could not be refreshed. {setup.templates.error.message}{' '}
          <button type="button" onClick={setup.refresh} className="underline">
            Refresh
          </button>
        </p>
      ) : (
        !setup.templates.loading &&
        !template?.available && (
          <p className="text-xs text-ui-warning">
            The mini is unavailable. Try later or use Register existing.{' '}
            <button type="button" onClick={setup.refresh} className="underline">
              Refresh
            </button>
          </p>
        )
      )}
      {setup.createError && (
        <p role="alert" className="text-xs text-ui-danger">
          {createErrorText(setup.createError)}{' '}
          <button type="button" onClick={setup.refresh} className="underline">
            Refresh records
          </button>
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={disabled} className="ui-button ui-primary">
          {setup.creating ? 'Submitting…' : 'Create worker'}
        </button>
        {setup.creating && (
          <span className="text-xs text-ui-muted" aria-live="polite">
            You can close this window.
          </span>
        )}
      </div>
    </form>
  )
}
