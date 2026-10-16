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
            <img src={attachmentSrc(att)} alt={att.filename} className="chat-sent-image" />
            <figcaption className="chat-attachment-label">{`{${label}}`}</figcaption>
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
  <article className="chat-user-message" aria-label="用户消息">
    <div className="chat-user-content">
      {text && <p>{text}</p>}
      {images && images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map(src => (
            <img key={src.slice(0, 64)} src={src} alt="消息中的图片" className="chat-sent-image" />
          ))}
        </div>
      )}
      {attachments && attachments.length > 0 && <SentAttachments attachments={attachments} />}
    </div>
  </article>
)

// The answer is the hero of the transcript: slightly larger, darker, looser
// than everything else, line length capped near 70ch for readability.
export const AssistantBubble = ({ text }: { text: string }) => (
  <article className="chat-assistant" aria-label="助手回答">
    <Markdown text={text} variant="chat" />
  </article>
)
