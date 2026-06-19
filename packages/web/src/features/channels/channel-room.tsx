import type { ChannelManifest } from '@baton/shared'
import { useCallback } from 'react'
import type { ChannelApi } from './channel-api'
import { ChannelHeader } from './channel-room/header'
import { Composer } from './channel-room/composer'
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
}: {
  api: ChannelApi
  channelId: string
  manifest: ChannelManifest
  me: string
  onRename: () => void
}) => {
  const { messages, status } = useChannelStream(api, channelId, me, true)
  const members = useChannelRoster(api, channelId, true)

  const send = useCallback(
    (text: string, to: string[]): Promise<void> =>
      api.send(channelId, { from: me, text, to: to.length ? to : undefined }).then(() => undefined),
    [api, channelId, me],
  )

  return (
    <div className="flex h-dvh flex-col bg-white text-gray-900">
      <ChannelHeader manifest={manifest} members={members} me={me} status={status} onRename={onRename} />
      <MessageList messages={messages} me={me} />
      <Composer members={members} me={me} onSend={send} />
    </div>
  )
}
