import { type ReactNode, useEffect, useRef } from 'react'

type MobileDrawerProps = { open: boolean; onClose: () => void; children: ReactNode }

// Phone-only slide-in for the resource rail: a dimmed overlay plus a left panel
// that the shell shows in place of the desktop split. Dismiss mirrors UserMenu /
// TabBar (outside mousedown + Escape); selecting an item closes it from the
// caller's open handler. Enter animates via @starting-style (same vocabulary as
// the user menu); close unmounts instantly. Respects prefers-reduced-motion.
export const MobileDrawer = ({ open, onClose, children }: MobileDrawerProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-gray-900/30 transition-opacity duration-200 motion-reduce:transition-none starting:opacity-0"
      />
      <div
        ref={panelRef}
        className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-gray-50 pt-[env(safe-area-inset-top)] shadow-xl transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none starting:-translate-x-full"
      >
        {children}
      </div>
    </div>
  )
}
