import { labelAttachments } from '@baton/shared'
import { useEffect, useState } from 'react'
import { attachmentSrc } from '../../../api'
import { CloseIcon } from '../../../components/icons'
import { FileIcon, RetryIcon, Spinner } from './icons'
import type { DraftAttachment } from './use-draft-attachments'

const PendingPreview = ({ file }: { file: File }) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file.type.startsWith('image/')) return
    const source = URL.createObjectURL(file)
    setUrl(source)
    return () => URL.revokeObjectURL(source)
  }, [file])
  return url ? <img src={url} alt="" /> : <FileIcon />
}

export const ComposerAttachments = ({
  items,
  disabled,
  onRemove,
  onRetry,
  onInsertLabel,
}: {
  items: readonly DraftAttachment[]
  disabled: boolean
  onRemove(key: string): void
  onRetry(key: string): void
  onInsertLabel(label: string): void
}) => {
  if (!items.length) return null
  const labels = labelAttachments(
    items.map(item => ({
      contentType: item.status === 'ready' ? item.attachment.contentType : item.file.type,
    })),
  )
  return (
    <ul className="composer-attachments" aria-label="待发送附件">
      {items.map((item, index) => {
        const filename = item.status === 'ready' ? item.attachment.filename : item.file.name
        const label = labels[index] ?? ''
        return (
          <li key={item.key} className="composer-attachment" data-status={item.status}>
            <span className="composer-attachment-preview">
              {item.status !== 'ready' ? (
                <PendingPreview file={item.file} />
              ) : item.attachment.contentType.startsWith('image/') ? (
                <img src={attachmentSrc(item.attachment)} alt="" />
              ) : (
                <FileIcon />
              )}
            </span>
            <button
              type="button"
              className="composer-attachment-name"
              disabled={disabled || item.status !== 'ready'}
              title={item.status === 'ready' ? `引用 {${label}} · ${filename}` : filename}
              onClick={() => onInsertLabel(label)}
            >
              <strong>{filename}</strong>
              <small>
                {item.status === 'uploading'
                  ? '上传中…'
                  : item.status === 'failed'
                    ? '上传失败'
                    : `{${label}} · 点击引用`}
              </small>
            </button>
            {item.status === 'uploading' && <Spinner />}
            {item.status === 'failed' && (
              <button
                type="button"
                className="composer-icon-button"
                aria-label={`重试上传 ${filename}`}
                title={item.error}
                disabled={disabled}
                onClick={() => onRetry(item.key)}
              >
                <RetryIcon />
              </button>
            )}
            <button
              type="button"
              className="composer-icon-button"
              aria-label={`移除附件 ${filename}`}
              disabled={disabled}
              onClick={() => onRemove(item.key)}
            >
              <CloseIcon />
            </button>
            {item.status === 'failed' && (
              <details className="composer-attachment-error">
                <summary>查看失败原因</summary>
                <p role="alert">{item.error}</p>
              </details>
            )}
          </li>
        )
      })}
    </ul>
  )
}
