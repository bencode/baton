import type { AgentEffort, AgentKind } from '@baton/shared'
import { useId, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from '../../../components/icons'
import { Popover } from '../../../components/popover'
import { modelPresets } from './commands'
import { EffortIcon, ExecuteIcon, PlanIcon } from './icons'
import type { ComposerControls } from './use-composer-controls'

const effortNames: Record<AgentEffort, string> = {
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最高',
}

const ModelForm = ({
  agentKind,
  controls,
  onClose,
}: {
  agentKind: AgentKind
  controls: ComposerControls
  onClose(): void
}) => {
  const presets = modelPresets(agentKind)
  const initialModel = controls.settings.model
  const group = useId()
  const customId = useId()
  const [choice, setChoice] = useState(
    initialModel === null ? 'default' : presets.includes(initialModel) ? initialModel : 'custom',
  )
  const [custom, setCustom] = useState(
    initialModel && !presets.includes(initialModel) ? initialModel : '',
  )
  const saving = controls.saving !== null || controls.pending !== null
  return (
    <form
      className="composer-model-form"
      onSubmit={event => {
        event.preventDefault()
        const model = choice === 'default' ? null : choice === 'custom' ? custom.trim() : choice
        if (choice === 'custom' && !model) return
        void controls.setModel(model, controls.settings.effort).then(ok => {
          if (ok) onClose()
        })
      }}
    >
      <h2>选择模型</h2>
      <p className="composer-popup-description">用于接下来发送的消息，已排队的消息不变。</p>
      <fieldset disabled={saving}>
        <legend className="sr-only">模型</legend>
        {[
          { value: 'default', label: '默认模型' },
          ...presets.map(value => ({ value, label: value })),
          { value: 'custom', label: '自定义' },
        ].map(option => (
          <label className="composer-model-option" key={option.value}>
            <input
              type="radio"
              name={group}
              value={option.value}
              checked={choice === option.value}
              onChange={() => setChoice(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        <label htmlFor={customId} className="composer-custom-label">
          自定义模型 ID
        </label>
        <input
          id={customId}
          className="ui-input"
          value={custom}
          onFocus={() => setChoice('custom')}
          onChange={event => {
            setChoice('custom')
            setCustom(event.target.value)
          }}
          placeholder="输入服务支持的模型 ID"
          autoComplete="off"
        />
      </fieldset>
      <p className="composer-popup-note">模型是否可用由当前 Agent 服务决定。</p>
      {controls.error && (
        <p className="composer-feedback error" role="alert">
          {controls.error}
        </p>
      )}
      <div className="composer-popup-actions">
        <button
          className="ui-quiet-button"
          type="button"
          disabled={saving}
          onClick={() =>
            void controls.setModel(null, null).then(ok => {
              if (ok) onClose()
            })
          }
        >
          恢复默认
        </button>
        <button
          className="ui-button ui-primary"
          type="submit"
          disabled={saving || (choice === 'custom' && !custom.trim())}
        >
          {saving ? '保存中…' : '应用'}
        </button>
      </div>
    </form>
  )
}

export const ComposerOptions = ({
  agentKind,
  controls,
  disabled,
}: {
  agentKind: AgentKind
  controls: ComposerControls
  disabled: boolean
}) => {
  const [popup, setPopup] = useState<{
    kind: 'mode' | 'model' | 'effort'
    anchor: HTMLElement
  } | null>(null)
  const { planMode, model, effort } = controls.settings
  const close = () => setPopup(null)
  const saving = disabled || controls.saving !== null || controls.pending !== null
  const toggle = (kind: NonNullable<typeof popup>['kind'], anchor: HTMLElement) =>
    setPopup(current => (current?.kind === kind ? null : { kind, anchor }))
  return (
    <>
      <button
        type="button"
        className="composer-option composer-mode-trigger"
        data-selected={planMode}
        disabled={saving}
        aria-label={`工作模式：${planMode ? '规划' : '执行'}`}
        aria-haspopup="menu"
        aria-expanded={popup?.kind === 'mode'}
        onClick={event => toggle('mode', event.currentTarget)}
      >
        {planMode ? <PlanIcon /> : <ExecuteIcon />}
        <span>{planMode ? '规划' : '执行'}</span>
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        className="composer-option composer-model-trigger"
        disabled={saving}
        aria-label={`选择模型：${model ?? '默认模型'}`}
        title={model ?? '默认模型'}
        aria-haspopup="dialog"
        aria-expanded={popup?.kind === 'model'}
        onClick={event => toggle('model', event.currentTarget)}
      >
        <span>{model ?? '默认模型'}</span>
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        className="composer-option composer-effort-trigger"
        disabled={saving}
        aria-label={`思考强度：${effort ? effortNames[effort] : '默认'}`}
        aria-haspopup="menu"
        aria-expanded={popup?.kind === 'effort'}
        onClick={event => toggle('effort', event.currentTarget)}
      >
        <EffortIcon />
        <span>{effort ? effortNames[effort] : '默认'}</span>
        <ChevronDownIcon />
      </button>
      {popup && (
        <Popover
          anchor={popup.anchor}
          role={popup.kind === 'model' ? 'dialog' : 'menu'}
          label={
            popup.kind === 'mode' ? '工作模式' : popup.kind === 'model' ? '模型设置' : '思考强度'
          }
          placement="top-start"
          onClose={close}
          className={`composer-popup composer-${popup.kind}-popup`}
        >
          {popup.kind === 'model' && (
            <ModelForm agentKind={agentKind} controls={controls} onClose={close} />
          )}
          {popup.kind === 'mode' && (
            <>
              <h2>工作模式</h2>
              {[false, true].map(value => (
                <button
                  key={String(value)}
                  type="button"
                  role="menuitemradio"
                  aria-checked={planMode === value}
                  disabled={saving}
                  className="composer-mode-choice"
                  onClick={() =>
                    void controls.setMode(value).then(ok => {
                      if (ok) close()
                    })
                  }
                >
                  {value ? <PlanIcon /> : <ExecuteIcon />}
                  <span>
                    <strong>{value ? '规划' : '执行'}</strong>
                    <small>
                      {value ? '只读分析与讨论，不修改文件。' : '按指令完成任务，可以修改文件。'}
                    </small>
                  </span>
                  {planMode === value && <CheckIcon />}
                </button>
              ))}
              <p className="composer-popup-note">Shift+Tab 切换 · 已排队的消息不变</p>
              {controls.error && (
                <p className="composer-feedback error" role="alert">
                  {controls.error}
                </p>
              )}
            </>
          )}
          {popup.kind === 'effort' && (
            <>
              <h2>思考强度</h2>
              {([null, 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const).map(value => (
                <button
                  key={value ?? 'default'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={effort === value}
                  disabled={saving}
                  className="composer-effort-choice"
                  onClick={() =>
                    void controls.setModel(model, value).then(ok => {
                      if (ok) close()
                    })
                  }
                >
                  <span>{value ? `${effortNames[value]} · ${value}` : '默认'}</span>
                  {effort === value && <CheckIcon />}
                </button>
              ))}
              {controls.error && (
                <p className="composer-feedback error" role="alert">
                  {controls.error}
                </p>
              )}
            </>
          )}
        </Popover>
      )}
    </>
  )
}
