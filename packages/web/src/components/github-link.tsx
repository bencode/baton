import type { ExternalRef } from '@baton/shared'

// Link to the GitHub issue a requirement/task mirrors. Renders nothing while
// the row is local-only or its push to GitHub is still pending (no url yet).
export const GithubLink = ({ external }: { external?: ExternalRef }) => {
  if (external?.url === undefined) return null
  return (
    <a
      href={external.url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-gray-400 transition-colors hover:text-gray-600 hover:underline"
    >
      GitHub{external.number !== undefined ? ` #${external.number}` : ''} ↗
    </a>
  )
}
