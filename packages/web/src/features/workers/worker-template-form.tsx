import type { CreateWorkerInput, WorkerCreation, WorkerTemplateId } from '@baton/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../../api'
import { SelectControl } from '../../components/select-control'
import { agentKindLabel } from '../../utils/agent-kind'
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

const providerLabels: Partial<Record<WorkerTemplateId, string>> = {
  'mini-glm-codeplan': '智谱 GLM',
  'mini-dashscope-codeplan': 'DashScope',
  'mini-codex': 'OpenAI',
}

export const WorkerTemplateForm = ({ setup, initialInput, onCreated }: Props) => {
  const fieldId = useId()
  const nameInput = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => nameInput.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  const [name, setName] = useState(initialInput?.name ?? '')
  const [selection, setSelection] = useState(
    initialInput ? `${initialInput.templateId}:${initialInput.agentKind}` : null,
  )
  const templates = setup.templates.data ?? []
  const options = (['claude-code', 'pi', 'codex'] as const).flatMap(agentKind =>
    templates
      .filter(template => template.agentKinds.includes(agentKind))
      .map(template => ({
        value: `${template.id}:${agentKind}`,
        label: `${agentKindLabel[agentKind]} · ${providerLabels[template.id] ?? template.name}`,
        template,
        agentKind,
      })),
  )
  const selected =
    options.find(option => option.value === selection) ??
    options.find(option => option.agentKind === initialInput?.agentKind) ??
    options[0]
  const disabled =
    setup.creating ||
    setup.templates.loading ||
    !!setup.templates.error ||
    !selected?.template.available ||
    !name.trim()
  const submit = async () => {
    if (disabled || !selected) return
    const creation = await setup.create({
      templateId: selected.template.id,
      name: name.trim(),
      agentKind: selected.agentKind,
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
      <label className="mg-field" htmlFor={`${fieldId}-configuration`}>
        配置
        <SelectControl
          id={`${fieldId}-configuration`}
          value={selected?.value ?? ''}
          onChange={event => setSelection(event.target.value)}
          disabled={setup.creating || options.length === 0}
          className="w-full"
        >
          {options.length === 0 && (
            <option value="">{setup.templates.loading ? '加载配置…' : '暂无可用配置'}</option>
          )}
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectControl>
      </label>
      {setup.templates.error ? (
        <p role="alert" className="text-xs text-ui-danger break-words">
          无法刷新配置。 {setup.templates.error.message}{' '}
          <button type="button" onClick={setup.refresh} className="underline">
            刷新
          </button>
        </p>
      ) : (
        !setup.templates.loading &&
        !selected?.template.available && (
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
