// Inline SVG glyphs for the composer (stroke=currentColor convention) plus the
// indeterminate spinner shown on the send button while a send/upload is in flight.

export const PaperclipIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M13 6.5l-5.6 5.6a2.5 2.5 0 0 1-3.5-3.5l5.9-5.9a1.5 1.5 0 0 1 2.1 2.1l-5.9 5.9a.5.5 0 0 1-.7-.7l5.4-5.4" />
  </svg>
)

export const SendIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8 13V3M4 7l4-4 4 4" />
  </svg>
)

export const Spinner = () => (
  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
)

// Filled rounded square: the universal "stop" glyph for the 停止 button.
export const StopIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3.5" y="3.5" width="9" height="9" rx="2.5" />
  </svg>
)
