import { type Attachment, isImageAttachment } from '@baton/shared'
import { attachmentSrc } from '../../api'

// Shared attachment presentation, used by the composer's pending strip and the
// sent message bubble (sessions + channels) so the image-vs-file decision and
// chip styling live in one place. `src` resolves an Attachment to a fetchable
// URL — defaults to the cookie-authed session path; channels pass a token-bearing
// one (capability auth, no cookie).

// Re-export the shared predicate under the local name kept by call sites.
export const isImage = isImageAttachment

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const LabelTag = ({ label }: { label: string }) => (
  <span className="font-mono text-[10px] text-gray-400">{`{${label}}`}</span>
)

// Non-image file shown as a chip: a download link in the transcript bubble,
// a static labelled box (with size) in the composer where a remove × is added
// by the caller's wrapper. `label` prefixes the {file-N} reference token.
export const FileChip = ({
  att,
  download,
  label,
  src = attachmentSrc,
}: {
  att: Attachment
  download?: boolean
  label?: string
  src?: (att: Attachment) => string
}) =>
  download ? (
    <a
      href={src(att)}
      download={att.filename}
      className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
    >
      {label && <LabelTag label={label} />}
      <span aria-hidden>📄</span>
      <span className="max-w-[16rem] truncate">{att.filename}</span>
    </a>
  ) : (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
      {label && <LabelTag label={label} />}
      <span aria-hidden>📄</span>
      <span className="max-w-[12rem] truncate text-xs text-gray-700">{att.filename}</span>
      <span className="font-mono text-[10px] text-gray-400">{formatBytes(att.size)}</span>
    </div>
  )
