// Tests previously here were split into per-area files under app/*.test.ts:
//   - app/core.test.ts      (/health + workspace→project→requirement→task e2e +
//                            items lookup + error shape + real node server)
//   - app/sessions.test.ts  (register + messages + worker events + busy derive)
//   - app/workers.test.ts   (worker register fresh + name collision)
//   - app/sse.test.ts       (SSE replay + live tail)
// Shared helpers live in app/test-helpers.ts. This file is intentionally empty
// so the test glob still matches without double-counting.
