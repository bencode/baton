import type { AdminOverview } from '@baton/shared'
import { relativeTime } from '../sessions/relative-time'
import type { PreviewLine, PreviewTone } from './ops-preview'

export type OpsSession = AdminOverview['sessions'][number]

const TONE_CLASS: Record<PreviewTone, string> = {
  user: 'text-emerald-300/90',
  tool: 'text-sky-400/80',
  text: 'text-gray-400',
  notice: 'text-gray-600 italic',
  error: 'text-red-400/80',
}

// One session on the wall: header (dot · name · status word · open button),
// meta line, then the transcript preview bottom-anchored so the newest line
// is always visible. A working card glows violet — the one element meant to
// be read from across the room. The card itself is display-only; the small
// `open ↗` is the only click target (a wall-sized hitbox invites misclicks).
export const SessionCard = ({
  session,
  workerName,
  preview,
}: {
  session: OpsSession
  workerName: string
  preview: PreviewLine[] | undefined
}) => (
  <div
    className={`overflow-hidden rounded-xl border bg-[#050505] ${
      session.busy
        ? 'border-violet-500/70 shadow-[0_0_24px_rgba(139,92,246,0.25)] ring-1 ring-violet-500/70'
        : 'border-gray-800/80'
    }`}
  >
    <div className="flex items-center gap-2 px-3 pt-2.5">
      <span
        className={`h-2 w-2 shrink-0 rounded-full bg-emerald-500 ${session.busy ? 'animate-pulse' : ''}`}
      />
      <span className="min-w-0 truncate text-sm text-gray-200">{session.name}</span>
      <span
        className={`ml-auto shrink-0 text-xs ${session.busy ? 'text-violet-300' : 'text-gray-600'}`}
      >
        {session.busy ? 'working' : 'idle'}
      </span>
      <a
        href={`/proj/${session.projectId}/session/${session.id}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`open session ${session.name}`}
        className="shrink-0 rounded border border-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:border-gray-500 hover:text-gray-200"
      >
        open ↗
      </a>
    </div>
    <div className="flex items-center gap-1.5 px-3 pt-1 text-[10px] text-gray-600">
      <span className="truncate">{workerName}</span>
      {session.model && (
        <span className="shrink-0 rounded bg-indigo-950 px-1 text-indigo-300">{session.model}</span>
      )}
      {session.planMode && (
        <span className="shrink-0 rounded bg-amber-950 px-1 text-amber-300">plan</span>
      )}
      <span className="ml-auto shrink-0">{relativeTime(session.lastActiveAt)}</span>
    </div>
    <div className="mt-1.5 flex h-44 flex-col justify-end gap-[3px] overflow-hidden px-3 pb-2.5">
      {(preview ?? []).map((l, i) => (
        <div
          // Lines have no identity across refreshes — index is the only key.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional list, fully re-rendered
          key={i}
          className={`truncate text-[10px] leading-snug ${TONE_CLASS[l.tone]}`}
        >
          {l.text}
        </div>
      ))}
      {!preview?.length && <div className="text-[10px] text-gray-700">no output yet</div>}
    </div>
  </div>
)
