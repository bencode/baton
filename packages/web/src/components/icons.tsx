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
