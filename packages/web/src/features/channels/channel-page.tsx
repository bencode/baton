import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAsync } from '../../hooks/use-async'
import { createChannelApi } from './channel-api'
import { ChannelRoom } from './channel-room'
import { NameGate } from './name-gate'

// Public, shell-less chat-room page reached by a share link
// `/channel/:id#token=<token>`. The token rides the URL hash (never sent to the
// server on page load) and is used as the Bearer for the channel API — no login.
const tokenFromHash = (): string =>
  new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? ''
const nameKey = (id: string): string => `channel:${id}:name`

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="grid h-dvh place-items-center px-6 text-center text-sm text-gray-400">{children}</div>
)

export const ChannelPage = () => {
  const { id = '' } = useParams()
  const token = useMemo(tokenFromHash, [])
  const api = useMemo(() => createChannelApi(token), [token])
  const { data: manifest, loading, error } = useAsync(() => api.manifest(id), `${id}:${token}`)
  const [name, setName] = useState(() => localStorage.getItem(nameKey(id)) ?? '')

  useEffect(() => {
    document.title = manifest?.title || 'channel'
  }, [manifest?.title])

  if (!token) return <Centered>缺少访问令牌 —— 请用完整的分享链接打开。</Centered>
  if (loading) return <Centered>…</Centered>
  if (error || !manifest) return <Centered>链接无效或房间已不存在。</Centered>

  // Persist the name → we skip the claim PUT on reload (re-PUT would 409 against
  // our own fresh presence); the stream's `?as` keeps us online. Renaming clears it.
  const join = (picked: string) => {
    localStorage.setItem(nameKey(id), picked)
    setName(picked)
  }
  const rename = () => {
    localStorage.removeItem(nameKey(id))
    setName('')
  }

  if (!name) return <NameGate api={api} channelId={id} manifest={manifest} onJoined={join} />
  return <ChannelRoom api={api} channelId={id} manifest={manifest} me={name} onRename={rename} />
}
