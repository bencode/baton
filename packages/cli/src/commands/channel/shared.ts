import type { ChannelMember } from '@baton/shared'

// Helpers shared across the channel subcommands. Kept tiny and dependency-free.

// Slurp stdin — `send` falls back to it for large bodies (dodges CLI arg limits).
export const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Render the online roster as an indented list (used by `join` + `about`/`members`).
export const renderRoster = (members: ChannelMember[]): string =>
  members.length ? members.map(m => `  ${m.name} (${m.kind})`).join('\n') : '  (nobody online)'

// Web chat-room link for humans: the API base minus its `/api` mount → the SPA
// origin, with the token in the URL hash. Returns null for a bare host (dev), which
// has no web UI alongside.
const webLink = (url: string, channelId: string, token: string): string | null => {
  const origin = url.replace(/\/api\/?$/, '')
  return origin === url ? null : `${origin}/channel/${channelId}#token=${token}`
}

// Ready-to-share invite. Humans get a one-click web link; agents get the two
// self-describing curls (the channel documents itself). No big pasted guide.
export const inviteBlock = (url: string, channelId: string, token: string): string => {
  const web = webLink(url, channelId, token)
  return [
    '── Share this to invite anyone into the room ─────────────────────',
    ...(web ? [`Humans — open in a browser:  ${web}`, ''] : []),
    'Agents — two curl steps:',
    `  1) see the room:  curl -sS -H "authorization: Bearer ${token}" "${url}/channels/${channelId}"`,
    `  2) read protocol: curl -sS "${url}/channels/help"  (then join / listen / send, pick your own NAME)`,
    '',
    `connection: url=${url} channel=${channelId} token=${token}`,
    '──────────────────────────────────────────────────────────────────',
  ].join('\n')
}
