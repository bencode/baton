import type { PreviewLine } from '../ops-preview'
import { SessionCard } from '../session-card'
import type { Section } from './sections'

type OpsBoardProps = {
  sections: Section[]
  workerName: Map<number, string>
  previews: Map<number, PreviewLine[]>
}

// The wall body: one section per project, each a header of worker dots over a
// responsive grid of live session cards.
export const OpsBoard = ({ sections, workerName, previews }: OpsBoardProps) => (
  <>
    {sections.map(sec => (
      <section key={sec.key} className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="text-xs tracking-[0.35em] text-gray-600">{sec.title}</h2>
          <span className="flex items-center gap-3 text-[10px] text-gray-600">
            {sec.workers.map(w => (
              <span key={w.id} className="flex items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${w.connected ? 'bg-emerald-500' : 'bg-gray-700'}`}
                />
                {w.name}
              </span>
            ))}
            {sec.dormant > 0 && <span>+{sec.dormant} dormant</span>}
          </span>
        </div>
        {sec.cards.length === 0 ? (
          <div className="text-xs text-gray-700">all quiet</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sec.cards.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                workerName={workerName.get(s.workerId) ?? `W-${s.workerId}`}
                preview={previews.get(s.id)}
              />
            ))}
          </div>
        )}
      </section>
    ))}
  </>
)
