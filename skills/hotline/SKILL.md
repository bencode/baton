---
name: hotline
description: >
  Open a live Claude↔Claude back-channel between two separate Claude Code
  sessions on different machines/people. One side hosts and hands the other a
  short invite; both then relay messages in real time over baton's relay
  channel. Use when the user says "connect to my colleague's Claude / 跟同事的
  Claude Code 连一下 / 开个对讲 / 让两个 Claude 聊一下 / join this hotline /
  host a hotline / 把这个连接贴进来 connect to this channel". Two modes: relay
  (human in the loop, default) and autopilot (let the two agents talk, bounded).
---

# hotline — live Claude↔Claude channel

Two people, two Claude Code sessions, different machines. This skill wires them
into one ephemeral channel on the baton server so the agents can talk in real
time. **It talks to the relay over plain HTTP with `curl` — no `baton` CLI
required.** A channel is its own auth domain: an unguessable id + a capability
token, with nothing to do with baton projects / workers / cookies.

The relay is just three endpoints on the baton server:

| do | request | auth |
|---|---|---|
| open a channel | `POST  $BASE/relay/channels` | none (the returned token *is* the capability) |
| send a message | `POST  $BASE/relay/channels/<id>/messages`  body `{from,text}` | `Authorization: Bearer <token>` |
| stream messages | `GET   $BASE/relay/channels/<id>/stream?since=<seq>` (SSE) | `Authorization: Bearer <token>` |

The transport is the proven rooma pattern: a **background `curl` SSE stream**
appends one `data:` line per message to a file, and you tail that file with the
**Monitor tool** so each message arrives live in this conversation. You send with
a one-shot `curl` POST.

## Resolve `$BASE` first

Same priority as the CLI: explicit url > `.baton.json` `server` field >
`$BATON_URL` > localhost. Run this once and reuse `$BASE`:

```bash
BASE=$(jq -r '.server // empty' .baton.json 2>/dev/null); BASE=${BASE:-${BATON_URL:-http://localhost:3280}}
```

On a worker that already resolves to `https://baton.fmap.dev/api`. Override by
setting `BASE` directly when a peer's invite carries a different url.

## Message size — big bodies go through files, not the conversation

The harness caps how much of a single live event it surfaces (~600 chars), so a
long body gets clipped on the receiver. The background SSE stream writes the
**full** JSON line to its output file, so:

- **Receiving:** when a live `data:` line looks clipped, **Read the background
  output file** and pull the full `text` of that `seq` before acting.
- **Sending big content:** write it to a temp file and build the JSON body with
  `jq` (handles quoting / newlines), don't cram a long body onto the command
  line. See `send` below.

**Pick a distinct name** for each side (`from`). Self-messages echo back over the
channel, and you filter them out by name — if both sides use the same name,
you'll swallow the peer's messages too.

## Flows

```clojure
(defn host [me]                              ; "open a hotline / start a channel"
  ;; 1. Create the channel; capture connection params (no auth on create).
  ;;    curl -sS -X POST "$BASE/relay/channels"  → {"channelId":..,"token":..}
  ;; 2. Hand the user a peer-facing invite (see `invite`) to copy to a colleague.
  ;;    The peer pastes it into THEIR Claude Code → triggers this skill's `join`.
  ;; 3. Start listening + tail it (see `connect`).
  (connect channelId token $BASE me))

(defn join [channelId token url me]          ; peer pasted an invite block
  ;; No channel creation — just set BASE=url and connect with the pasted params.
  (connect channelId token url me))

(defn connect [cid tok base me]
  ;; ONE listener per session. Background curl appends SSE `data:` lines to a file:
  ;;   data: {"seq":1,"from":"alice","text":"hi","ts":...}
  ;; Tail that file with Monitor → each line becomes a live event here.
  (reply "connected — relaying. say a message and I'll send it; say 'let them
          talk' to hand off to autopilot."))
```

### host — open a channel

```bash
curl -sS -X POST "$BASE/relay/channels"
# → {"channelId":"<uuid>","token":"<hex>"}
```

### connect — background SSE listener + Monitor tail

Run the stream **in the background** (one per session) so it keeps appending:

```bash
# CH / TOKEN from host or the pasted invite; ME = your distinct name.
curl -sS -N -H "authorization: Bearer $TOKEN" \
  "$BASE/relay/channels/$CH/stream?since=0"
```

Then tail the background output file with the **Monitor tool** (`tail -n 0 -F
<output-path>`). Each `data:` line is one message JSON carrying the **full**
text. On every line: if `from` == your own name, ignore it (echo); otherwise it's
the peer — resolve its text (Read the output file for the full body if the live
event looks clipped) and act per the active mode.

### send — post one message

Short one-liner:

```bash
curl -sS -X POST "$BASE/relay/channels/$CH/messages" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data "$(jq -nc --arg from "$ME" --arg text "$TEXT" '{from:$from,text:$text}')"
# → {"seq":N,...}
```

Large body (from a file — dodges arg limits + shell quoting):

```bash
jq -Rs --arg from "$ME" '{from:$from, text:.}' < body.txt | \
  curl -sS -X POST "$BASE/relay/channels/$CH/messages" \
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data @-
```

## invite

`invite` = a short block the user copies to their colleague. It carries the
connection params plus a curl fallback so a peer **without this skill** can still
join by hand:

```
── Copy everything below to your peer ───────────────────────────
You're invited to a live Claude↔Claude channel. Use the `hotline` skill in
join mode, or run these directly (pick your own NAME):

  # listen (background):
  curl -sS -N -H "authorization: Bearer <token>" \
    "<base>/relay/channels/<channelId>/stream?since=0"
  # send:
  curl -sS -X POST "<base>/relay/channels/<channelId>/messages" \
    -H "authorization: Bearer <token>" -H 'content-type: application/json' \
    --data '{"from":"NAME","text":"..."}'

connection: url=<base> channel=<channelId> token=<token>
─────────────────────────────────────────────────────────────────
```

## Two modes

**relay (default) — human in the loop.** Each peer `data:` line: resolve its text
(Read the output file for the full body if clipped), surface it to your user
(`peer: …`), then wait. When your user dictates a reply, `send` it. One message at
a time, both sides human-driven. This is "let the two people talk through their
agents".

**autopilot — let the agents talk, BOUNDED.** Only when the user explicitly hands
off ("let them talk / 你俩自己聊清楚 X / sort it out with the peer"). Then, on each
incoming peer message, compose and `send` a reply yourself, ping-ponging toward
the goal. Stop and hand back to the user when ANY of:
- a bound is hit — **default ≤ 6 exchanges** from your side;
- either side sends the sentinel `[[END]]` (send it yourself when you consider it
  resolved);
- the peer goes quiet, or the goal is clearly met.
Then summarize the exchange for your user. Never loop unbounded.

## Discipline

- **One listener per session.** Don't launch a second SSE `curl` — you'll
  double-surface every message. Reuse the running one.
- **Distinct `from` names per side** (the echo filter is name-based).
- **HTTP 401/404 from a request → the invite is stale** (bad token, or the
  channel was dropped by a server restart). Re-`host` and re-share; don't retry
  blindly.
- **Dedup on reconnect.** The SSE stream replays history after `?since=`; if the
  background stream restarts, pass the last seen `seq` as `since` so you don't
  re-surface old messages. Within one stream, ignore any line whose `seq` is ≤
  the highest you've already handled.
- **Channels are ephemeral** — in-memory on the server, gone on restart, no
  history beyond the recent buffer (~200 messages). Fine for a live chat; not a
  durable log. For durable handoffs use baton sessions / tasks instead (see
  [delegate](../delegate/SKILL.md)).
- This is a **transport**, not a task system. To hand someone durable work, use
  [delegate](../delegate/SKILL.md) or [dispatch](../dispatch/SKILL.md).
