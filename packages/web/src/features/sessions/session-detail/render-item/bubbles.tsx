import { type Attachment, labelAttachments } from '@baton/shared'
import { attachmentSrc } from '../../../../api'
import { FileChip, isImage } from '../../../../components/attachments/attachment-view'
import { Markdown } from '../../../../components/markdown'

// Sent attachments echo the same {label} the user saw in the composer, so a
// "{image-1}" reference in the text lines up with the thumbnail below it.
const SentAttachments = ({ attachments }: { attachments: Attachment[] }) => {
  const labels = labelAttachments(attachments)
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att, i) => {
        const label = labels[i] ?? ''
        return isImage(att) ? (
          <figure key={att.id} className="m-0">
            {/* biome-ignore lint/a11y/useAltText: uploaded image, filename is the closest caption */}
            <img
              src={attachmentSrc(att)}
              className="max-h-80 max-w-full rounded border border-gray-200"
            />
            <figcaption className="mt-0.5 font-mono text-[10px] text-gray-400">
              {`{${label}}`}
            </figcaption>
          </figure>
        ) : (
          <FileChip key={att.id} att={att} download label={label} />
        )
      })}
    </div>
  )
}

export const UserBubble = ({
  text,
  images,
  attachments,
}: {
  text: string
  images?: string[]
  attachments?: Attachment[]
}) => (
  <div className="min-w-0 max-w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
    <span className="mr-2 font-mono text-xs text-blue-500 select-none">you›</span>
    <span className="text-sm break-words whitespace-pre-wrap text-gray-800">{text}</span>
    {images && images.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map(src => (
          // biome-ignore lint/a11y/useAltText: pasted screenshot, no caption available
          <img
            key={src.slice(0, 64)}
            src={src}
            className="max-h-80 max-w-full rounded border border-gray-200"
          />
        ))}
      </div>
    )}
    {attachments && attachments.length > 0 && <SentAttachments attachments={attachments} />}
  </div>
)

// The answer is the hero of the transcript: slightly larger, darker, looser
// than everything else, line length capped near 70ch for readability.
export const AssistantBubble = ({ text }: { text: string }) => (
  <div className="max-w-full text-[15px] leading-relaxed text-gray-900 sm:max-w-[70ch]">
    <Markdown text={text} />
  </div>
)
