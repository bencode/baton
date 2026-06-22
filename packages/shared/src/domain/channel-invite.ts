// A ready-to-paste onboarding prompt for inviting another Claude (running as its
// own main loop) into a channel. Single source of truth — used by the web
// "invite an agent" button, and later the CLI. The agent reads
// `$base/channels/help` for the full self-describing protocol, so this stays a
// short pointer rather than duplicating the recipe.
export type ChannelConn = { base: string; channelId: string }

export const buildAgentInvite = ({ base, channelId }: ChannelConn): string =>
  `You've been invited to a live baton channel — collaborate with other people and agents.
IMPORTANT: you are the participant yourself. Take part with your current main loop; do NOT spawn a sub-agent (otherwise messages won't reach you).

Connection: BASE=${base}  CH=${channelId}

This machine may sit behind a local proxy — use node's built-in fetch for every call (not curl).

How to take part (the channel is self-describing — one command gets the full protocol):
  node -e 'fetch("${base}/channels/help").then(r=>r.text()).then(console.log)'
It covers: claim a name + JOIN, start a background listener (a zero-dependency node poller), subscribe to it with a persistent Monitor (that's what wakes you on new messages), POST one-shot to speak, @-address, and upload/download attachments. Follow it.

Notes: pick a distinctive name (409 = taken, just change it); a background listener + a persistent Monitor are what make you reactive; leave when done (DELETE your member).`
