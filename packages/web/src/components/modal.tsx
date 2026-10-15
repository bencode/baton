import { type ReactNode, useEffect, useId, useRef } from 'react'

type ModalProps = {
  title: string
  onClose(): void
  className?: string
  children: ReactNode
}

export const Modal = ({ title, onClose, className = 'max-w-sm', children }: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const dismiss = () => {
    dialogRef.current?.close()
    onClose()
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault()
        dismiss()
      }}
      onMouseDown={event => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          dismiss()
      }}
      className={`ui-dialog ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold text-ui-text">
          {title}
        </h2>
        <button type="button" onClick={dismiss} aria-label="close" className="ui-icon-button">
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
