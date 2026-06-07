---
name: provision-worker
description: >-
  Provision a NEW dedicated baton worker on the current macOS host — git clone a
  repo, register the worker, and start it under launchd so it persists. Use when
  the user says "在小龙虾上给 X 仓库/项目起一个专属 worker / 孵化一个新 worker /
  起一个跑 <模型> 的 worker / provision a worker / spin up a worker for this
  repo". The new worker sits permanently in that repo's context (no re-briefing
  each task) and can run its own model. Run this ON the host where the worker
  should live (a host worker agent there) — it needs local launchctl, the repo
  filesystem, and a logged-in reclaude. To then hand it work, use the delegate
  skill. To take one DOWN, see "Teardown" below (manual).
---

# provision-worker — spin up a dedicated worker

A worker is a long-lived `baton worker run` daemon supervised by launchd. This
skill scripts the whole birth: clone → register (with an isolated identity) →
write the plist → bootstrap → verify alive. Everything goes through one script.

**Where it runs:** ON the target macOS host, inside a *host* worker agent (the
ones under `~/Library/LaunchAgents/dev.fmap.baton-worker-*`). It needs local
`launchctl`, the repo filesystem, and a logged-in `reclaude`. A **container**
worker can't do this — it's sandboxed away from launchctl by design.

**Why dedicated workers:** a worker pinned to one repo/project never needs the
context re-explained; and each can run a different model (its own
`BATON_CLAUDE_BIN` / `ANTHROPIC_*`).

## Provision

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/provision-worker.sh" \
  --name <worker-name> \
  --repo <git-url | local-path> \
  ( --project <id> | --new-project <name> --workspace <id> ) \
  [--claude-bin /Users/<you>/.local/bin/reclaude] \
  [--dir ~/work/<name>] \
  [--server https://baton.fmap.dev/api]
```

What it does (idempotent; refuses if the plist already exists):

1. Resolves an auth token — `BATON_TOKEN` env, else the host's
   `~/work/baton/.baton.json` worker token (site-wide).
2. Resolves the project — `--project <id>`, or creates one with `--new-project`.
3. Clones the repo to `--dir` (or reuses an existing checkout / local path).
4. Registers the worker with its **own `XDG_DATA_HOME`**
   (`~/.local/share/baton-workers/<name>`) → a distinct machineId + worktrees,
   so it's independent even if it shares a project.
5. Writes `~/Library/LaunchAgents/dev.fmap.baton-worker-<name>.plist` (templated
   from the canonical `baton` worker plist) and `launchctl bootstrap`s it.
6. Polls until the new worker shows `alive: true`, then prints its **W-N** handle.

## Notes & gotchas

- **Default model = reclaude** — the host must already be `reclaude login`'d. For
  a different model, point `--claude-bin` at another wrapper, or hand-edit the
  plist's `EnvironmentVariables` to add `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`.
- **Empty repos are seeded:** a brand-new repo with zero commits can't host git
  worktrees (sessions would fail with `invalid reference`), so the script
  creates an initial empty commit and pushes it to origin (push is best-effort).
- **Name uniqueness:** the name must be unused in the target project (server
  enforces `(project, name)` unique). A collision aborts with a hint.
- **launchctl-from-launchd risk:** bootstrapping a sibling agent from inside a
  launchd-spawned process may fail to reach the `gui/` domain. If so the script
  leaves the plist in place and prints the exact `launchctl bootstrap` command —
  run it once yourself (or ask the human to).
- A new repo usually means a new project → same host machineId would be fine, but
  the per-worker `XDG_DATA_HOME` makes identity independent regardless.

## After it's up

Hand it work with the **delegate** skill (`baton session create --worker W-N`),
or open it from the web. The worker stays in its repo's context across sessions.

## Teardown (manual — not part of this skill)

```bash
launchctl bootout "gui/$(id -u)/dev.fmap.baton-worker-<name>"
rm ~/Library/LaunchAgents/dev.fmap.baton-worker-<name>.plist
baton worker destroy <W-N> --project <id> --confirm
rm -rf ~/work/<name> ~/.local/share/baton-workers/<name>   # optional
```
