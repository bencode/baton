import type { CreateWorkerInput, WorkerCreation } from '@baton/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../../api'
import { SelectControl } from '../../components/select-control'
import type { WorkerSetupState } from './use-worker-setup'

export const createErrorText = (error: Error): string => {
  if (error instanceof ApiError) {
    if (error.status === 409) return '名称已被占用，请检查已有执行环境，或换一个名称。'
    if (error.status === 503) return 'mini 暂时不可用，请稍后重试或注册已有环境。'
    if (error.status === 401) return '登录已失效，请重新登录后继续。'
    if (error.status === 404) return '此项目不可用，请选择其他项目后继续。'
  }
  return '暂时无法确认请求结果，系统可能已接受此次创建。请先刷新状态，确认后再提交。'
}

type Props = {
  setup: WorkerSetupState
  initialInput?: CreateWorkerInput
  onCreated(creation: WorkerCreation): void
}

export const WorkerTemplateForm = ({ setup, initialInput, onCreated }: Props) => {
  const fieldId = useId()
  const nameInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => nameInput.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
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
      className="mg-form"
    >
      <p className="text-xs leading-5 text-ui-muted">
        在 mini 上创建本地 Git 仓库和执行环境，远程仓库可稍后绑定。
      </p>
      <label className="mg-field" htmlFor={`${fieldId}-name`}>
        名称
        <input
          id={`${fieldId}-name`}
          ref={nameInput}
          required
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={setup.creating}
          className="ui-input w-full"
          placeholder="例如 my-app"
        />
      </label>
      <label className="mg-field" htmlFor={`${fieldId}-template`}>
        模板
        <SelectControl
          id={`${fieldId}-template`}
          value={template?.id ?? ''}
          disabled
          className="w-full"
        >
          <option value={template?.id ?? ''}>
            {template?.name ?? (setup.templates.loading ? '加载模板…' : '暂无可用模板')}
          </option>
        </SelectControl>
      </label>
      <label className="mg-field" htmlFor={`${fieldId}-agent`}>
        Agent
        <SelectControl
          id={`${fieldId}-agent`}
          value={agent ?? ''}
          onChange={event => {
            const selected = template?.agentKinds.find(kind => kind === event.target.value)
            if (selected) setAgentKind(selected)
          }}
          disabled={setup.creating || !agent}
          className="w-full"
        >
          {!agent && <option value="">暂无可用 Agent</option>}
          {template?.agentKinds.map(kind => (
            <option key={kind} value={kind}>
              {kind === 'codex' ? 'Codex' : 'Claude Code'}
            </option>
          ))}
        </SelectControl>
      </label>
      {setup.templates.error ? (
        <p role="alert" className="text-xs text-ui-danger break-words">
          无法刷新模板。 {setup.templates.error.message}{' '}
          <button type="button" onClick={setup.refresh} className="underline">
            刷新
          </button>
        </p>
      ) : (
        !setup.templates.loading &&
        !template?.available && (
          <p className="text-xs text-ui-warning">
            mini 暂时不可用，请稍后重试或切换到“注册已有环境”。{' '}
            <button type="button" onClick={setup.refresh} className="underline">
              刷新
            </button>
          </p>
        )
      )}
      {setup.createError && (
        <p role="alert" className="text-xs text-ui-danger">
          {createErrorText(setup.createError)}{' '}
          <button type="button" onClick={setup.refresh} className="underline">
            刷新状态
          </button>
        </p>
      )}
      <div className="mg-form-actions">
        <button type="submit" disabled={disabled} className="ui-button ui-primary">
          {setup.creating ? '提交中…' : '创建执行环境'}
        </button>
        {setup.creating && (
          <span className="text-xs leading-5 text-ui-muted" aria-live="polite">
            可以关闭窗口，创建将在后台继续。
          </span>
        )}
      </div>
    </form>
  )
}
