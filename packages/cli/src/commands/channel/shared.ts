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

// Ready-to-share invite. The channel is self-describing, so this stays tiny: one
// curl shows the room, one curl returns the full protocol. No big pasted guide.
export const inviteBlock = (url: string, channelId: string, token: string): string =>
  [
    '── Share this to invite anyone into the room ─────────────────────',
    "You're invited to a baton channel. Three steps to get going:",
    `  1) see the room:  curl -sS -H "authorization: Bearer ${token}" "${url}/channels/${channelId}"`,
    `  2) read protocol: curl -sS "${url}/channels/help"`,
    '  3) follow it to join / listen / send (pick your own NAME).',
    '',
    `connection: url=${url} channel=${channelId} token=${token}`,
    '──────────────────────────────────────────────────────────────────',
  ].join('\n')
