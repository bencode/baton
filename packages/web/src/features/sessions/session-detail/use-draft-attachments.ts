import type { Attachment, Id } from '@baton/shared'
import { useRef, useState } from 'react'
import { useApi } from '../../../app/api-context'
import { renamePasted } from '../../../utils/attachment'

export type DraftAttachment =
  | { key: string; status: 'uploading'; file: File }
  | { key: string; status: 'failed'; file: File; error: string }
  | { key: string; status: 'ready'; attachment: Attachment }

export type DraftAttachments = {
  items: readonly DraftAttachment[]
  addFiles(files: readonly File[]): Promise<void>
  retry(key: string): Promise<void>
  remove(key: string): void
  consume(keys: readonly string[]): void
}

export const useDraftAttachments = (sessionId: Id): DraftAttachments => {
  const api = useApi()
  const [items, setItems] = useState<readonly DraftAttachment[]>([])
  const current = useRef(items)
  const update = (transform: (rows: readonly DraftAttachment[]) => readonly DraftAttachment[]) => {
    current.current = transform(current.current)
    setItems(current.current)
  }
  const upload = async (row: Extract<DraftAttachment, { status: 'uploading' }>) => {
    try {
      const attachment = await api.sessions.uploadAttachment(sessionId, row.file)
      update(rows =>
        rows.map(item =>
          item.key === row.key ? { key: row.key, status: 'ready', attachment } : item,
        ),
      )
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause)
      if (!current.current.some(item => item.key === row.key)) console.error('附件上传失败', cause)
      update(rows =>
        rows.map(item => (item.key === row.key ? { ...row, status: 'failed', error } : item)),
      )
    }
  }
  return {
    items,
    addFiles: async files => {
      const batch = files.map(
        (file, index): Extract<DraftAttachment, { status: 'uploading' }> => ({
          key: crypto.randomUUID(),
          status: 'uploading',
          file: file.name ? file : renamePasted(file, index),
        }),
      )
      update(rows => [...rows, ...batch])
      await Promise.all(batch.map(upload))
    },
    retry: async key => {
      const item = current.current.find(row => row.key === key)
      if (item?.status !== 'failed') return
      const row = { key, status: 'uploading' as const, file: item.file }
      update(rows => rows.map(item => (item.key === key ? row : item)))
      await upload(row)
    },
    remove: key => update(rows => rows.filter(row => row.key !== key)),
    consume: keys => update(rows => rows.filter(row => !keys.includes(row.key))),
  }
}
