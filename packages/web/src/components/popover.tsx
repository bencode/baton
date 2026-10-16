import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

type CloseReason = 'escape' | 'outside' | 'anchor-lost'
export type PopoverProps = {
  anchor: HTMLElement | null
  label: string
  role: 'menu' | 'dialog'
  placement?: 'bottom-start' | 'bottom-end' | 'top-start'
  point?: { x: number; y: number }
  className?: string
  children: ReactNode
  onClose(reason: CloseReason): void
}
const enabledItems = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)',
    ),
  )

export const Popover = ({
  anchor,
  label,
  role,
  placement = 'bottom-start',
  point,
  className = '',
  children,
  onClose,
}: PopoverProps) => {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState({ left: 8, top: 8 })
  useLayoutEffect(() => {
    if (anchor && !anchor.isConnected) close.current('anchor-lost')
  })
  const x = point?.x
  const y = point?.y
  useLayoutEffect(() => {
    const popup = panel.current
    if (!anchor || !popup) return
    const updatePosition = () => {
      const box = anchor.getBoundingClientRect()
      const left = x ?? (placement === 'bottom-end' ? box.right - popup.offsetWidth : box.left)
      const below = y ?? box.bottom + 8
      const above = box.top - popup.offsetHeight - 8
      const top =
        placement === 'top-start'
          ? above >= 8
            ? above
            : below
          : below + popup.offsetHeight <= window.innerHeight - 8
            ? below
            : Math.max(8, above)
      const next = {
        left: Math.max(8, Math.min(left, window.innerWidth - popup.offsetWidth - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - popup.offsetHeight - 8)),
      }
      setPosition(previous =>
        previous.left === next.left && previous.top === next.top ? previous : next,
      )
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    observer.observe(popup)
    return () => observer.disconnect()
  }, [anchor, placement, x, y])
  useEffect(() => {
    const popup = panel.current
    if (!anchor || !popup) return
    const first =
      popup.querySelector<HTMLElement>('[aria-checked="true"]') ??
      popup.querySelector<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)',
      )
    const focusTarget = first ?? popup
    focusTarget.focus()
    const outside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !popup.contains(event.target) &&
        !anchor.contains(event.target)
      )
        close.current('outside')
    }
    const moved = (event: Event) => {
      if (event.target instanceof Node && popup.contains(event.target)) return
      close.current(anchor.isConnected ? 'outside' : 'anchor-lost')
    }
    document.addEventListener('mousedown', outside)
    window.addEventListener('resize', moved)
    document.addEventListener('scroll', moved, true)
    return () => {
      document.removeEventListener('mousedown', outside)
      window.removeEventListener('resize', moved)
      document.removeEventListener('scroll', moved, true)
    }
  }, [anchor])
  if (!anchor) return null
  const props = {
    ref: panel,
    tabIndex: -1,
    'aria-label': label,
    style: position,
    className: `ui-popover ${className}`,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current('escape')
        if (anchor.isConnected) anchor.focus()
        return
      }
      const menu = (event.target as HTMLElement).closest('[role="menu"]')
      if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const items = enabledItems(menu as HTMLElement)
      if (!items.length) return
      event.preventDefault()
      const index =
        document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    },
  }
  return createPortal(
    role === 'menu' ? (
      <div {...props} role="menu">
        {children}
      </div>
    ) : (
      <div {...props} role="dialog">
        {children}
      </div>
    ),
    anchor.closest('dialog[open]') ?? document.body,
  )
}
