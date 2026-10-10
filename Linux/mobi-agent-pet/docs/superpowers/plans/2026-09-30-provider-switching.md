# 供应商实际切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Mobi 中保存的供应商真正写入 CC Switch 当前支持的十种工具配置，并能恢复原配置。

**Architecture:** 复用添加供应商阶段的记录和预设，每种工具由独立适配器生成最小配置补丁。主进程统一执行冲突检测、私有备份、原子写入、验证、失败恢复和当前项更新；切换型工具保留单一当前项，共存型工具管理已写入集合。

**Tech Stack:** Electron 主进程、Node、better-sqlite3、`jsonc-parser`、源自 CC Switch 的配置投影逻辑、node:test、React。

**Spec:** `docs/superpowers/specs/2026-09-30-provider-management-design.md`；依赖 `docs/superpowers/plans/2026-09-30-cc-switch-add-providers.md` 完成。

## Global Constraints

- App ID 和上游 SHA 与添加供应商计划相同。只在 Linux 验收；不实现本地代理、跨协议转换或托管 OAuth。
- 修改连接相关字段，保留 Hook、MCP、注释和用户其他配置；任何失败不得把数据库指针误标为已启用。
- 未支持的上游预设或格式显示「暂不能启用」及原因。切换型 `claude`、`codex`、`gemini`、`grokbuild`、`claude-desktop`；共存型 `opencode`、`openclaw`、`hermes`、`pi`、`mcode`。
- 不自动提交、不打包；本阶段交付升至 `0.1.24`，并更新中文日志。

## Review Focus

1. Mobi Hook 与 CC Switch 切换同时写同一文件：保留 Hook，冲突时停写；Task 1、2 覆盖。
2. Codex 多文件写到一半崩溃：重启后文件与当前指针一致；Task 1、3 覆盖。
3. 官方 OAuth 登录和第三方 API Key 来回切换：恢复原登录且无残留第三方 Key；Task 2、3 覆盖。
4. 外部 CC Switch 或 CLI 编辑了连接字段：Mobi 不盲目覆盖；Task 1、6 覆盖。
5. 共存型工具添加后只影响目标供应商，不删除其他账户；Task 5 覆盖。

---

### Task 1: 文件事务和恢复日志

**Files:** Create `runtime/agentlog/providers/file-transaction.cjs`, `runtime/agentlog/storage/schema-v5.sql`; Modify `runtime/agentlog/storage/database.cjs`, `runtime/agentlog/providers/repository.cjs`; Test `test/agentlog/provider-file-transaction.test.cjs`, `test/agentlog/database.test.cjs`。

**Interfaces:** `createProviderFileTransaction({ db, fs, vault, now })` exposes `run({ appId, providerId, changes: FileChange[], expectedHashes: Record<string,string> }): Promise<void>` and `recover(): Promise<void>`. `FileChange = { path: string; originalHash: string|null; nextBytes: Buffer; mode: number }`. Repository adds `getConfigInternal(id)`, `getActive(appId)`, `setActive(appId,id)`, `getEnabled(appId)`, `setEnabled(appId,ids)`; none are exposed unfiltered to renderer.

- [ ] **Step 1: Write failing tests.** One-file success, two-file second-write failure, process-stop fixture between file publish and pointer update, conflicting hash, concurrent calls on same App ID, and untouched Hook bytes all yield consistent disk and DB state.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-file-transaction.test.cjs test/agentlog/database.test.cjs`; expect FAIL.
- [ ] **Step 3: Implement transaction engine.** Journal target and encrypted backups before publishing; use per-App lock, private temp files, fsync+rename, verify bytes, then update pointer. On restart, recover unfinished operation before new switch requests.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 2: Claude Code 配置适配器

**Files:** Create `runtime/agentlog/providers/adapters/claude.cjs`; Test `test/agentlog/provider-claude-adapter.test.cjs`。

**Interfaces:** `createClaudeAdapter({ fs, home })` exposes `read(): LiveConfig`, `plan({ currentBytes, previousConfig, targetConfig }): FileChange[]`, `verify({ targetConfig }): boolean`, `importCurrent(): ProviderDraft | null`, `restartHint(): "none"`. Port CC Switch's key-field projection; do not serialize an entire parsed settings object over the original file.

- [ ] **Step 1: Write failing tests.** Third-party A→B changes only endpoint/Key/model fields; JSONC comments, Mobi Hook, MCP and unknown keys survive; original official login is imported and restored; malformed JSON blocks switching before a file write.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-claude-adapter.test.cjs`; expect FAIL.
- [ ] **Step 3: Port CC Switch Claude direct patch semantics** into the adapter and add source mapping to `docs/third-party/cc-switch-provider-source.md`.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 3: Codex 配置适配器

**Files:** Create `runtime/agentlog/providers/adapters/codex.cjs`, `runtime/agentlog/providers/adapters/codex-toml-patch.cjs`; Test `test/agentlog/provider-codex-adapter.test.cjs`。

**Interfaces:** Same `read/plan/verify/importCurrent` contract as Task 2, with `restartHint(): "restart-agent"`; `plan` may return changes for `config.toml` and `auth.json`. Auth backups always use the transaction vault.

- [ ] **Step 1: Write failing tests.** Preserve TOML comments, MCP tables, unknown config and OAuth refresh material; switch API-key provider then official profile; detect malformed TOML and duplicate managed tables; injected failure after first file restores both files and pointer.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-codex-adapter.test.cjs`; expect FAIL.
- [ ] **Step 3: Port CC Switch Codex direct projection** for known keys and table ranges. Do not stringify the entire TOML document; use the shared transaction for `config.toml` and `auth.json`.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 4: 其他切换型工具

**Files:** Create `runtime/agentlog/providers/adapters/gemini.cjs`, `grokbuild.cjs`, `claude-desktop.cjs`; Test `test/agentlog/provider-switching-adapters.test.cjs`。

**Interfaces:** Each exposes Task 2's adapter contract, with tool-specific `restartHint()` and config path discovery from the pinned CC Switch source.

- [ ] **Step 1: Write failing tests.** Each tool imports a live default, switches a compatible preset, preserves unrelated fields, rejects proxy-only preset, and restores default. Fixture files cover missing, valid and malformed states.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-switching-adapters.test.cjs`; expect FAIL.
- [ ] **Step 3: Port the three CC Switch direct adapters**; document source mapping and restart messages.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 5: 共存型工具

**Files:** Create `runtime/agentlog/providers/adapters/opencode.cjs`, `openclaw.cjs`, `hermes.cjs`, `pi.cjs`, `mcode.cjs`; Test `test/agentlog/provider-coexisting-adapters.test.cjs`。

**Interfaces:** `createCoexistingAdapter(appId,{ fs, home })` exposes `read()`, `planAdd({ providerId, config, currentBytes }): FileChange[]`, `planRemove({ providerId, currentBytes }): FileChange[]`, `verify({ providerId, enabled }): boolean`, `restartHint()`. `setEnabled` records a set, not a single active ID.

- [ ] **Step 1: Write failing tests.** Add two accounts for each tool, remove one, verify the other and unrelated settings remain; malformed live config blocks writes; repeated add is idempotent.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-coexisting-adapters.test.cjs`; expect FAIL.
- [ ] **Step 3: Port CC Switch coexist write rules** through the shared transaction; do not force a single active profile onto these tools.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 6: 激活服务、外部修改和页面反馈

**Files:** Create `runtime/agentlog/providers/activation.cjs`; Modify `runtime/agentlog/app-runtime.cjs`, `runtime/agentlog/manager/ipc.cjs`, `runtime/agentlog/manager/preload.cjs`, `src/manager/providers/ProviderPage.tsx`, `src/manager/providers/types.ts`; Test `test/agentlog/provider-activation.test.cjs`, `test/agentlog/manager-ipc.test.cjs`, `src/manager/__tests__/ProviderPage.test.tsx`。

**Interfaces:** `createProviderActivation({ repository, transaction, adapters })` exposes `status(appId)`, `activate(id)`, `addToLive(id)`, `removeFromLive(id)`, `refreshFromDisk(appId)`. IPC mirrors those names under `agentLog.providers`. `status` returns `{ mode: "switch"|"coexist"; activeId?: string; enabledIds?: string[]; conflict?: boolean; restartHint: string }`.

- [ ] **Step 1: Write failing tests.** Clicking a compatible card changes the fixture live config before success feedback; incompatible card has disabled action and reason; external edit yields conflict and no write; double click runs one transaction; restart hint appears only where needed.
- [ ] **Step 2: Run** focused Node and manager suites; expect FAIL.
- [ ] **Step 3: Wire activation through existing IPC envelope** and page states. Import current config before the first activation; refresh from disk on window open and after external edits.
- [ ] **Step 4: Run** focused suites and typecheck; expect PASS.

### Task 7: 供应商整理与恢复入口

**Files:** Create `runtime/agentlog/providers/profile-transfer.cjs`; Modify `runtime/agentlog/providers/activation.cjs`, `runtime/agentlog/manager/ipc.cjs`, `runtime/agentlog/manager/preload.cjs`, `src/manager/providers/ProviderPage.tsx`, `src/manager/types.ts`; Test `test/agentlog/provider-profile-transfer.test.cjs`, `src/manager/__tests__/ProviderPage.test.tsx`。

**Interfaces:** `createProviderProfileTransfer({ repository, activation })` exposes `export({ includeSecrets: false }): object`, `import(document): { added: number; skipped: number }`, `move(id,beforeId): void`, `syncUniversal(id): ProviderSummary[]`; activation adds `restoreOriginal(appId)`. IPC returns public results only. Config path override remains an Agent-specific optional input to each adapter, validated as a local file before use.

- [ ] **Step 1: Write failing tests.** Export omits nested secrets, import rejects invalid App IDs and duplicate IDs without overwriting existing profiles, reorder survives restart, edited universal profile syncs Claude/Codex/Gemini derivatives, restore-original recovers the imported initial config and leaves Mobi Hook intact, invalid config path is rejected.
- [ ] **Step 2: Run** focused Node and manager tests; expect FAIL.
- [ ] **Step 3: Add profile actions** beside the relevant supplier list, using the same file transaction for restore and universal live updates. Export containing credentials is deferred until a protected format exists; the default export is safe.
- [ ] **Step 4: Run** focused tests and typecheck; expect PASS.

### Task 8: 完整验证与版本

**Files:** Modify `package.json`, `package-lock.json`, `CHANGELOG.md`; Test all provider suites.

**Interfaces:** No new API.

- [ ] **Step 1: Run** `npm run test:phase2`; fix newly introduced failures and rerun the full gate.
- [ ] **Step 2: In a temporary Linux user directory,** manually add and switch two Claude Code and two Codex profiles, return to each tool's original login, and check Mobi hooks still report sessions. Use test credentials and controlled endpoints.
- [ ] **Step 3: Bump version** to `0.1.24` and document which tools switch versus coexist, plus restart behavior.
- [ ] **Step 4: Run** `git diff --check`, manager build and focused tests; expect PASS. Do not claim proxy-dependent presets work.
