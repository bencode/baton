import type { Attachment, ChannelManifest } from '@baton/shared'
import { useCallback } from 'react'
import type { ChannelApi } from './channel-api'
import { Composer } from './channel-room/composer'
import { ChannelHeader } from './channel-room/header'
import { MessageList } from './channel-room/message-list'
import { useChannelRoster } from './use-channel-roster'
import { useChannelStream } from './use-channel-stream'

// The room: live transcript (SSE) + online roster (poll) + a composer that sends
// as `me`. Our own messages echo back over the stream like everyone else's.
export const ChannelRoom = ({
  api,
  channelId,
  manifest,
  me,
  onRename,
  invite,
  webLink,
}: {
  api: ChannelApi
  channelId: string
  manifest: ChannelManifest
  me: string
  onRename: (next: string) => Promise<{ ok: boolean }>
  invite: string
  webLink: string
}) => {
  const { messages, status } = useChannelStream(api, channelId, me, true)
  const members = useChannelRoster(api, channelId, true)

  const send = useCallback(
    (text: string, to: string[], attachments: Attachment[]): Promise<void> =>
      api
        .send(channelId, {
          from: me,
          text,
          to: to.length ? to : undefined,
          attachments: attachments.length ? attachments : undefined,
        })
        .then(() => undefined),
    [api, channelId, me],
  )

  return (
    <div className="flex h-dvh flex-col bg-white text-gray-900">
      <ChannelHeader
        manifest={manifest}
        members={members}
        me={me}
        status={status}
        onRename={onRename}
        invite={invite}
        webLink={webLink}
      />
      <MessageList messages={messages} me={me} attachmentUrl={api.attachmentUrl} />
      <Composer
        members={members}
        me={me}
        onSend={send}
        onUpload={file => api.uploadAttachment(channelId, file)}
        attachmentUrl={api.attachmentUrl}
      />
    </div>
  )
}
