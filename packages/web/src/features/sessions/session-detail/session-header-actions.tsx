import type { Id, Session } from '@baton/shared'
import { useId, useRef, useState } from 'react'
import { standaloneSessionPath } from '../../../app/route'
import { CheckIcon, CopyIcon, MoreIcon } from '../../../components/icons'
import { Modal } from '../../../components/modal'
import { Popover } from '../../../components/popover'
import { copyText } from '../../../utils/clipboard'
import { LoopsDialog } from '../../loops/loops-control'

type DiagnosticsProps = {
  session: Session
  initialEvent?: { model?: string; sessionId?: string }
}

type MobileSessionActionsProps = DiagnosticsProps & {
  active: boolean
  terminalOpen: boolean
  terminalReady: boolean
  projectId: Id
  activeLoops: number
  onOpenTerminal(): void
  onRename(name: string): void
}

type MobilePanel = null | 'actions' | 'rename' | 'loops' | 'details'

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="ui-icon-button"
      aria-label="复制 Agent 会话标识"
      title={copied ? '已复制' : '复制 Agent 会话标识'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

export const ShareButton = ({
  shareToken,
  className = 'ui-quiet-button',
}: {
  shareToken: string
  className?: string
}) => {
  const [copied, setCopied] = useState(false)
  const onShare = () => {
    copyText(window.location.origin + standaloneSessionPath(shareToken))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" aria-label="分享会话" onClick={onShare} className={className}>
      {copied ? '已复制' : '分享'}
    </button>
  )
}

export const SessionDiagnostics = ({ session, initialEvent }: DiagnosticsProps) => (
  <div className="flex flex-col gap-1 break-all rounded-md bg-ui-panel p-3 text-xs text-ui-muted">
    {initialEvent?.model && <span>初始事件模型：{initialEvent.model}</span>}
    {initialEvent?.sessionId && initialEvent.sessionId !== session.agentSessionId && (
      <span>初始事件会话：{initialEvent.sessionId}</span>
    )}
    <span>目录：{session.cwd ?? '尚未准备'}</span>
    <div className="flex items-center gap-2">
      <span>
        Agent 会话：<span>{session.agentSessionId ?? '尚未准备'}</span>
      </span>
      {session.agentSessionId !== null && <CopyButton text={session.agentSessionId} />}
    </div>
  </div>
)

const RenameForm = ({
  name,
  onRename,
  onClose,
}: {
  name: string
  onRename(name: string): void
  onClose(): void
}) => {
  const [draft, setDraft] = useState(name)
  const inputId = useId()
  return (
    <form
      className="chat-mobile-rename"
      onSubmit={event => {
        event.preventDefault()
        const next = draft.trim()
        if (!next) return
        if (next !== name) onRename(next)
        onClose()
      }}
    >
      <label htmlFor={inputId}>会话名称</label>
      <input
        // biome-ignore lint/a11y/noAutofocus: the user explicitly opened the rename dialog
        autoFocus
        id={inputId}
        className="ui-input"
        value={draft}
        onChange={event => setDraft(event.target.value)}
      />
      <div className="chat-mobile-dialog-actions">
        <button type="button" className="ui-quiet-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="ui-button" disabled={!draft.trim()}>
          保存
        </button>
      </div>
    </form>
  )
}

export const MobileSessionActions = ({
  session,
  initialEvent,
  active,
  terminalOpen,
  terminalReady,
  projectId,
  activeLoops,
  onOpenTerminal,
  onRename,
}: MobileSessionActionsProps) => {
  const [panel, setPanel] = useState<MobilePanel>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => {
    setPanel(null)
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus()
    })
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ui-icon-button chat-mobile-more"
        aria-label="更多会话操作"
        aria-haspopup="dialog"
        aria-expanded={panel === 'actions'}
        aria-description={activeLoops > 0 ? `${activeLoops} 个定时任务运行中` : undefined}
        onClick={() => setPanel(panel === 'actions' ? null : 'actions')}
      >
        <MoreIcon />
        {activeLoops > 0 && (
          <span className="chat-mobile-task-count" aria-hidden="true">
            {activeLoops}
          </span>
        )}
      </button>
      <Popover
        anchor={panel === 'actions' ? trigger.current : null}
        label="会话操作"
        role="dialog"
        placement="bottom-end"
        className="chat-mobile-actions"
        onClose={() => setPanel(null)}
      >
        <button type="button" className="ui-menu-item" onClick={() => setPanel('rename')}>
          重命名会话
        </button>
        {!active && !terminalOpen && terminalReady && (
          <button
            type="button"
            className="ui-menu-item"
            onClick={() => {
              onOpenTerminal()
              close()
            }}
          >
            终端
          </button>
        )}
        {session.shareToken && (
          <ShareButton shareToken={session.shareToken} className="ui-menu-item" />
        )}
        <button type="button" className="ui-menu-item" onClick={() => setPanel('loops')}>
          定时任务
          {activeLoops > 0 && <span className="ml-auto text-ui-muted">{activeLoops} 个运行中</span>}
        </button>
        <button type="button" className="ui-menu-item" onClick={() => setPanel('details')}>
          会话详情
        </button>
      </Popover>
      {panel === 'rename' && (
        <Modal title="重命名会话" onClose={close}>
          <RenameForm name={session.name} onRename={onRename} onClose={close} />
        </Modal>
      )}
      {panel === 'details' && (
        <Modal title="会话详情" onClose={close}>
          <SessionDiagnostics session={session} initialEvent={initialEvent} />
        </Modal>
      )}
      {panel === 'loops' && (
        <LoopsDialog sessionId={session.id} projectId={projectId} onClose={close} />
      )}
    </>
  )
}
