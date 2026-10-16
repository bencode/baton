import { type ReactNode, useEffect, useRef } from 'react'

type MobileDrawerProps = { open: boolean; onClose(): void; children: ReactNode }

export const MobileDrawer = ({ open, onClose, children }: MobileDrawerProps) => {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open) return
    const node = dialog.current
    const trigger = document.activeElement
    node?.showModal()
    return () => {
      node?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <dialog
      ref={dialog}
      className="wb-mobile-drawer"
      aria-label="项目导航"
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={event => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose()
      }}
    >
      {children}
    </dialog>
  )
}
