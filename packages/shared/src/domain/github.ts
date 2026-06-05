// Light association to the external record a Requirement/Task references
// (e.g. a GitHub issue). Deliberately minimal — source + human number + URL.
// Content is never mirrored into baton: agents live-read it (gh issue view),
// and sync maintains the title only. Collaboration on the issue itself
// (lifecycle labels, verify, close) is the relay skill's territory.
export type ExternalRef = {
  source: 'github'
  number?: number
  url?: string
}
