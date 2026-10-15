import type { ReactNode } from 'react'

// Shared inline SVG glyphs (stroke=currentColor convention, same as the
// composer icons in features/sessions/session-detail/icons.tsx).

export const PencilIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M11.1 2.4a1.56 1.56 0 0 1 2.2 2.2L5.4 12.5l-3 .8.8-3 7.9-7.9z" />
    <path d="M9.8 3.7l2.2 2.2" />
  </svg>
)

export const ChevronDownIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M4 6l4 4 4-4" />
  </svg>
)

export const MenuIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </svg>
)

// Horizontal "⋯" — a more-actions affordance. Filled dots (not stroked) so it
// reads as a kebab menu; inherits color via fill=currentColor.
export const MoreIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="3.5" cy="8" r="1.3" />
    <circle cx="8" cy="8" r="1.3" />
    <circle cx="12.5" cy="8" r="1.3" />
  </svg>
)

// Clock face — the loops affordance (recurring, interval-scheduled wake-ups).
// Reads clearer than a generic cycle arrow; shared by the header control and the
// rail's per-session indicator so both surfaces speak the same loops language.
export const ClockIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 4.6V8h2.6" />
  </svg>
)

// Monochrome trash glyph (styles via currentColor, unlike a colored emoji).
export const TrashIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.5 4h11M6 4V2.5h4V4M4.5 4l.6 9h5.8l.6-9" />
  </svg>
)

export const StopIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="4" y="4" width="8" height="8" rx="1" />
  </svg>
)

export const LogoutIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="13"
    height="13"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6" />
    <path d="M10.5 11l3-3-3-3" />
    <path d="M13.5 8H6" />
  </svg>
)

const StrokeGlyph = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
)

export const PlusIcon = () => (
  <StrokeGlyph>
    <path d="M8 3v10M3 8h10" />
  </StrokeGlyph>
)
export const CloseIcon = () => (
  <StrokeGlyph>
    <path d="m4 4 8 8m0-8-8 8" />
  </StrokeGlyph>
)
export const SearchIcon = () => (
  <StrokeGlyph>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </StrokeGlyph>
)
export const WorkerIcon = () => (
  <StrokeGlyph>
    <rect x="3" y="5" width="10" height="9" rx="2.5" />
    <path d="M8 2v3M5.5 8.5h.01M10.5 8.5h.01M6 11h4" />
  </StrokeGlyph>
)
export const ServiceIcon = () => (
  <StrokeGlyph>
    <rect x="2" y="2.5" width="12" height="4.5" rx="1.5" />
    <rect x="2" y="9" width="12" height="4.5" rx="1.5" />
    <path d="M5 4.7h.01M5 11.2h.01M8 4.7h3M8 11.2h3" />
  </StrokeGlyph>
)
export const SettingsIcon = () => (
  <StrokeGlyph>
    <path d="m6 2-1 2-2 1-1 3 1 2 2 1 1 3h4l1-3 2-1 1-2-1-3-2-1-1-2Z" />
    <circle cx="8" cy="8" r="2" />
  </StrokeGlyph>
)
export const InfoIcon = () => (
  <StrokeGlyph>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7v4M8 4.5h.01" />
  </StrokeGlyph>
)
export const CopyIcon = () => (
  <StrokeGlyph>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10 5.5v-3H2.5V10h3" />
  </StrokeGlyph>
)
