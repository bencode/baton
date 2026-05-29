// Tests previously here were split into per-feature files:
//   - util.test.ts                       (splitCsv)
//   - commands/session.test.ts           (parseEnvPairs + newSession)
//   - session/runner.test.ts             (runTurn)
//   - commands/worker.test.ts            (readOrCreateMachineId + registerWorker)
//   - commands/handlers.test.ts          (createWorkspace / removeWorkspace /
//                                         setRequirementStatus / createTask)
// This file is intentionally empty so the test runner glob still matches
// without re-counting the same cases. Safe to delete once you're sure nothing
// references `cli.test.ts` directly.
