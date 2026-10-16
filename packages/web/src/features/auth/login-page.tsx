import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api'
import { useApi } from '../../app/api-context'
import { BatonIcon } from '../../components/icons'

export const LoginPage = () => {
  const api = useApi()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !username || !password) return
    setBusy(true)
    setError(null)
    try {
      await api.auth.login(username, password)
      navigate('/', { replace: true })
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? '用户名或密码错误'
          : '登录失败，请稍后重试',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mg-login">
      <form onSubmit={submit} className="mg-form mg-login-form">
        <header className="mb-2 flex items-center gap-3">
          <span className="wb-brand-mark" aria-hidden>
            <BatonIcon />
          </span>
          <h1 className="text-lg font-semibold text-ui-heading">baton</h1>
        </header>
        <label className="mg-field" htmlFor="login-username">
          用户名
          <input
            id="login-username"
            value={username}
            disabled={busy}
            onChange={event => setUsername(event.target.value)}
            autoComplete="username"
            className="ui-input"
          />
        </label>
        <label className="mg-field" htmlFor="login-password">
          密码
          <input
            id="login-password"
            type="password"
            value={password}
            disabled={busy}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            className="ui-input"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-ui-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="ui-button ui-primary mt-2"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </main>
  )
}
