import type { Attachment } from '@baton/shared'
import { attachmentSrc } from '../../../api'

// Shared attachment presentation, used by both the composer's pending strip and
// the sent message bubble so the image-vs-file decision and chip styling live
// in one place.

export const isImage = (att: Attachment): boolean => att.contentType.startsWith('image/')

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Non-image file shown as a chip: a download link in the transcript bubble,
// a static labelled box (with size) in the composer where a remove × is added
// by the caller's wrapper.
export const FileChip = ({ att, download }: { att: Attachment; download?: boolean }) =>
  download ? (
    <a
      href={attachmentSrc(att)}
      download={att.filename}
      className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
    >
      <span aria-hidden>📄</span>
      <span className="max-w-[16rem] truncate">{att.filename}</span>
    </a>
  ) : (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
      <span aria-hidden>📄</span>
      <span className="max-w-[12rem] truncate text-xs text-gray-700">{att.filename}</span>
      <span className="font-mono text-[10px] text-gray-400">{formatBytes(att.size)}</span>
    </div>
  )
