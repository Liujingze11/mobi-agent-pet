# Fixed-mode keep-awake — 2026-10-12

User approved enabling working keep-awake in Normal, Background and Automatic modes. Custom keeps its independent existing switch and default.

Only the app-mode projection changes: fixed modes resolve keepAwakeWhileWorking to true regardless of stored legacy or Custom values. Existing isSessionInProgress, waiting/approval behavior, prevent-app-suspension blocker, completion release, startup recovery, mode synchronization and exit cleanup remain unchanged. Screen sleep is not blocked.

Verification:

- New policy and real-main-blocker integration tests failed before the change, then passed.
- Focused suite: 107 passed, no failures.
- Upstream suite: 6,465 passed, 22 skipped, no failures.
- Tests exercise working tasks, waiting, stable blocker through preset switches, idle completion, headless exclusion, Custom-off transition, return to Normal and explicit exit cleanup.
- Independent read-only reviewer: 42 tests passed, no substantive issues.
- Tests use a stub blocker and do not change OS sleep settings or user configuration. No actual OS-suspend test was performed.
