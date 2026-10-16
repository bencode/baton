import type { Id, PendingInput } from '@baton/shared'
import { ChevronDownIcon, TrashIcon } from '../../../components/icons'

type QueuedMessagesProps = {
  queued: PendingInput[]
  cancelling: ReadonlySet<Id>
  error: string | null
  onCancel(inputId: Id): void
}

export const QueuedMessages = ({ queued, cancelling, error, onCancel }: QueuedMessagesProps) => {
  if (!queued.length && !error) return null
  return (
    <div className="composer-queue">
      {queued.length > 0 && (
        <details>
          <summary>
            <ChevronDownIcon />
            <span>待发送 · {queued.length}</span>
            <span className="composer-queue-preview">{queued[0]?.text || '附件消息'}</span>
          </summary>
          <ul aria-label="待发送消息">
            {queued.map(item => (
              <li key={item.id}>
                <div>
                  <p className="composer-queued-text">{item.text || '附件消息'}</p>
                  <small className="composer-queue-metadata">
                    {item.planMode ? '规划' : '执行'} · {item.model ?? '默认模型'} ·{' '}
                    {item.effort ?? '默认强度'}
                    {item.attachments.length + item.images.length > 0
                      ? ` · ${item.attachments.length + item.images.length} 个附件`
                      : ''}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={`撤回待发送消息：${item.text || '附件消息'}`}
                  className="composer-icon-button"
                  disabled={cancelling.has(item.id)}
                  onClick={() => onCancel(item.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="composer-feedback error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
