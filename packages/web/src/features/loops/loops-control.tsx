import type { Id } from '@baton/shared'
import { useCallback, useRef, useState } from 'react'
import { ClockIcon } from '../../components/icons'
import { Modal } from '../../components/modal'
import { useDismiss } from '../../hooks/use-dismiss'
import { useIsMobile } from '../../hooks/use-media-query'
import { LoopsPanel } from './loops-panel'

// The session header's Loops entry. Loops is recurring, interval-scheduled
// automation — a different concept from the lifecycle (resume) and share actions
// it used to sit beside, so the trigger is a distinct clock glyph (matching the
// rail indicator in workers-panel/session-row) split off by a divider. Opening it
// reveals the manager without shoving the transcript down: a right-anchored
// popover on desktop (mirrors the project/user menus), a centered Modal on phones
// where a narrow popover would clip and cramp the create form. Both surfaces cap
// height and scroll so the create form stays reachable however many loops exist.
type LoopsControlProps = {
  sessionId: Id
  projectId: Id
  activeLoops: number
}

export const LoopsControl = ({ sessionId, projectId, activeLoops }: LoopsControlProps) => {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  // Desktop popover dismisses on outside click / Escape; the Modal owns its own.
  useDismiss(ref, open && !isMobile, close)

  const panel = <LoopsPanel sessionId={sessionId} projectId={projectId} />
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={activeLoops > 0 ? `scheduled tasks, ${activeLoops} active` : 'scheduled tasks'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="scheduled tasks"
        className={`ui-icon-button ${open ? 'bg-ui-selected text-ui-selected-text' : ''}`}
      >
        <span className="inline-flex items-center gap-1 align-middle">
          <ClockIcon />
          {activeLoops > 0 && <span className="tabular-nums">{activeLoops}</span>}
        </span>
      </button>
      {open && isMobile && (
        <Modal title="Scheduled tasks" onClose={close} className="max-w-lg">
          <div className="-mx-5 -mb-6 flex max-h-[70vh] min-h-0 flex-col border-t border-ui-border">
            {panel}
          </div>
        </Modal>
      )}
      {open && !isMobile && (
        <div
          role="dialog"
          aria-label="scheduled tasks"
          className="absolute right-0 z-20 mt-2 flex max-h-[70vh] w-[28rem] max-w-[calc(100vw-2rem)] origin-top-right flex-col overflow-hidden rounded-lg border border-ui-border bg-ui-surface transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-ui-border px-4 py-4">
            <h2 className="text-[13px] font-semibold text-ui-text">Scheduled tasks</h2>
            <span className="text-xs text-ui-muted tabular-nums">{activeLoops} active</span>
          </div>
          {panel}
        </div>
      )}
    </div>
  )
}
