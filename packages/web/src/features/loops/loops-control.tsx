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
  const close = useCallback(() => setOpen(false), [])
  // Desktop popover dismisses on outside click / Escape; the Modal owns its own.
  useDismiss(ref, open && !isMobile, close)

  const panel = <LoopsPanel sessionId={sessionId} projectId={projectId} />
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={activeLoops > 0 ? `loops, ${activeLoops} active` : 'loops'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="loops"
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ${
          open
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'
        }`}
      >
        <span className="inline-flex items-center gap-1 align-middle">
          <ClockIcon />
          {activeLoops > 0 && <span className="tabular-nums">{activeLoops}</span>}
        </span>
      </button>
      {open && isMobile && (
        <Modal title="Loops" onClose={close}>
          <div className="max-h-[60vh] overflow-y-auto">{panel}</div>
        </Modal>
      )}
      {open && !isMobile && (
        <div
          role="dialog"
          aria-label="loops"
          className="absolute right-0 z-20 mt-1.5 w-80 origin-top-right rounded-xl border border-gray-200 bg-white shadow-lg shadow-gray-900/5 transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
        >
          <div className="max-h-[60vh] overflow-y-auto p-3">{panel}</div>
        </div>
      )}
    </div>
  )
}
