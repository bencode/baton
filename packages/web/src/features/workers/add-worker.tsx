import type { CreateWorkerInput, Id, WorkerCreation } from '@baton/shared'
import { useState } from 'react'
import { Modal } from '../../components/modal'
import { RegisterWorkerGuide } from './register-worker-guide'
import type { WorkerSetupState } from './use-worker-setup'
import { WorkerCreationProgress } from './worker-creation-progress'
import { WorkerTemplateForm } from './worker-template-form'

export type WorkerDialogView =
  | { kind: 'add'; initialInput?: CreateWorkerInput }
  | { kind: 'creation'; creationId: Id }

type AddWorkerProps = {
  projectId: Id
  view: WorkerDialogView
  setup: WorkerSetupState
  onCreated(creation: WorkerCreation): void
  onCreateAnother(input: CreateWorkerInput): void
  onStartConversation(workerId: Id): Promise<void>
  onClose(): void
}

export const AddWorker = ({
  projectId,
  view,
  setup,
  onCreated,
  onCreateAnother,
  onStartConversation,
  onClose,
}: AddWorkerProps) => {
  const [mode, setMode] = useState<'template' | 'register'>('template')
  const creation =
    view.kind === 'creation'
      ? setup.creations.data?.find(item => item.id === view.creationId)
      : null
  return (
    <Modal
      title={view.kind === 'add' ? '添加执行环境' : '创建执行环境'}
      onClose={onClose}
      className="mg-dialog"
    >
      <div className="flex flex-col gap-6">
        {setup.creations.error && (
          <p role="alert" className="text-xs text-ui-warning break-words">
            暂时无法更新创建进度，请刷新后查看最新状态。{' '}
            <button type="button" onClick={setup.refresh} className="underline">
              刷新状态
            </button>
          </p>
        )}
        {view.kind === 'add' ? (
          <>
            <div className="mg-methods">
              {(['template', 'register'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={setup.creating}
                  onClick={() => setMode(value)}
                  className="ui-quiet-button"
                >
                  {value === 'template' ? '使用已有机器' : '连接自己的机器'}
                </button>
              ))}
            </div>
            {mode === 'template' ? (
              <WorkerTemplateForm
                setup={setup}
                initialInput={view.initialInput}
                onCreated={onCreated}
              />
            ) : (
              <RegisterWorkerGuide projectId={projectId} />
            )}
          </>
        ) : creation ? (
          <WorkerCreationProgress
            key={creation.id}
            creation={creation}
            onCreateAnother={onCreateAnother}
            onStartConversation={onStartConversation}
          />
        ) : (
          <div className="flex flex-col gap-3 text-xs text-ui-muted">
            <p>{setup.creations.loading ? '正在获取创建进度…' : '暂时无法获取此次创建进度。'}</p>
            <button type="button" onClick={setup.refresh} className="w-fit underline">
              刷新状态
            </button>
            <button
              type="button"
              onClick={() =>
                onCreateAnother({
                  templateId: 'mini-glm-codeplan',
                  name: '',
                  agentKind: 'claude-code',
                })
              }
              className="w-fit underline"
            >
              添加执行环境
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
