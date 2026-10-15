import type { Code, Id } from '@baton/shared'
import { Markdown } from '../../components/markdown'
import { StatusBadge } from '../../components/status-badge'
import { useRequirementByCode } from './use-requirements'

type RequirementDetailProps = { projectId: Id; code: Code }

export const RequirementDetail = ({ projectId, code }: RequirementDetailProps) => {
  const { data: req, loading } = useRequirementByCode(projectId, code)
  if (loading) return <div className="p-6 text-sm text-ui-muted">loading…</div>
  if (!req) return <div className="p-6 text-sm text-ui-muted">requirement not found</div>
  return (
    <div className="ui-page flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-xs text-ui-muted">
        <span>Requirement</span>
        <span aria-hidden="true" className="text-ui-muted">
          ·
        </span>
        <span className="font-mono normal-case tracking-normal text-ui-muted">{req.code}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="ui-page-title">{req.title}</h2>
        <StatusBadge status={req.status} />
      </div>
      {req.description && <p className="text-sm text-ui-muted">{req.description}</p>}
      {req.body && <Markdown text={req.body} />}
    </div>
  )
}
