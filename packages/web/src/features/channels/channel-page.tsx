import { buildAgentInvite } from '@baton/shared'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { createChannelApi } from './channel-api'
import { ChannelRoom } from './channel-room'
import { NameGate } from './name-gate'

// Public, shell-less chat-room page reached by `/channel/:id`. The channel uuid in
// the path IS the capability — no token, no login. A logged-in baton user's name is
// auto-claimed (below); an external visitor picks one at the gate.
const nameKey = (id: string): string => `channel:${id}:name`

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="grid h-dvh place-items-center px-6 text-center text-sm text-gray-400">
    {children}
  </div>
)

export const ChannelPage = () => {
  const { id = '' } = useParams()
  const mainApi = useApi()
  const api = useMemo(() => createChannelApi(), [])
  const { data: manifest, loading, error } = useAsync(() => api.manifest(id), id)
  // The logged-in baton username, if any — auto-claimed as the nickname below. An
  // external share-link visitor isn't logged in, so this resolves to no user and
  // the gate shows as before.
  const { data: me, loading: meLoading } = useAsync(() => mainApi.auth.me(), 'channel-auth-me')
  const username = me?.user?.username ?? ''
  const [name, setName] = useState(() => localStorage.getItem(nameKey(id)) ?? '')
  const [claiming, setClaiming] = useState(false)
  const [claimTried, setClaimTried] = useState(false)

  useEffect(() => {
    document.title = manifest?.title || 'channel'
  }, [manifest?.title])

  // Auto-claim the logged-in username (once) when there's no remembered name. A
  // 409 (someone online already holds it) or no username falls through to the gate.
  useEffect(() => {
    if (name || claimTried || meLoading || !manifest) return
    if (!username) {
      setClaimTried(true)
      return
    }
    setClaiming(true)
    api
      .join(id, username)
      .then(({ taken }) => {
        if (taken) return
        localStorage.setItem(nameKey(id), username)
        setName(username)
      })
      .catch(err => console.warn('[channel] auto-claim failed', err))
      .finally(() => {
        setClaiming(false)
        setClaimTried(true)
      })
  }, [name, claimTried, meLoading, manifest, username, id, api])

  if (loading) return <Centered>…</Centered>
  if (error || !manifest) return <Centered>Invalid link, or the room no longer exists.</Centered>
  // Deciding the nickname: still waiting on /auth/me or the auto-claim attempt.
  if (!name && (meLoading || claiming || !claimTried)) return <Centered>…</Centered>

  // Persist the name → we skip the claim PUT on reload (re-PUT would 409 against
  // our own fresh presence); the stream's `?as` keeps us online. Renaming clears it.
  const join = (picked: string) => {
    localStorage.setItem(nameKey(id), picked)
    setName(picked)
  }
  // Rename in place (no return to the gate): claim the new name first
  // (collision-checked), then release the old one. Same name is a no-op; a taken
  // name leaves us as we were so the header can prompt for another.
  const rename = async (next: string): Promise<{ ok: boolean }> => {
    const picked = next.trim()
    if (!picked || picked === name) return { ok: true }
    const { taken } = await api.join(id, picked)
    if (taken) return { ok: false }
    // Free the old name so it doesn't linger as a ghost (best-effort; it would
    // also lapse via the presence TTL).
    api.leave(id, name).catch(err => console.warn('[channel] release old name failed', err))
    localStorage.setItem(nameKey(id), picked)
    setName(picked)
    return { ok: true }
  }

  if (!name) return <NameGate api={api} channelId={id} manifest={manifest} onJoined={join} />
  const invite = buildAgentInvite({ base: `${window.location.origin}/api`, channelId: id })
  return (
    <ChannelRoom
      api={api}
      channelId={id}
      manifest={manifest}
      me={name}
      onRename={rename}
      invite={invite}
      webLink={window.location.href}
    />
  )
}
