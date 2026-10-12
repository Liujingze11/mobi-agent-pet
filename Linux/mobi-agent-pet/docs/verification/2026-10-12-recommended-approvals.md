# Recommended automatic answers — 2026-10-12

## Behavior

Supported tool and plan approvals retain the existing automatic allow behavior. Supported questions select the unique explicit recommendation for single choice, or all explicit recommendations for multiple choice. With no recommendation, ambiguous single-choice recommendations, or a free-text question, the answer remains `You choose whatever is best.` This fallback was explicitly selected by the user.

Recommendation detection accepts boolean `recommended` / `isRecommended` or an exact trailing bracketed recommendation marker in English, Chinese, Japanese or Korean. It does not select the first option by default or infer recommendations from descriptions. Original question keys and option labels are preserved, including long questions and `__proto__` keys. Invalid question sets do not yield partial answers.

Mode authorization, request-generation fencing, disabled Agent, headless, DND and unsupported-protocol fallback rules are unchanged. No Agent full-access policy is enabled. The shared unattended path also supplies these answers when a custom mode explicitly uses that policy.

## Automated checks

- Focused answer, permission, route, validation and family-roundtrip tests: 124 passed before the additional non-array options regression.
- Final helper and i18n checks: 20 passed.
- Independent review and related checks: 222 passed; no substantive finding.
- Final `npm run test:upstream`: 6440 passed, 22 skipped, 0 failed (6462 total).
- Final `npm test` (AgentLog): 316 passed, 0 failed.
- `git diff --check`: passed.

Coverage includes non-first recommendations, localized markers, exact boolean flags, negative recommendation wording, multiple recommended items, ambiguity/default handling, malformed options, long raw question keys, prototype-shaped keys and Claude/Hermes protocol responses.

## Real Claude Code validation

Claude Code 2.1.296 was launched against the user's existing configured provider/model with a private settings file, no project/user settings sources, no persisted session, strict MCP configuration and only `AskUserQuestion` available. No file or command tools were exposed. Actual user settings and integration files were not changed.

A private Electron instance loaded the real application main entry, mode controller, HTTP server and permission engine. Its current-version preferences used a private home/data folder and uninstalled integrations; subprocess launches and writes outside that sandbox were blocked. Automatic mode was confirmed through the actual controller. A test-only PreToolUse bridge forwarded the real Claude-emitted question payload to `/permission`, then translated the resulting updated input back to Claude. Production hook registration was not changed.

The actual AskUserQuestion call contained two questions:

- Single choice: Alpha / Beta (Recommended), with the recommendation second.
- Multiple choice: X (Recommended) / Y / Z (Recommended).

The real permission engine returned `Beta (Recommended)` and `X (Recommended), Z (Recommended)` with the original question array. Claude consumed those answers and completed with the expected single answer and both multi-select labels. Captured exchange assertions reported `LIVE_RECOMMENDED_ANSWERS_PASS`; no user answer was supplied.

The first non-streaming attempt did not emit a real tool call and was not counted as a successful validation. Retrying with the explicit stdio permission host and streaming protocol emitted the actual tool call and completed successfully. The private settings file containing provider environment values is removed after testing.

The streaming harness left stdin open after receiving the successful result, so the process remained alive until the harness's 110-second timeout terminated it. The successful result and captured real exchange were asserted independently; process exit itself is not claimed as a passing check. The private Electron instance then exited 0 and private provider settings were removed.

Answer encoding follows the [official Claude user-input documentation](https://code.claude.com/docs/en/agent-sdk/user-input): original question text keys and option label values, with comma-separated labels supported for multi-select.

## Limits

The live check verifies real Claude tool input and consumption through a test-only hook bridge into the real pet server. It does not verify every installed Agent or the production hook installer. Existing supported-protocol tests cover the other adapters; interactions the pet cannot intercept, including Codex native questions, retain native fallback.
