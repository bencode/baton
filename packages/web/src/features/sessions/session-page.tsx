import { useParams } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { SessionDetail } from './session-detail'

// Standalone, shell-less session view reached by a share link (/s/:token, e.g.
// from the DingTalk bot). The token is the credential: we exchange it for a
// session cookie (POST /auth/share/:token logs the browser in as the seeded
// user), then render the *unmodified* SessionDetail — every operation works
// exactly as in the back-office, just without the rail/tabs.
export const SessionPage = () => {
  const api = useApi()
  const { token = '' } = useParams()
  const { data, loading, error } = useAsync(() => api.auth.shareLogin(token), token)

  if (loading)
    return <div className="grid h-screen place-items-center text-sm text-gray-400">…</div>
  if (error || !data)
    return (
      <div className="grid h-screen place-items-center text-sm text-gray-400">链接无效或已失效</div>
    )
  return (
    <div className="flex h-screen flex-col bg-white text-gray-900">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-2">
        <span className="inline-block h-2 w-2 rotate-45 bg-emerald-500" aria-hidden />
        <span className="font-mono text-[13px] font-semibold tracking-tight">baton</span>
      </div>
      <div className="min-h-0 flex-1">
        <SessionDetail sessionId={data.session.id} />
      </div>
    </div>
  )
}
