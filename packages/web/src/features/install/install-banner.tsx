import { useState } from 'react'
import { CloseIcon } from '../../components/icons'
import { InstallGuide } from './install-guide'
import { useInstall } from './install-state'

const DISMISSED_KEY = 'baton-install-banner-dismissed'

// One-time nudge for phone browsers; the user menu keeps a permanent entry.
export const InstallBanner = () => {
  const { mode, install } = useInstall()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const [guideOpen, setGuideOpen] = useState(false)
  if (dismissed || (mode !== 'prompt' && mode !== 'ios')) return null
  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }
  return (
    <section
      aria-label="安装 baton"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-ui-border bg-ui-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ui-text">
        把 baton 添加到主屏幕，像 app 一样全屏打开
      </p>
      {mode === 'prompt' ? (
        <button type="button" className="ui-button ui-primary" onClick={() => void install()}>
          安装
        </button>
      ) : (
        <button type="button" className="ui-button ui-primary" onClick={() => setGuideOpen(true)}>
          怎么添加
        </button>
      )}
      <button type="button" className="ui-icon-button" aria-label="不再提示" onClick={dismiss}>
        <CloseIcon />
      </button>
      {guideOpen && <InstallGuide onClose={() => setGuideOpen(false)} />}
    </section>
  )
}
