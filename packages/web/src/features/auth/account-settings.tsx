import { type FormEvent, useState } from 'react'
import { useApi } from '../../app/api-context'
import { Modal } from '../../components/modal'

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

// Account self-service. The personal API token lives in the "Add worker" guide now
// (generating one only makes sense in the context of installing a worker), so this
// is just the password change.
export const AccountSettings = ({ onClose }: { onClose: () => void }) => (
  <Modal title="账户设置" onClose={onClose}>
    <ChangePassword />
  </Modal>
)
