import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { ChevronDownIcon, LogoutIcon, ServiceIcon, SettingsIcon } from '../../components/icons'
import { useAsync } from '../../hooks/use-async'
import { useDismiss } from '../../hooks/use-dismiss'
import { AccountSettings } from './account-settings'

// Header user menu: the signed-in username with a dropdown to log out. Fetches
// /auth/me itself (one cheap row — no shared context). Renders nothing when auth
// is off (no user) so the open/dev-mode header stays clean. The blue avatar
// echoes the logo mark; the menu stays in the header's restrained gray vocabulary.
export const UserMenu = () => {
  const api = useApi()
  const navigate = useNavigate()
  const { data } = useAsync(() => api.auth.me(), 'user-menu-me')
  const user = data?.user ?? null
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useDismiss(ref, open, () => setOpen(false))

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
        className="ui-focus flex min-h-11 items-center gap-2 rounded-md px-1 text-xs text-ui-text transition-colors hover:bg-ui-hover md:min-h-8 [@media(pointer:coarse)]:min-h-11"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full border border-ui-border bg-ui-selected text-[11px] font-semibold text-ui-selected-text">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[10rem] truncate font-medium sm:inline">{user.username}</span>
        <span
          className={`text-ui-muted transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-52 origin-top-right overflow-hidden rounded-lg border border-ui-border bg-ui-surface py-1 transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 truncate text-[13px] font-medium text-ui-text">
              {user.username}
            </span>
            {user.isAdmin ? (
              <span className="shrink-0 rounded bg-ui-selected px-1.5 py-0.5 text-[10px] font-medium text-ui-selected-text">
                管理员
              </span>
            ) : (
              <span className="shrink-0 text-[11px] text-ui-muted">成员</span>
            )}
          </div>
          <div className="my-1 h-px bg-ui-hover" />
          {user.isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate('/ops')
              }}
              className="ui-quiet-button w-full justify-start rounded-none px-3 text-ui-text"
            >
              <span className="text-ui-muted">
                <ServiceIcon />
              </span>
              运行大屏
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setSettingsOpen(true)
            }}
            className="ui-quiet-button w-full justify-start rounded-none px-3 text-ui-text"
          >
            <span className="text-ui-muted">
              <SettingsIcon />
            </span>
            账户设置
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="ui-quiet-button w-full justify-start rounded-none px-3 text-ui-text"
          >
            <span className="text-ui-muted">
              <LogoutIcon />
            </span>
            退出登录
          </button>
        </div>
      )}
      {settingsOpen && <AccountSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
