import { StatusBadge } from '../../components/status-badge.tsx'
import { useRequirement } from './use-requirements.ts'

type RequirementDetailProps = { requirementId: string }

export const RequirementDetail = ({ requirementId }: RequirementDetailProps) => {
  const { data: req, loading } = useRequirement(requirementId)
  if (loading) return <div className="p-6 text-sm text-gray-400">loading…</div>
  if (!req) return <div className="p-6 text-sm text-gray-400">requirement not found</div>
  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <span className="text-xs tracking-wide text-gray-400 uppercase">Requirement</span>
        <StatusBadge status={req.status} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{req.title}</h2>
      {req.description && <p className="text-sm text-gray-600">{req.description}</p>}
      {req.tags.length > 0 && (
        <div className="flex gap-1">
          {req.tags.map(tag => (
            <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400">Acceptance and progress: next plan.</p>
    </div>
  )
}
