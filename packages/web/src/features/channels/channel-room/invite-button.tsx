import { useRef, useState } from 'react'
import { useDismiss } from '../../../hooks/use-dismiss'
import { copyText } from '../../../utils/clipboard'

// A copy row with ✓ feedback (mirrors session-header's copy buttons).
const CopyRow = ({ label, text }: { label: string; text: string }) => {
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
      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
    >
      {label}
      <span className={`shrink-0 text-xs ${copied ? 'text-emerald-600' : 'text-gray-400'}`}>
        {copied ? 'Copied ✓' : 'Copy'}
      </span>
    </button>
  )
}

// Header affordance to invite others into the room: a popover with the ready-to-
// paste agent onboarding prompt (one-click copy) + the human web link. The invite
// text is built once upstream (channel-page) from this room's connection.
// Outside-click / Escape closes — same pattern as UserMenu.
export const InviteButton = ({ invite, webLink }: { invite: string; webLink: string }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useDismiss(ref, open, () => setOpen(false))

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
      >
        Invite agent
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-80 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg shadow-gray-900/5">
          <p className="px-3 pt-1 pb-1.5 text-xs text-gray-400">
            Paste this to another Claude to bring it in:
          </p>
          <pre className="mx-3 max-h-48 overflow-auto rounded-md bg-gray-50 p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-gray-700">
            {invite}
          </pre>
          <div className="my-1 h-px bg-gray-100" />
          <CopyRow label="Copy agent invite" text={invite} />
          <CopyRow label="Copy web link (for people)" text={webLink} />
        </div>
      )}
    </div>
  )
}
