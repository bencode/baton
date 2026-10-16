import { type FormEvent, useState } from 'react'
import { ApiError } from '../../api'
import { useApi } from '../../app/api-context'
import { Modal } from '../../components/modal'

const ChangePassword = () => {
  const api = useApi()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!oldPassword || !newPassword || status === 'saving') return
    setStatus('saving')
    setError(null)
    try {
      await api.auth.changePassword(oldPassword, newPassword)
      setOld('')
      setNew('')
      setStatus('ok')
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? '当前密码不正确，或登录已失效，请确认后重试'
          : cause instanceof ApiError && cause.status === 400
            ? '请填写当前密码和新密码'
            : '密码更新失败，请稍后重试',
      )
      setStatus('err')
    }
  }
  return (
    <form onSubmit={submit} className="mg-form">
      <div>
        <h3 className="text-sm font-medium">修改密码</h3>
        <p className="mg-description">验证当前密码后，设置新的登录密码。</p>
      </div>
      <label className="mg-field" htmlFor="account-current-password">
        当前密码
        <input
          id="account-current-password"
          type="password"
          autoComplete="current-password"
          disabled={status === 'saving'}
          value={oldPassword}
          onChange={event => {
            setOld(event.target.value)
            setStatus('idle')
            setError(null)
          }}
          className="ui-input"
        />
      </label>
      <label className="mg-field" htmlFor="account-new-password">
        新密码
        <input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          disabled={status === 'saving'}
          value={newPassword}
          onChange={event => {
            setNew(event.target.value)
            setStatus('idle')
            setError(null)
          }}
          className="ui-input"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-ui-danger">
          {error}
        </p>
      )}
      {status === 'ok' && (
        <p role="status" className="text-sm text-ui-success">
          密码已更新
        </p>
      )}
      <div className="mg-form-actions">
        <button
          type="submit"
          disabled={!oldPassword || !newPassword || status === 'saving'}
          className="ui-button ui-primary"
        >
          {status === 'saving' ? '更新中…' : '更新密码'}
        </button>
      </div>
    </form>
  )
}

export const AccountSettings = ({ onClose }: { onClose: () => void }) => (
  <Modal title="账号设置" onClose={onClose} className="mg-dialog mg-dialog-compact">
    <ChangePassword />
  </Modal>
)
