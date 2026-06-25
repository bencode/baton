# baton

**An agent collaboration engine — hand work to your agents, from anywhere.**

A persistent server holds the shared collaboration state: workspaces → projects
→ requirements (`R-N`) → tasks (`T-N`). *Workers* (`W-N`) — machines running a
coding agent against a real repo — register themselves and pick up work as
*sessions*, each executing in its own git worktree. Humans reach the same
sessions from the web UI, DingTalk, or Feishu; the name is the relay-baton
metaphor: work handed from node to node.

```
  web UI ─┐
 DingTalk ┼──▶  server (Hono + SQLite)  ◀──SSE──  workers (baton CLI + agent)
   Feishu ┘        baton.example.com                 sessions in git worktrees
```

## Design notes

- **Collaboration dimension only** — specs, docs and code live in git; baton
  stores references, never copies content.
- **Light GitHub sync** — issues mirror into requirements as number + title +
  status + link; bodies and discussion stay on GitHub.
- **Share links** — every session has an unguessable `/s/:token` page; anyone
  with the link can read and write into the conversation.
- **Interactive terminal** — open any session in a real terminal in the browser
  (xterm.js over a server-bridged WebSocket); the worker runs the agent in a pty
  for hands-on, human-in-the-loop control alongside the headless relay — and it
  works for a remote worker with no inbound port, over plain https.
- **Delegation** — a session can list workers and open a session on any other
  worker by its global `W-N` handle (see `skills/delegate`).

## Packages

| package | what |
|---|---|
| `packages/server` | API + state (Hono, Prisma/SQLite, SSE) |
| `packages/web` | SPA (React, Vite, Tailwind) |
| `packages/cli` | [`@lesscap/baton-cli`](https://www.npmjs.com/package/@lesscap/baton-cli) — worker daemon + management commands |
| `packages/shared` | domain types shared by all of the above |
| `packages/dingtalk` / `packages/feishu` | chat bridges (long-connection bots) |
| `skills/` | agent skills (baton workflow, GitHub sync, delegation) |
| `docker/` | compose stack for the server + bridges, and a containerized worker |

## Quick start

```bash
# server + web (dev)
pnpm install
pnpm --filter @baton/server db:migrate
pnpm --filter @baton/server dev        # api on :3280
pnpm --filter @baton/web dev           # SPA on :5280, proxies /api

# a worker, on any machine with a coding agent installed
npm i -g @lesscap/baton-cli
baton worker register --url <server-url> --project <id> --name <name>
baton worker run
```

## Development

```bash
pnpm check   # biome + typecheck + tests, all packages
```

## License

[MIT](LICENSE)
