import type { ChannelManifest } from '@baton/shared'
import { type FormEvent, useState } from 'react'
import { Markdown } from '../../components/markdown'
import type { ChannelApi } from './channel-api'

// The entry: pick a display name to join. Claims the name server-side (PUT, kind
// human); a 409 means it's taken, so the visitor picks another. On success the
// page persists the name and renders the room.
export const NameGate = ({
  api,
  channelId,
  manifest,
  onJoined,
}: {
  api: ChannelApi
  channelId: string
  manifest: ChannelManifest
  onJoined: (name: string) => void
}) => {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const picked = name.trim()
    if (!picked || busy) return
    setBusy(true)
    setError('')
    try {
      const { taken } = await api.join(channelId, picked)
      if (taken) {
        setError(`“${picked}” 已经有人用了，换个名字。`)
        setBusy(false)
        return
      }
      onJoined(picked)
    } catch (err) {
      console.error('[name-gate] join failed', err)
      setError('加入失败，请重试。')
      setBusy(false)
    }
  }

  return (
    <div className="grid h-dvh place-items-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="font-mono text-base font-semibold tracking-tight text-gray-900">
          {manifest.title || '聊天室'}
        </h1>
        {manifest.description && (
          <div className="mt-2 text-sm text-gray-500">
            <Markdown text={manifest.description} />
          </div>
        )}
        <div className="mt-3 text-xs text-gray-400">当前在线 {manifest.members.length} 人</div>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label className="text-sm text-gray-600" htmlFor="ch-name">
            给自己取个显示名加入：
          </label>
          <input
            id="ch-name"
            // biome-ignore lint/a11y/noAutofocus: a single-field entry gate
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如 老王 / reviewer"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="mt-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? '加入中…' : '加入'}
          </button>
        </form>
      </div>
    </div>
  )
}
