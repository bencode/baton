import type { RequirementStatus, TaskStatus } from '@baton/shared'

// Detail-view status label: ring-style pill — reads as
// "tag/label", not "highlighted text". For dense rows use <StatusDot> instead.
// Sessions used to feed a SessionState string here in M2.5; in M2.6 they're
// expressed as derived alive/busy booleans, so this component only takes the
// product/task vocabulary now.
const STYLES: Record<string, string> = {
  active: 'bg-ui-selected text-ui-accent ring-1 ring-inset ring-ui-accent-border/60',
  done: 'bg-ui-success-surface text-ui-success ring-1 ring-inset ring-ui-success-border/60',
  in_progress: 'bg-ui-selected text-ui-selected-text ring-1 ring-inset ring-ui-accent-border',
  blocked: 'bg-ui-warning-surface text-ui-warning ring-1 ring-inset ring-ui-warning-border',
  busy: 'bg-ui-selected text-ui-selected-text ring-1 ring-inset ring-ui-accent-border',
  streaming: 'bg-ui-selected text-ui-selected-text ring-1 ring-inset ring-ui-accent-border',
  failed: 'bg-ui-danger-surface text-ui-danger ring-1 ring-inset ring-ui-danger-border/60',
  todo: 'bg-ui-panel text-ui-muted ring-1 ring-inset ring-ui-border',
  cancelled: 'bg-ui-panel text-ui-muted ring-1 ring-inset ring-ui-border',
  idle: 'bg-ui-success-surface text-ui-success ring-1 ring-inset ring-ui-success-border/60',
  closed: 'bg-ui-hover text-ui-muted ring-1 ring-inset ring-ui-border',
  offline: 'bg-ui-hover text-ui-muted ring-1 ring-inset ring-ui-border',
  detached: 'bg-ui-surface text-ui-muted ring-1 ring-inset ring-ui-border',
}

const LABELS: Record<string, string> = { in_progress: 'in progress' }

type StatusBadgeProps = {
  // Loose string union — session view code computes labels like
  // 'streaming' / 'idle' / 'detached' / 'closed' / 'offline' at the call site,
  // free of a shared enum.
  status:
    | RequirementStatus
    | TaskStatus
    | 'idle'
    | 'busy'
    | 'streaming'
    | 'closed'
    | 'offline'
    | 'detached'
}

export const StatusBadge = ({ status }: StatusBadgeProps) => (
  <span
    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${STYLES[status] ?? 'bg-ui-panel text-ui-muted ring-1 ring-inset ring-ui-border'}`}
  >
    {LABELS[status] ?? status}
  </span>
)
