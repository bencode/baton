import { type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import {
  ChatIcon,
  LogoutIcon,
  MoreIcon,
  PlusIcon,
  ServiceIcon,
  SettingsIcon,
} from '../../components/icons'
import { Popover } from '../../components/popover'
import { useAsync } from '../../hooks/use-async'
import { InstallGuide } from '../install/install-guide'
import { useInstall } from '../install/install-state'
import { usePush } from '../push/use-push'
import { AccountSettings } from './account-settings'

export const UserMenu = ({ context }: { context: ReactNode }) => {
  const api = useApi()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const { data, loading, error } = useAsync(() => api.auth.me(), attempt)
  const user = data?.user ?? null
  const local = data?.authRequired === false && user === null
  const label = user?.username ?? (local ? '本地模式' : '设置')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { mode: installMode, install } = useInstall()
  const [installGuideOpen, setInstallGuideOpen] = useState(false)
  const push = usePush()
  const logout = async () => {
    try {
      await api.auth.logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }
  return (
    <>
      <button
        type="button"
        className="wb-account-trigger"
        aria-label={`${label}，配置`}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={event => setAnchor(anchor ? null : event.currentTarget)}
      >
        <span className="wb-account-avatar">
          {user ? user.username.charAt(0).toUpperCase() : <SettingsIcon />}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <strong className="block truncate">{label}</strong>
          <small className="mt-1 block text-ui-muted">{user ? '个人配置' : '工作区与配置'}</small>
        </span>
        <MoreIcon />
      </button>
      <Popover
        anchor={anchor}
        label="配置"
        role="dialog"
        placement="top-start"
        className="wb-personal-panel"
        onClose={() => setAnchor(null)}
      >
        {context}
        <div className="wb-account-actions">
          {loading && (
            <p role="status" className="px-3 py-2 text-xs text-ui-muted">
              加载账号…
            </p>
          )}
          {error && (
            <p role="alert" className="px-3 py-2 text-xs text-ui-danger">
              无法加载账号。
              <button
                type="button"
                className="underline"
                onClick={() => setAttempt(value => value + 1)}
              >
                重试
              </button>
            </p>
          )}
          {(installMode === 'prompt' || installMode === 'ios') && (
            <button
              type="button"
              className="ui-menu-item"
              onClick={() => {
                setAnchor(null)
                if (installMode === 'prompt') void install()
                else setInstallGuideOpen(true)
              }}
            >
              <PlusIcon />
              安装到主屏幕
            </button>
          )}
          {user && (
            <>
              <div className="ui-menu-caption">个人配置{user.isAdmin ? ' · 管理员' : ''}</div>
              {user.isAdmin && (
                <button
                  type="button"
                  className="ui-menu-item"
                  onClick={() => {
                    setAnchor(null)
                    navigate('/ops')
                  }}
                >
                  <ServiceIcon />
                  运行大屏
                </button>
              )}
              {(push.state === 'off' || push.state === 'on') && (
                <button
                  type="button"
                  className="ui-menu-item"
                  onClick={() => {
                    setAnchor(null)
                    void (push.state === 'off' ? push.enable() : push.disable())
                  }}
                >
                  <ChatIcon />
                  {push.state === 'off' ? '开启通知' : '关闭通知'}
                </button>
              )}
              {push.state === 'denied' && (
                <button type="button" className="ui-menu-item" disabled>
                  <ChatIcon />
                  通知已被系统禁止
                </button>
              )}
              <button
                type="button"
                className="ui-menu-item"
                onClick={() => {
                  setAnchor(null)
                  setSettingsOpen(true)
                }}
              >
                <SettingsIcon />
                账号设置
              </button>
              <button
                type="button"
                className="ui-menu-item"
                onClick={() => {
                  setAnchor(null)
                  void logout()
                }}
              >
                <LogoutIcon />
                退出登录
              </button>
            </>
          )}
        </div>
      </Popover>
      {settingsOpen && <AccountSettings onClose={() => setSettingsOpen(false)} />}
      {installGuideOpen && <InstallGuide onClose={() => setInstallGuideOpen(false)} />}
    </>
  )
}
