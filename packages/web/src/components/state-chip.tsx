// Right-column state indicator shared by every list row in the left panel.
// Per design principle: left column = structure (code, name, hierarchy);
// right column = state, rendered ONLY when interesting. The default/baseline
// status for each entity (active for requirement, todo for task, idle for
// session) renders nothing — absence of a chip IS the "calm baseline" signal.
//
// Two visual variants:
//   - pulse: small blue dot — used for "in motion right
//            now" states (task in_progress, session streaming). Animation is
//            the signal; no text needed.
//   - text:  small uppercase label in a semantic color. Used for terminal
//            states (DONE green, FAILED red) and dim states (CANCELLED /
//            CLOSED / DETACHED / OFFLINE gray).
export type ChipTone = 'success' | 'danger' | 'muted'

type StateChipProps =
  | { kind: 'pulse'; label?: string }
  | { kind: 'text'; label: string; tone: ChipTone }
  | { kind: 'none' }

const TONE_CLASSES: Record<ChipTone, string> = {
  success: 'text-ui-success',
  danger: 'text-ui-danger',
  muted: 'text-ui-muted',
}

export const StateChip = (props: StateChipProps) => {
  if (props.kind === 'none') return null
  if (props.kind === 'pulse')
    return (
      <span
        role="img"
        aria-label={props.label ?? 'in progress'}
        className="animate-breathe h-1.5 w-1.5 shrink-0 rounded-full bg-ui-accent"
      />
    )
  return (
    <span className={`shrink-0 text-[11px] font-medium ${TONE_CLASSES[props.tone]}`}>
      {props.label}
    </span>
  )
}
