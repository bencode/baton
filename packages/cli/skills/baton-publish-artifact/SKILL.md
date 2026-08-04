---
name: baton-publish-artifact
description: Publish agent-generated files as public Baton Project Artifact links. Use after producing a file the user needs to preview, open, share, or download from a Baton session.
---

# Baton Publish Artifact

Create and validate the requested file, then publish it from the current Baton worktree.

## Workflow

1. Confirm the final file is complete and opens correctly.
2. Publish each deliverable separately:

   ```bash
   baton artifact publish <file> --json
   ```

3. Read the JSON result and include its `url` as a clickable link in the final response. Use `downloadUrl` only when the user specifically needs a forced download.

## Safety

- Treat every Artifact URL as public to anyone who has the link.
- Never publish `.env` files, credentials, access tokens, private keys, secret configuration, or user-provided input attachments.
- Inspect ambiguous files before publishing. If the output may contain sensitive data, ask the user before publishing it.
