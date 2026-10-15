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
      title={view.kind === 'add' ? 'Add a worker' : 'Worker creation'}
      onClose={onClose}
      className="max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
    >
      <div className="flex flex-col gap-4">
        {setup.creations.error && (
          <p role="alert" className="text-xs text-amber-700 break-words">
            Creation records could not be refreshed. Displayed progress may be out of date.{' '}
            <button type="button" onClick={setup.refresh} className="underline">
              Refresh records
            </button>
          </p>
        )}
        {view.kind === 'add' ? (
          <>
            <div className="flex gap-2">
              {(['template', 'register'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={setup.creating}
                  onClick={() => setMode(value)}
                  className={`rounded-md border px-3 py-1.5 text-xs disabled:opacity-50 ${mode === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  {value === 'template' ? 'From template' : 'Register existing'}
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
          <div className="flex flex-col gap-3 text-xs text-gray-500">
            <p>
              {setup.creations.loading
                ? 'Loading creation record…'
                : 'This creation record is unavailable.'}
            </p>
            <button type="button" onClick={setup.refresh} className="w-fit underline">
              Refresh records
            </button>
            <button
              type="button"
              onClick={() =>
                onCreateAnother({ templateId: 'mini-local', name: '', agentKind: 'claude-code' })
              }
              className="w-fit underline"
            >
              Add a worker
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
