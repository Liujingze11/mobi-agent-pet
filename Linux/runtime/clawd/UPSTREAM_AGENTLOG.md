# AgentLog Runtime Baseline

This directory is a source snapshot of:

- Repository: https://github.com/rullerzhou-afk/clawd-on-desk.git
- Commit: `45d388aa661824443cd96779ff0a5d277972bd10`
- Upstream version: `0.13.0`

AgentLog-specific code lives under `runtime/agentlog/`. Narrow integration
patches inside this snapshot are listed in the Phase 1 implementation plan.
Internal `clawd` protocol names and managed hook markers remain unchanged for
compatibility.

To compare this baseline with upstream:

```bash
git diff --no-index /path/to/clawd-on-desk runtime/clawd
```
