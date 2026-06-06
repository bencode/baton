# baton worker — containerized (colima / Docker)

Runs a baton worker + a claude-code agent inside a Linux container. The
container is the security boundary: claude runs with
`--dangerously-skip-permissions`, but can only touch the mounted repo and the
named volumes — not the rest of the host.

Uses the **published** `@lesscap/baton-cli`, so this needs no baton source — just
the three files in this directory.

## Prereqs (Mac host)

```sh
brew install colima docker docker-compose
colima start --cpu 4 --memory 8 --mount-type virtiofs --mount-writable
```

## Setup

```sh
# Put these files somewhere on the host, e.g. ~/trantor-daily/.worker/
cp .env.example .env
# Edit .env: BATON_REPO_DIR + ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN (your proxy)
```

## Smoke-test claude auth first

```sh
docker compose -f worker-compose.yml run --rm --entrypoint claude worker -p "ping"
```

Should print a reply. If not, fix `ANTHROPIC_*` in `.env` before continuing.

## Run

```sh
docker compose -f worker-compose.yml up -d --build
docker compose -f worker-compose.yml logs -f worker
```

The entrypoint registers the worker (idempotent — keyed by a machineId on the
`baton_state` volume) then runs the daemon. The worker shows up under the daily
project's workers on https://baton.fmap.dev .

## Notes

- **arch**: `Dockerfile.worker` installs the `linux-arm64` claude-code native
  package. On an amd64 host change it to `linux-x64`.
- **auth (this version)**: env-based Anthropic-compatible proxy. To instead use
  a logged-in Claude subscription, mount `~/.claude/.credentials.json` into the
  container and drop the `ANTHROPIC_*` env — a future variant.
- **git push**: uncomment the `.gitcfg` mount in `worker-compose.yml` and drop a
  `credentials` file there (`https://USER:TOKEN@host`).
- **skills**: drop Claude Code skills into `./skills/` (mounted to
  `~/.claude/skills`, read-only). They become user-level skills, available in
  every session — install/edit on the host, no rebuild. Skills that shell out to
  external CLIs (e.g. `tcollab`, `erda-cli`) only work if those CLIs are also
  installed in the image.
- **second worker, same repo**: a repo dir holds one `.baton.json` (one worker
  identity). To run a second worker against the same repo, copy this dir and in
  the copy's `.env` set `COMPOSE_PROJECT_NAME` (distinct volumes + container
  names → a fresh `machineId` → a distinct worker) **and** `BATON_WORKER_CONFIG`
  (entrypoint.sh passes it to the CLI as `--config`, pointing at a config file on
  the `baton_state` volume, e.g. `/home/baton/.local/share/baton/config.json`,
  instead of `/repo/.baton.json`). Without it the two daemons would fight over
  `/repo/.baton.json`. The `--config` flag does not propagate to child processes,
  so the session children and the agent's bare `baton` calls still resolve their
  worktree's own `.baton.json`.
- **claude via reclaude (baked into the image)**: reclaude is a `claude` wrapper
  that authenticates through the reclaude.ai gateway (subscription-style access).
  Routing the stock claude through reclaude's *proxy* does NOT work — the gateway
  only accepts genuine reclaude-CLI traffic — so install the reclaude binary into
  the image instead and drive it as the claude executable:
  1. Build with `--build-arg INSTALL_RECLAUDE=1` (installs `reclaude` to
     `~/.local/bin`; the image pre-creates `~/.reclaude` so a volume mounted
     there is baton-owned and writable).
  2. Mount a named volume at `/home/baton/.reclaude` (holds the device login +
     reclaude's own claude CLI cache, downloaded once on first run, ~245 MB).
  3. In `.env` set `BATON_CLAUDE_BIN=/home/baton/.local/bin/reclaude` (and drop
     the `ANTHROPIC_*` vars). No proxy/CA needed — the container reaches
     reclaude.ai directly.
  4. One-time device login inside the running container (login state persists on
     the `.reclaude` volume, survives restarts):
     `docker compose -f worker-compose.yml exec worker reclaude login` — open the
     printed URL, approve, done. Verify with a `reclaude -p ping` exec.
- **reference repos**: to let the agent read (not modify) other repos, put them
  in a host dir, give colima a read-only mount (`--mount <dir>:r`), bind it to
  `/resources:ro`, and set `BATON_ADD_DIRS` in `.env` to those absolute paths
  (colon-separated, e.g. `/resources/engine-shell:/resources/foo`). The runner
  passes them as the SDK's `--add-dir`, so the agent treats them as searchable
  workspace roots — `permissions.additionalDirectories` in `settings.json` is
  NOT honored under `bypassPermissions`. The agent works in its `/repo`
  worktree; the add-dirs are read-only context it can grep/read.
