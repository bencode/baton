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
time. Everything goes through the `baton` CLI (already on PATH); a channel is a
random id + capability token — its own auth domain, nothing to do with baton
projects/workers.

The transport is the proven rooma pattern: a **background `baton relay listen`
process** prints one JSON line per peer message, and you tail it with the
**Monitor tool** so each message arrives live in this conversation. You send with
a one-shot `baton relay send`.

**Big messages go through files, not the conversation.** The live event surface
caps how much of a single message it shows (~600 chars), so `listen` spills every
message's full text to a file and emits only `{seq, from, chars, truncated,
preview, file}`. When `truncated` is true, **Read `file` to get the complete
text** before acting. To SEND something large, write it to a temp file and use
`baton relay send <ch> --token T --from N --file <path>` (don't cram a long body
into the positional text).

**Pick a distinct name** for each side (`--from`). Self-messages echo back over
the channel and are filtered by name — if both sides use the same name, you'll
swallow the peer's messages too.

## Flows

```clojure
(defn host [me]                              ; "open a hotline / start a channel"
  ;; 1. Create the channel; capture connection params.
  (def j (baton relay host --name <me> --json))   ; → {channelId, token, url}
  ;; 2. Hand the user a peer-facing invite to copy to their colleague. The peer
  ;;    pastes it into THEIR Claude Code, which triggers this skill's `join`.
  (reply (invite j))
  ;; 3. Start listening + tail it (see `connect`).
  (connect (:channelId j) (:token j) (:url j) <me>))

(defn join [channelId token url me]          ; peer pasted an invite block
  ;; No channel creation — just connect with the pasted params.
  (connect channelId token url <me>))

(defn connect [cid tok url me]
  ;; ONE listener per session. Background process emits JSON lines:
  ;;   {"type":"relay.listening",...} once, then {"type":"relay.message",...}
  ;;   per peer message, {"type":"relay.error","error":"401 ..."} on trouble.
  (def bg (Bash :run_in_background true
                (str "baton relay listen " cid " --token " tok
                     " --from " me " --url " url)))
  ;; Tail the background output → each line becomes a live event here.
  (Monitor (str "tail -n 0 -F " (:output-path bg)))
  (reply "connected — relaying. say a message and I'll send it; say 'let them
          talk' to hand off to autopilot."))

(defn send [cid tok url me text]
  (baton relay send <cid> --token <tok> --from <me> --text "<text>" --url <url>))
```

`invite` = a short block the user copies to their colleague:

```
[hotline] You're invited to a live Claude↔Claude channel. Paste this whole block
into your Claude Code — it will join and relay messages between us.
  connection: url=<url> channel=<channelId> token=<token>
  (your name on the channel: pick one, e.g. your handle)
If the hotline skill isn't installed, run instead:
  baton relay listen <channelId> --token <token> --from NAME --url <url>   # background
  baton relay send   <channelId> --token <token> --from NAME --text "..."  # to reply
```

## Two modes

**relay (default) — human in the loop.** Each `relay.message` event: resolve its
text (Read `file` if `truncated`, else use `preview`), surface it to your user
(`peer: …`), then wait. When your user dictates a reply, `send` it. One message at
a time, both sides human-driven. This is "let the two people talk through their
agents".

**autopilot — let the agents talk, BOUNDED.** Only when the user explicitly hands
off ("let them talk / 你俩自己聊清楚 X / sort it out with the peer"). Then, on each
incoming `relay.message`, compose and `send` a reply yourself, ping-ponging
toward the goal. Stop and hand back to the user when ANY of:
- a bound is hit — **default ≤ 6 exchanges** from your side;
- either side sends the sentinel `[[END]]` (send it yourself when you consider it
  resolved);
- the peer goes quiet, or the goal is clearly met.
Then summarize the exchange for your user. Never loop unbounded.

## Discipline

- **One listener per session.** Don't launch a second `relay listen` — you'll
  double-surface every message. Reuse the running one.
- **Distinct `--from` names per side** (the echo filter is name-based).
- **`relay.error` with 401/404 → the invite is stale** (bad token, or the channel
  was dropped by a server restart). Re-`host` and re-share; don't retry blindly.
- **Channels are ephemeral** — in-memory on the server, gone on restart, no
  history beyond the recent buffer. Fine for a live chat; not a durable log. For
  durable handoffs use baton sessions / tasks instead (see [delegate](../delegate/SKILL.md)).
- **Default url** resolves from `--url` > `.baton.json` > `BATON_URL` >
  localhost. On a worker that's already `baton.fmap.dev`; pass `--url` only to
  override.
- This is a **transport**, not a task system. To hand someone durable work, use
  [delegate](../delegate/SKILL.md) or [dispatch](../dispatch/SKILL.md).
