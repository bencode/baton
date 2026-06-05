import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'

// Minimal username/password login. On success the server sets the session
// cookie and we head to the back-office; the RequireAuth gate then passes.
export const LoginPage = () => {
  const api = useApi()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.auth.login(username, password)
      navigate('/', { replace: true })
    } catch {
      setError('用户名或密码错误')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid h-screen place-items-center bg-gray-50 text-gray-900">
      <form onSubmit={submit} className="flex w-72 flex-col gap-3">
        <h1 className="flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-2 w-2 rotate-45 bg-emerald-500" aria-hidden />
          baton
        </h1>
        <input
          aria-label="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
          className="rounded-md border border-gray-200 px-3 py-2 text-base focus:border-blue-400 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <input
          aria-label="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          className="rounded-md border border-gray-200 px-3 py-2 text-base focus:border-blue-400 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
