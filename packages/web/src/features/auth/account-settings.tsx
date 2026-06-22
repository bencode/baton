import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { copyText } from '../../utils/clipboard'

// Change your own password — verify the current one, set a new one.
const ChangePassword = () => {
  const api = useApi()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!oldPassword || !newPassword || status === 'saving') return
    setStatus('saving')
    try {
      await api.auth.changePassword(oldPassword, newPassword)
      setOld('')
      setNew('')
      setStatus('ok')
    } catch {
      setStatus('err')
    }
  }
  const field =
    'rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-400'
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-gray-900">改密码</h3>
      <input
        type="password"
        autoComplete="current-password"
        value={oldPassword}
        onChange={e => {
          setOld(e.target.value)
          setStatus('idle')
        }}
        placeholder="当前密码"
        className={field}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={e => {
          setNew(e.target.value)
          setStatus('idle')
        }}
        placeholder="新密码"
        className={field}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!oldPassword || !newPassword || status === 'saving'}
          className="rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
        >
          更新密码
        </button>
        {status === 'ok' && <span className="text-xs text-emerald-600">已更新 ✓</span>}
        {status === 'err' && <span className="text-xs text-red-600">当前密码不对</span>}
      </div>
    </form>
  )
}

// Personal API token — your CLI/agent's BATON_TOKEN. Minting shows it ONCE.
const ApiToken = () => {
  const api = useApi()
  const { data: me } = useAsync(() => api.auth.me(), 'account-me')
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const has = me?.hasToken ?? false

  const mint = async () => {
    if (busy) return
    setBusy(true)
    try {
      setToken((await api.auth.mintToken()).token)
    } catch (err) {
      console.error('[account] mint token failed', err)
    } finally {
      setBusy(false)
    }
  }
  const copy = () => {
    if (!token) return
    copyText(`export BATON_TOKEN=${token}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-gray-900">个人 API token</h3>
      <p className="text-xs text-gray-500">
        给你自己的 CLI / agent 用(<code>BATON_TOKEN</code>)——以你的身份操作 baton,按你的 workspace
        范围。
      </p>
      {token ? (
        <div className="flex flex-col gap-1.5">
          <code className="block overflow-x-auto rounded-md bg-gray-50 px-2 py-1.5 text-[11px] break-all text-gray-700">
            {token}
          </code>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs transition-colors hover:bg-gray-50"
            >
              {copied ? '已复制 ✓' : '复制 export BATON_TOKEN=…'}
            </button>
            <span className="text-xs text-amber-600">只显示这一次,请立即保存</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {has && (
            <p className="text-xs text-gray-400">
              已生成过(只显示过一次)。忘了就重新生成一个 —— 旧 token 立即失效。
            </p>
          )}
          <button
            type="button"
            onClick={() => void mint()}
            disabled={busy}
            className="w-fit rounded-md bg-gray-900 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
          >
            {has ? '重新生成 token(轮换)' : '生成 token'}
          </button>
        </div>
      )}
    </div>
  )
}

// Centered modal for account self-service (change password + personal API token).
// No shared Modal exists in the app, so this one is inline. Escape / backdrop closes.
export const AccountSettings = ({ onClose }: { onClose: () => void }) => {
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is the click-to-close target
    <div
      onMouseDown={e => {
        if (!cardRef.current?.contains(e.target as Node)) onClose()
      }}
      className="fixed inset-0 z-30 grid place-items-center bg-gray-900/30 px-4"
    >
      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">账户设置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-gray-400 transition-colors hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-5">
          <ChangePassword />
          <div className="h-px bg-gray-100" />
          <ApiToken />
        </div>
      </div>
    </div>
  )
}
