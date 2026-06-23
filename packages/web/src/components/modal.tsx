import { type ReactNode, useEffect, useRef } from 'react'

// Centered overlay modal. No shared one existed before; account settings and the
// add-worker guide both use it. Escape / backdrop click closes. `className`
// overrides the card width (default max-w-sm).
type ModalProps = {
  title: string
  onClose: () => void
  className?: string
  children: ReactNode
}

export const Modal = ({ title, onClose, className = 'max-w-sm', children }: ModalProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is the click-to-close target
    <div
      onMouseDown={e => {
        if (!cardRef.current?.contains(e.target as Node)) onClose()
      }}
      className="fixed inset-0 z-30 grid place-items-center bg-gray-900/30 px-4"
    >
      <div
        ref={cardRef}
        className={`w-full ${className} rounded-xl border border-gray-200 bg-white p-5 shadow-xl`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="text-gray-400 transition-colors hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
