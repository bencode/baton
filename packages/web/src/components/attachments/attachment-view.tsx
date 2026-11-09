import { type Attachment, isImageAttachment } from '@baton/shared'
import { attachmentSrc } from '../../api'

// Attachment presentation for the sent message bubble.

// Re-export the shared predicate under the local name kept by call sites.
export const isImage = isImageAttachment

const LabelTag = ({ label }: { label: string }) => (
  <span className="font-mono text-[10px] text-gray-400">{`{${label}}`}</span>
)

// Non-image file shown as a download-link chip. `label` prefixes the {file-N}
// reference token.
export const FileChip = ({ att, label }: { att: Attachment; label?: string }) => (
  <a
    href={attachmentSrc(att)}
    download={att.filename}
    className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
  >
    {label && <LabelTag label={label} />}
    <span aria-hidden>📄</span>
    <span className="max-w-[16rem] truncate">{att.filename}</span>
  </a>
)
