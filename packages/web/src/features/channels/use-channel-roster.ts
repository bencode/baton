import type { ChannelMember } from '@baton/shared'
import { useEffect, useState } from 'react'
import type { ChannelApi } from './channel-api'

// Poll the online roster (presence is ephemeral, ~90s TTL server-side). Drives the
// header's "who's online" and the composer's @-mention list. Light: one GET / cycle.
export const useChannelRoster = (
  api: ChannelApi,
  channelId: string,
  active: boolean,
  intervalMs = 5000,
): ChannelMember[] => {
  const [members, setMembers] = useState<ChannelMember[]>([])
  useEffect(() => {
    if (!active) return
    let alive = true
    const tick = () =>
      api
        .members(channelId)
        .then(m => alive && setMembers(m))
        .catch(err => console.error('[channel-roster] poll failed', err))
    tick()
    const t = setInterval(tick, intervalMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, channelId, active, intervalMs])
  return members
}
