import { type Attachment, labelAttachments } from '@baton/shared'
import { attachmentSrc } from '../../../api'
import { FileChip, isImage } from './attachment-view'

const RemoveButton = ({ onRemove }: { onRemove: () => void }) => (
  <button
    type="button"
    onClick={onRemove}
    aria-label="remove attachment"
    className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] leading-none text-gray-500 shadow-sm hover:text-gray-800"
  >
    ×
  </button>
)

// Pending attachments inside the input card, above the textarea: image previews
// as thumbnails, other files as labelled chips. Each carries a short {label}
// (image-1, file-1, …); clicking inserts that token into the draft so the user
// can reference it in their text. Each is removable before send.
export const AttachmentStrip = ({
  attachments,
  onRemove,
  onInsertLabel,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
  onInsertLabel: (label: string) => void
}) => {
  const labels = labelAttachments(attachments)
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((att, i) => {
        const label = labels[i] ?? ''
        return (
          <div key={att.id} className="relative">
            <button
              type="button"
              onClick={() => onInsertLabel(label)}
              title={`insert {${label}}`}
              className="block cursor-pointer"
            >
              {isImage(att) ? (
                <span className="relative block h-16 w-16">
                  {/* biome-ignore lint/a11y/useAltText: uploaded screenshot preview */}
                  <img
                    src={attachmentSrc(att)}
                    className="h-16 w-16 rounded border border-gray-200 object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 rounded-b bg-black/55 px-1 py-0.5 text-center font-mono text-[10px] leading-none text-white">
                    {`{${label}}`}
                  </span>
                </span>
              ) : (
                <FileChip att={att} label={label} />
              )}
            </button>
            <RemoveButton onRemove={() => onRemove(att.id)} />
          </div>
        )
      })}
    </div>
  )
}
