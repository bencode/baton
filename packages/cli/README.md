# @lesscap/baton-cli

The baton CLI: register/run a **worker** on a machine and manage
workspaces/projects/requirements/tasks/sessions against a baton server.

A worker is the thing that actually runs agent sessions: it listens to the
server's command stream and, per session, spawns `claude` in a git worktree.

## Install

```sh
npm i -g @lesscap/baton-cli
```

**Prerequisite:** the machine needs the `claude` CLI on `PATH`, already logged
in (the worker spawns it to run each turn). Override the path with
`BATON_CLAUDE_BIN=/path/to/claude` if needed.

## Run a worker

```sh
# 1. cd into the git repo the agent should work in
#    (each session gets its own worktree branched off it)
cd /path/to/your-repo

# 2. register this machine as a worker for a project
baton worker register --url https://baton.fmap.dev/api --project <projectId> --name my-machine
#    → writes ./.baton.json { server, project, worker token }

# 3. run the worker daemon (foreground; Ctrl-C to stop)
baton worker run
```

The worker authenticates with its own bearer token — **no login needed**. Once
running, it shows up (alive) under the project's workers in the web back-office;
new sessions / inbound DingTalk messages are then executed by it.

`.baton.json` is per-directory local state (gitignored by convention). You can
also create it by hand before registering:

```json
{ "server": "https://baton.fmap.dev/api", "project": 2 }
```

## Other commands

`baton init | workspace | project | requirement | task | session` — run
`baton <command> --help` for details. The back-office management commands hit
gated routes; set `BATON_USER` / `BATON_PASS` to log in transparently (the
worker commands above don't need this).
