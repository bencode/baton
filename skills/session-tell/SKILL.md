---
name: session-tell
description: >
  Message another baton agent session by its session number and get its reply
  back as a new message. Use when another session needs to answer a question,
  confirm something or take in information, when the user says "问一下 session
  12 / 告诉 #34 / 发消息给另一个 session / ask session 12 / tell session 34", or
  when you receive a message that starts with "[Message from baton session".
---

# session-tell

```bash
baton session tell <session-id> "<message>"
```

Sessions only talk through messages. You cannot see another session's
conversation, and it cannot see yours. If you need to know something, ask it;
do not try to read its events.

## Sending

- Make the message self-contained. The other agent knows nothing about your
  conversation, so include the goal, paths and whatever else it needs.
- After sending, end your turn. Do not poll or wait: a reply arrives as a new
  message and wakes you.
- If the command reports a worker offline or a terminal open, tell the user. The
  message was not delivered.
- Only sessions in your workspace are reachable.

## Receiving

A message from another agent starts with its session number and the command to
reply with. What you write in your own turn stays in your session, so use that
command if you want the sender to see it. Reply only if a response is actually
needed; do not send acknowledgements or thanks.

## When sending is refused

After 10 agent messages in a row with no one else speaking, `tell` refuses to
send. Stop and tell the user what is happening. Do not switch to
`baton session send` to get around it.
