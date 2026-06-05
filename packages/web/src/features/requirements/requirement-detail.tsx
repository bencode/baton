import type { Code, Id } from '@baton/shared'
import { GithubLink } from '../../components/github-link'
import { Markdown } from '../../components/markdown'
import { StatusBadge } from '../../components/status-badge'
import { useRequirementByCode } from './use-requirements'

type RequirementDetailProps = { projectId: Id; code: Code }

export const RequirementDetail = ({ projectId, code }: RequirementDetailProps) => {
  const { data: req, loading } = useRequirementByCode(projectId, code)
  if (loading) return <div className="p-6 text-sm text-gray-400">loading…</div>
  if (!req) return <div className="p-6 text-sm text-gray-400">requirement not found</div>
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
        <span>Requirement</span>
        <span aria-hidden="true" className="text-gray-300">
          ·
        </span>
        <span className="font-mono normal-case tracking-normal text-gray-400">{req.code}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">{req.title}</h2>
        <StatusBadge status={req.status} />
        <GithubLink external={req.external} />
      </div>
      {req.description && <p className="text-sm text-gray-600">{req.description}</p>}
      {req.body && <Markdown text={req.body} />}
    </div>
  )
}
