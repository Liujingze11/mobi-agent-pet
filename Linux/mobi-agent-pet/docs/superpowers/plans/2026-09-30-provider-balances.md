# 供应商余额与桌宠额度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobi 能查询已保存供应商的真实余额或套餐额度，并在供应商页和桌宠空间对应 Agent 下正确显示。

**Architecture:** 主进程通过源自 CC Switch 的受限查询模板取得结果，归一化并缓存；渲染进程只接收金额、单位、剩余量、查询时间及状态。桌宠现有 Agent 速率额度保持原来源，供应商余额以独立数据类型并列展示，不互相换算。

**Tech Stack:** Electron/Node HTTPS、better-sqlite3、现有 Clawd 状态快照、React、node:test、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-30-provider-management-design.md`；依赖前两个供应商计划完成。

## Global Constraints

- 查询只使用当前启用的切换型供应商；共存型工具按每个已添加账户分别显示。
- 金额为 `{ amount, currency }`，套餐额度为 `{ remaining, unit, resetAt? }`；不得把 Token 或百分比推算成金额。
- 内置模板只向列明的 HTTPS 主机发送凭据；自定义地址须用户明确配置。无查询规则时显示无数据，不显示零。
- 不执行用户输入的 JavaScript；第二阶段的自定义查询采用受限请求和 JSON 字段映射。
- 不自动提交、不打包；本阶段交付升至 `0.1.25`，并更新中文日志。

## Review Focus

1. 同一 Agent 有多个 Key：桌宠不能显示非当前账户余额；Task 3、4 覆盖。
2. 共存型工具有多个账户：每个余额独立标识，不合并金额或币种；Task 4 覆盖。
3. 查询超时、返回格式改变、401：保留上次成功值且显示过期，不能显示为零；Task 1、2 覆盖。
4. 重定向到私网或跨主机：不转发凭据；Task 2 覆盖。
5. 查询刷新时供应商被切换或删除：旧响应不能覆盖新卡片；Task 3、4 覆盖。

---

### Task 1: 余额数据模型与缓存

**Files:** Create `runtime/agentlog/providers/balance-store.cjs`, `runtime/agentlog/storage/schema-v6.sql`; Modify `runtime/agentlog/storage/database.cjs`; Test `test/agentlog/provider-balance-store.test.cjs`, `test/agentlog/database.test.cjs`。

**Interfaces:** `createProviderBalanceStore(db,{ now })` exposes `get(providerId): BalanceState`, `put(providerId, value): BalanceState`, `markFailure(providerId, reason): BalanceState`, `listVisible({ activeIds, enabledIds }): BalanceState[]`. `BalanceState = { providerId, kind: "money"|"quota", amount?: number, currency?: string, remaining?: number, unit?: string, resetAt?: number, checkedAt?: number, stale: boolean, error?: "auth"|"network"|"format" }`.

- [ ] **Step 1: Write failing tests.** Money and quota round trip with their own units, malformed/negative result rejection, 401 or timeout marks old value stale without changing amount, deleted supplier removes cache, v5→v6 migration preserves records.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-balance-store.test.cjs test/agentlog/database.test.cjs`; expect FAIL.
- [ ] **Step 3: Add store and migration.** Never persist API keys or raw response bodies with the cache.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 2: CC Switch 查询模板适配

**Files:** Create `runtime/agentlog/providers/balance-templates.cjs`, `runtime/agentlog/providers/balance-query.cjs`; Test `test/agentlog/provider-balance-query.test.cjs`。

**Interfaces:** `listBalanceTemplates(appId,presetId): BalanceTemplate[]`; `createProviderBalanceQuery({ fetch, repository, store, now })` exposes `query(providerId,{ force=false }): Promise<BalanceState>` and `scheduleVisible(): void`. `BalanceTemplate` specifies HTTPS origin, path, auth placement, expected JSON fields and `kind`; custom mapping is data, not executable JS.

- [ ] **Step 1: Write failing tests.** CC Switch supported balance and coding-plan fixtures normalize correctly; no template returns unavailable; 401, timeout, bad JSON and oversized body preserve stale last value; redirect, DNS/private-network target and altered host are rejected before credentials leave; concurrent refresh is deduplicated.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-balance-query.test.cjs`; expect FAIL.
- [ ] **Step 3: Port supported CC Switch template semantics.** Use an explicit host list, bounded HTTPS request and response size, no credential logging, and a scheduler that refreshes only visible providers at a bounded interval.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 3: 供应商页查询入口

**Files:** Modify `runtime/agentlog/app-runtime.cjs`, `runtime/agentlog/manager/ipc.cjs`, `runtime/agentlog/manager/preload.cjs`, `src/manager/types.ts`, `src/manager/providers/ProviderPage.tsx`, `src/manager/i18n.tsx`; Test `test/agentlog/manager-ipc.test.cjs`, `src/manager/__tests__/ProviderPage.test.tsx`。

**Interfaces:** `agentLog.providers.balance(providerId): Promise<BalanceState>`, `agentLog.providers.refreshBalance(providerId): Promise<BalanceState>`, and `agentLog.providers.setBalanceRule(providerId, rule: { url: string; method: "GET"|"POST"; valuePath: string; kind: "money"|"quota"; unit: string }): Promise<void>`; `agentLogApp.getProviderBalanceSnapshot(): BalanceState[]`; provider-change events invalidate only affected cards.

- [ ] **Step 1: Write failing tests.** Refresh button shows pending then value/time; no template shows concise unavailable state; double click makes one request; switching or deleting during query discards the stale response for the no-longer-active card. A custom rule can select a JSON numeric field; malformed path or executable script text is rejected, and the UI never asks for JavaScript.
- [ ] **Step 2: Run** focused IPC and manager tests; expect FAIL.
- [ ] **Step 3: Wire query service and IPC** with existing errors envelope and live update event; provide a compact custom query form and validate rules in the main process; avoid exposing credentials or request details to the renderer.
- [ ] **Step 4: Run** focused tests and typecheck; expect PASS.

### Task 4: 桌宠空间归属和展示

**Files:** Modify `runtime/clawd/src/main.js`, `runtime/clawd/src/state.js`, `runtime/clawd/src/state-session-snapshot.js`, `runtime/clawd/src/dashboard-renderer.js`, `runtime/clawd/src/settings-i18n.js`, `runtime/clawd/src/dashboard.html`; Test `runtime/clawd/test/state-session-snapshot.test.js`, `runtime/clawd/test/dashboard.test.js`。

**Interfaces:** Add `getProviderBalanceSnapshot()` to `_stateCtx`; session snapshot gains `providerBalances: BalanceState[]`, included in `sessionSnapshotSignature`. `agentLogApp` emits balance changes so `_state.emitSessionSnapshot({ force: true })` refreshes the visible dashboard.

- [ ] **Step 1: Write failing tests.** Active Claude provider money appears in Claude card; switching to another provider changes the label and amount; Codex rate-limit quota remains unchanged beside a monetary balance; two OpenCode accounts remain separate; stale balance shows time/status; no balance leaves section empty rather than ¥0.
- [ ] **Step 2: Run** focused Clawd tests; expect FAIL.
- [ ] **Step 3: Add a separate provider-balance row** to each Agent theme card without reusing rate-limit percentage rendering. Keep Mobi blue/white design and compact information hierarchy.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 5: 验证与版本

**Files:** Modify `package.json`, `package-lock.json`, `CHANGELOG.md`。

**Interfaces:** No new runtime API.

- [ ] **Step 1: Run** `npm run test:phase2`; resolve introduced failures and rerun the full gate.
- [ ] **Step 2: Test desktop flow** with a local stub HTTPS endpoint and temporary user-data directory: add provider, activate it, refresh balance, close/reopen Mobi, confirm correct Agent card and freshness. Do not use personal keys in tests.
- [ ] **Step 3: Bump version** to `0.1.25` and record balance support and unsupported-template behavior.
- [ ] **Step 4: Run** `git diff --check`, typecheck, build and focused tests; expect PASS.
