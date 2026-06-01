import { useState } from 'react'

// A focused inline rename input: opens prefilled + selected, Enter/blur commits
// (only when changed + non-blank), Esc cancels. Mirrors the session-header
// SessionName edit mode, generalized for the workspace/project switchers.
type InlineRenameProps = {
  name: string
  ariaLabel: string
  onCommit: (next: string) => void
  onCancel: () => void
}

export const InlineRename = ({ name, ariaLabel, onCommit, onCancel }: InlineRenameProps) => {
  const [draft, setDraft] = useState(name)
  const done = () => {
    const next = draft.trim()
    if (next && next !== name) onCommit(next)
    else onCancel()
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: edit opens on explicit user click
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={done}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          done()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="w-full rounded-md border border-blue-400 px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  )
}
