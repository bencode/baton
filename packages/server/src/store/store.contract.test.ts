// Tests previously here were split into per-domain files under store/contract/:
//   - contract/workspace.test.ts   (CRUD round-trip + cascade delete)
//   - contract/requirement.test.ts (R-N codes + JSON fields + status update)
//   - contract/task.test.ts        (T-N codes + dependsOn + counter + summarize/isReady)
//   - contract/session.test.ts     (register + isBusy + appendEvent + pending lifecycle + close)
//   - contract/worker.test.ts      (register rules 2a/1/2c + close re-register)
// Shared harness lives in contract/helpers.ts. This file is intentionally empty
// so the test glob still matches without double-counting.
