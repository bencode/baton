import { useCallback, useRef, useState } from 'react'
import { MoreIcon } from '../../components/icons'
import { useDismiss } from '../../hooks/use-dismiss'

// The project switcher's "⋯" actions menu: rename + delete grouped so the row
// stays uncluttered (the ＋ new-project button stays separate). Mirrors the header
// user-menu dropdown (outside-click / Escape close, restrained gray). Delete is a
// deliberate two-step — the menu flips to a confirm view that warns about the
// cascade (a project carries its sessions/workers/requirements/tasks).
type ProjectMenuProps = {
  onRename: () => void
  onDelete: () => void
}

export const ProjectMenu = ({ onRename, onDelete }: ProjectMenuProps) => {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Stable (setters never change) so the close-on-outside effect can depend on it
  // without re-subscribing every render.
  const close = useCallback(() => {
    setOpen(false)
    setConfirming(false)
  }, [])
  useDismiss(ref, open, close)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        title="project actions"
        aria-label="project actions"
        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/50"
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-64 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-gray-900/5 transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
        >
          {confirming ? (
            <div className="px-3 py-2">
              <p className="text-xs leading-snug text-gray-600">
                Delete this project? This permanently removes all its sessions, workers,
                requirements and tasks.
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onDelete()
                  }}
                  className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close()
                  onRename()
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirming(true)}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
              >
                Delete project
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
