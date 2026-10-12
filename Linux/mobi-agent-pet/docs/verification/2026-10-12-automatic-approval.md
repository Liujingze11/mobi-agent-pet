# Automatic approval validation — 2026-10-12

## Scope

Test the existing automatic desktop-pet mode, without enabling an actual Agent's full-access policy or running Agent commands. No application behavior was changed.

## Automated checks

Command: `node --test runtime/clawd/test/app-mode.test.js runtime/clawd/test/app-mode-main.test.js runtime/clawd/test/custom-mode-profile.test.js runtime/clawd/test/permission-automation-policy.test.js runtime/clawd/test/permission-auto-approve.test.js runtime/clawd/test/server-route-permission.test.js runtime/clawd/test/server-codex-permission.test.js runtime/clawd/test/permission-codex-response.test.js runtime/clawd/test/permission-family-roundtrip.test.js runtime/clawd/test/codex-hook.test.js`

Result: 210 passed, no failures. Coverage includes required mode consent, current/old request generations, exit and re-entry, supported protocol adapters, ordinary permission approvals, unknown requests/native fallback, native input/passive notification exclusions and question/plan handling.

## Isolated real application and HTTP checks

Private probe `/tmp/mobi-full-auto-approval-probe.cjs` loads the actual main entry, menu mode controller, HTTP server, permission engine and native bubble windows. Private current-version preferences keep Agent integrations uninstalled; external process launches and writes outside the private folder are blocked. HTTP bodies are simulated requests, not actual Agent hook captures. Commands in those bodies are never executed. Actual user preferences and Agent permission settings are untouched.

Probe exited 0 with `AUTO_APPROVAL_NATIVE_PASS`:

- Unconfirmed Automatic selection returns confirmation-required and keeps Normal.
- Confirmed Automatic returns allow to a Codex tool request, without a bubble or pending entry.
- An unsupported/placeholder request falls back without an automatic approval.
- Supported Claude AskUserQuestion returns an updated input answer automatically.
- Claude ExitPlanMode returns allow automatically.
- Switching back to Normal leaves a request pending with a visible manual approval bubble. Client disconnect cleanup respects the existing minimum two-second display time.
- A working state event without a permission request creates no approval.
- The private Agent permission interception setting remains unchanged, and no Agent command executes.

Native DBus/VAAPI diagnostics appeared without JS/assertion failures. Initial probe assumptions were corrected: the menu context uses getAppMode, disconnected visible bubbles have a two-second minimum lifetime, and current-version fixture preferences avoid triggering the historical integration migration. These were test-harness corrections; no production fix was needed.

## Behavior requiring product discussion

Automatic currently resolves to the existing `unattended` policy. It can automate supported questions and plan reviews in addition to tool approvals. The default answer to supported questions is `You choose whatever is best.` This differs from only auto-allowing permission requests and should be explicit when defining the mode.

This records the earlier behavior. The subsequent recommendation-selection change is documented in `2026-10-12-recommended-approvals.md`; the default reply now applies only when there is no unambiguous recommendation.

## Limits

No live Claude/Codex task was launched and no actual full-access Agent configuration was tested. The tests establish the pet's handling of real HTTP traffic and its own mode isolation; upstream Agent emission of those requests remains outside this test.
