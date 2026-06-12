import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { ChevronDownIcon, LogoutIcon } from '../../components/icons'
import { useAsync } from '../../hooks/use-async'

// Header user menu: the signed-in username with a dropdown to log out. Fetches
// /auth/me itself (one cheap row — no shared context). Renders nothing when auth
// is off (no user) so the open/dev-mode header stays clean. The emerald avatar
// echoes the logo mark; the menu stays in the header's restrained gray vocabulary.
export const UserMenu = () => {
  const api = useApi()
  const navigate = useNavigate()
  const { data } = useAsync(() => api.auth.me(), 'user-menu-me')
  const user = data?.user ?? null
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const logout = async () => {
    try {
      await api.auth.logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-1 text-sm text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-[11px] font-semibold text-white">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[10rem] truncate font-medium">{user.username}</span>
        <span
          className={`text-gray-400 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-52 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-gray-900/5 transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 truncate text-sm font-medium text-gray-900">
              {user.username}
            </span>
            {user.isAdmin ? (
              <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                管理员
              </span>
            ) : (
              <span className="shrink-0 text-[11px] text-gray-400">成员</span>
            )}
          </div>
          <div className="my-1 h-px bg-gray-100" />
          {user.isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate('/ops')
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
            >
              <span className="text-gray-400">📺</span>
              运行大屏
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
          >
            <span className="text-gray-400">
              <LogoutIcon />
            </span>
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
