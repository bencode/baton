import type { AgentKind, SessionView } from '@baton/shared'
import { type ReactNode, useId, useRef, useState } from 'react'
import { Popover } from '../../../components/popover'
import { useAutosize } from '../../../hooks/use-autosize'
import { useDropZone } from '../../../hooks/use-drop-zone'
import { extractImageFiles, insertLabelToken } from '../../../utils/attachment'
import { CommandHelp, CommandMenu } from './command-menu'
import { parseModelArgs, resolveCommand, type SlashCommand } from './commands'
import { ComposerAttachments } from './composer-attachments'
import { ComposerOptions } from './composer-options'
import { PaperclipIcon, SendIcon, Spinner, StopIcon } from './icons'
import type { ComposerControls } from './use-composer-controls'
import type { ComposerDraft } from './use-composer-draft'
import type { DraftAttachments } from './use-draft-attachments'
import { useSlashCommands } from './use-slash-commands'
import { WorkingIndicator } from './working-indicator'

type ComposerProps = {
  agentKind: AgentKind
  session: Pick<SessionView, 'attached' | 'connected' | 'busy' | 'terminalOpen'>
  statusKnown: boolean
  draft: ComposerDraft
  attachments: DraftAttachments
  controls: ComposerControls
  queue: ReactNode
  // Share page: send messages + attachments only — no settings, stop, resume,
  // slash commands or shortcuts. A message itself (re)starts the session.
  shared?: boolean
}

export const Composer = ({
  agentKind,
  session,
  statusKnown,
  draft,
  attachments,
  controls,
  queue,
  shared = false,
}: ComposerProps) => {
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const commandInFlight = useRef(false)
  const [showHelp, setShowHelp] = useState(false)
  const menuId = useId()
  const helpId = useId()
  const locked = draft.sending || controls.saving !== null || controls.pending !== null
  const canAttach =
    (shared || session.attached) && session.connected && !session.terminalOpen && !locked
  const addFiles = (files: File[]) => {
    if (canAttach) void attachments.addFiles(files)
  }
  const { dragging, dropProps } = useDropZone(addFiles, canAttach)
  useAutosize(input, draft.text)

  const runCommand = async (command: SlashCommand, args: string) => {
    if (locked || commandInFlight.current) return
    commandInFlight.current = true
    const submittedText = draft.text
    try {
      let ok = false
      if (command.kind === 'help') {
        setShowHelp(true)
        ok = true
      } else if (command.kind === 'plan') ok = await controls.setMode(!controls.settings.planMode)
      else if (command.kind === 'abort') ok = await controls.abort()
      else if (command.kind === 'clear') ok = await controls.clear()
      else if (command.kind === 'model') {
        const parsed = parseModelArgs(args)
        if (parsed.error) controls.reportError(parsed.error)
        else ok = await controls.setModel(parsed.model, parsed.effort)
      }
      if (ok) draft.clearIfUnchanged(submittedText)
    } finally {
      commandInFlight.current = false
    }
  }
  const slash = useSlashCommands(
    draft.text,
    draft.setText,
    (command, args) => void runCommand(command, args),
    () => {
      if (!locked) void controls.setMode(!controls.settings.planMode)
    },
    agentKind,
    !shared,
  )
  const resolved = shared ? null : resolveCommand(draft.text, agentKind)
  const execute = () => {
    if (slash.open) {
      const command = slash.menu[slash.activeIndex]
      if (command) slash.pick(command)
    } else if (resolved) void runCommand(resolved.command, resolved.args)
    else void draft.submit()
  }
  const commandLabel = slash.open || resolved !== null
  const sendLabel = draft.sending
    ? '发送中…'
    : commandLabel
      ? '执行命令'
      : statusKnown && session.busy
        ? '加入队列'
        : '发送'
  const feedbackErrors = [
    ...new Set(
      [
        draft.error,
        controls.error,
        attachments.items.some(item => item.status === 'failed')
          ? '部分附件上传失败，请重试或移除后再发送。'
          : null,
      ].filter((error): error is string => error !== null),
    ),
  ]
  return (
    <div className="composer-area">
      <div className="composer-column">
        {session.busy && (
          <WorkingIndicator statusKnown={statusKnown} stopping={controls.pending === 'abort'} />
        )}
        {queue}
        <div
          {...dropProps}
          className="composer-box"
          data-dragging={dragging}
          data-busy={session.busy}
          aria-busy={draft.sending}
        >
          <ComposerAttachments
            items={attachments.items}
            disabled={locked}
            onRemove={attachments.remove}
            onRetry={key => void attachments.retry(key)}
            onInsertLabel={label =>
              insertLabelToken(input.current, draft.text, draft.setText, label)
            }
          />
          <div className="composer-input-row">
            <textarea
              ref={input}
              value={draft.text}
              aria-label="消息"
              aria-describedby={helpId}
              aria-autocomplete="list"
              aria-controls={slash.open ? menuId : undefined}
              aria-activedescendant={slash.open ? `${menuId}-${slash.activeIndex}` : undefined}
              placeholder={
                shared ? '输入消息 · Shift+Enter 换行' : '输入消息 · / 命令 · Shift+Enter 换行'
              }
              rows={1}
              onChange={event => {
                draft.setText(event.target.value)
                slash.reset()
              }}
              onPaste={event => {
                const files = extractImageFiles(event.clipboardData.items)
                if (!files.length) return
                event.preventDefault()
                addFiles(files)
              }}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return
                if (slash.onKeyDown(event)) return
                if (event.key === 'Escape' && session.busy && !shared) {
                  event.preventDefault()
                  if (!controls.pending) void controls.abort()
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  execute()
                }
              }}
            />
          </div>
          <div className="composer-toolbar">
            <div className="composer-options">
              <button
                type="button"
                className="composer-icon-button"
                disabled={!canAttach}
                aria-label="添加附件"
                title="添加附件，也可以粘贴图片或拖入文件"
                onClick={() => picker.current?.click()}
              >
                <PaperclipIcon />
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={event => {
                  addFiles(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
              />
              {!shared && (
                <>
                  <span className="composer-toolbar-separator" aria-hidden="true" />
                  <ComposerOptions
                    agentKind={agentKind}
                    controls={controls}
                    disabled={draft.sending}
                  />
                </>
              )}
            </div>
            <div className="composer-send-actions">
              {session.busy && !shared && (
                <button
                  type="button"
                  className="composer-stop"
                  aria-label="停止当前执行"
                  disabled={controls.pending !== null || controls.saving !== null}
                  onClick={() => void controls.abort()}
                >
                  <StopIcon />
                  <span>{controls.pending === 'abort' ? '停止中…' : '停止'}</span>
                </button>
              )}
              <button
                type="button"
                className="composer-send"
                disabled={commandLabel ? locked : !draft.canSend}
                aria-label={sendLabel}
                title={sendLabel}
                onClick={execute}
              >
                {draft.sending ? <Spinner /> : <SendIcon />}
                <span>{sendLabel}</span>
              </button>
            </div>
          </div>
          {dragging && (
            <div className="composer-drop-hint">
              <PaperclipIcon />
              松开以添加附件
            </div>
          )}
        </div>
        <div id={helpId} className="composer-footer">
          {feedbackErrors.length > 0 ? (
            <div role="alert" className="composer-footer-errors">
              {feedbackErrors.map(error => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : !session.connected ? (
            <p>执行环境离线，连接恢复后可发送。</p>
          ) : controls.notice ? (
            <p role="status">{controls.notice}</p>
          ) : session.terminalOpen ? (
            <p>会话正在终端中使用，暂不能发送。</p>
          ) : !session.attached && !shared ? (
            <div className="composer-footer-action">
              <span>会话未启动，恢复后可发送。</span>
              <button
                type="button"
                className="ui-button"
                disabled={locked}
                onClick={() => void controls.resume()}
              >
                {controls.pending === 'resume' ? '请求中…' : '恢复会话'}
              </button>
            </div>
          ) : null}
        </div>
        {slash.open && (
          <Popover
            anchor={input.current}
            id={menuId}
            role="listbox"
            label="会话命令"
            autoFocus={false}
            placement="top-start"
            className="composer-popup composer-command-popup"
            onClose={slash.dismiss}
          >
            <CommandMenu
              id={menuId}
              commands={slash.menu}
              activeIndex={slash.activeIndex}
              onPick={slash.pick}
            />
          </Popover>
        )}
        {showHelp && (
          <Popover
            anchor={input.current}
            role="dialog"
            label="命令帮助"
            placement="top-start"
            className="composer-popup composer-help-popup"
            onClose={() => setShowHelp(false)}
          >
            <CommandHelp agentKind={agentKind} onClose={() => setShowHelp(false)} />
          </Popover>
        )}
      </div>
    </div>
  )
}
