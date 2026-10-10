# CC Switch 添加供应商移植 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobi 的第二页提供 CC Switch 当前十种工具、十一组预设与自定义供应商的完整添加表单，并把供应商配置安全保存在本机，为后续实际启用做好准备。

**Architecture:** 以 `farion1231/cc-switch@482f57b335ff15e749893990a132a9e54e4eb8e2` 的添加表单和预设为基线，将其表单逻辑适配到 Mobi 的 React 页面；Electron 主进程通过现有 IPC 保存记录。敏感配置整体交给安全存储，页面列表只收非敏感摘要。实际切换和桌宠余额是后续独立实施计划；本计划保存的供应商记录是它们的输入。

**Tech Stack:** React 19、TypeScript、Vite、Electron 41、Node 22、better-sqlite3、Vitest、node:test。

**Spec:** `docs/superpowers/specs/2026-09-30-provider-management-design.md`，本计划实现其中「完整添加」阶段的表单和保存能力；Agent 配置写入、启用和桌宠余额属于后续两个独立计划。

## Global Constraints

- Linux 首发；供应商 App ID 固定为 `claude`、`codex`、`gemini`、`grokbuild`、`claude-desktop`、`opencode`、`openclaw`、`hermes`、`pi`、`mcode`。
- 保留 CC Switch 十种工具的全部添加字段、十一组预设和通用供应商入口；先移植，再与用户讨论删减。需联网的模型获取和连接检查也包含在本计划。
- 不搬 CC Switch 设置页；MCP、Skills、提示词、本地代理和托管 OAuth 不在本计划。依赖它们的预设允许保存，但标明暂不能启用。
- CC Switch 源基线固定为上述 SHA；复制代码附 MIT 版权声明，记录源文件与 Mobi 对应文件。
- 不覆盖任何 Agent 配置文件；本计划只读取配置用于表单投影。实际写入在后续切换计划中完成。
- 现有工作区含大量未提交改动；不自动提交、不打包。首个产品代码交付将版本从 `0.1.22` 升到 `0.1.23`。

## Review Focus

1. 预设跨工具同名：选 Codex 的预设不能写入 Claude 供应商；Task 2 的目录测试覆盖。
2. 未知嵌套字段里含 Key：保存后不能在 SQLite 明文、IPC 列表或日志中出现；Task 3、4 覆盖。
3. Linux `safeStorage` 返回 `basic_text`：带凭据的保存应失败且不留下半条记录；Task 3 覆盖。
4. 依赖代理或 OAuth 的预设：能保存，但卡片不能显示为可启用；Task 5、8 覆盖。
5. 输入法合成、快速切换 Agent、重复提交：表单内容和目标 App ID 不能串位；Task 6、7、8 覆盖。

---

### Task 1: 来源清单与版权声明

**Files:** Create `docs/third-party/cc-switch-provider-source.md`, `THIRD_PARTY_NOTICES.md`; Test `test/agentlog/provider-source.test.cjs`。

**Interfaces:** Produces `docs/third-party/cc-switch-provider-source.md`，逐项列出上游 11 个 `*ProviderPresets.ts` 文件及将移植的 `AddProviderDialog.tsx`、`ProviderForm.tsx`、子表单与辅助函数。

- [ ] **Step 1: Write failing test.** Assert the manifest pins the exact SHA, lists all 11 preset files, and `THIRD_PARTY_NOTICES.md` contains `Copyright (c) 2025 Jason Young` and MIT notice.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-source.test.cjs`; expect FAIL because documents are absent.
- [ ] **Step 3: Create the two documents** from the pinned upstream `LICENSE` and source tree; list only copied or materially adapted files, updating the list in subsequent tasks.
- [ ] **Step 4: Run** the same test; expect PASS. Inspect `git diff --check` and the newly created documents.

### Task 2: 预设目录与原始配置投影

**Files:** Create `src/manager/providers/catalog/*`, `src/manager/providers/catalog.ts`, `src/manager/providers/types.ts`; Test `src/manager/__tests__/provider-catalog.test.ts`。

**Interfaces:** Produces `type ProviderAppId` as the ten IDs above, `type ProviderScope = ProviderAppId | "universal"`, `type ProviderPreset = { appId: ProviderAppId; id: string; name: string; settingsConfig: Record<string, unknown>; requiresProxy: boolean; requiresManagedAuth: boolean; ... }`, `listProviderPresets(appId: ProviderAppId): ProviderPreset[]`, `getProviderPreset(appId, id): ProviderPreset | null`, and `createProviderDraft(appId, presetId): ProviderDraft`. Preserve other upstream fields needed by each form in `ProviderPreset`, not a lossy flat conversion.

- [ ] **Step 1: Write failing tests.** For every App ID compare ordered preset IDs and names against a checked-in manifest generated from pinned source; assert each preset creates a draft for its own App ID and `getProviderPreset("claude", codexOnlyId) === null`.
- [ ] **Step 2: Run** `npm run test:manager -- provider-catalog`; expect FAIL.
- [ ] **Step 3: Copy/adapt all 11 preset modules** and their pure helper dependencies into `catalog/`; normalize CC Switch App IDs and mark proxy/OAuth dependencies without removing those presets. Add source paths to Task 1's manifest.
- [ ] **Step 4: Run** focused tests and `npm run typecheck:manager`; expect PASS.

### Task 3: 加密存储与迁移

**Files:** Create `runtime/agentlog/storage/schema-v3.sql`, `runtime/agentlog/providers/vault.cjs`, `runtime/agentlog/providers/repository.cjs`; Modify `runtime/agentlog/storage/database.cjs`; Test `test/agentlog/provider-repository.test.cjs`, `test/agentlog/database.test.cjs`。

**Interfaces:** `createProviderVault({ safeStorage })` produces `seal(config): Buffer`, `open(blob): object`, `canStoreSecrets(): boolean`. `createProviderRepository(db, { createId, vault })` produces `list(scope: ProviderScope): ProviderSummary[]`, `getDraft(id): ProviderDraft | null`, `create(input): ProviderSummary`, `update(id,input): ProviderSummary`, `remove(id): boolean`. `ProviderSummary` excludes secret fields and full `settingsConfig`.

- [ ] **Step 1: Write failing tests.** Test migration from v2 with existing sessions; all ten App IDs; nested `Authorization`/`apiKey` values absent from SQLite text and `list`; `basic_text` rejects a credentialed record with zero rows; editing leaves an omitted Key intact; remove deletes ciphertext.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-repository.test.cjs test/agentlog/database.test.cjs`; expect FAIL.
- [ ] **Step 3: Add migration and repository.** Store public summary columns separately from encrypted full config; use Electron `safeStorage` only when its Linux backend is neither `basic_text` nor `unknown`. Without a secure backend, permit only a curated official preset whose config is exactly secretless; reject arbitrary custom config. Apply writes in SQLite transactions.
- [ ] **Step 4: Run** focused tests; expect PASS.

### Task 4: 主进程服务与受限 IPC

**Files:** Create `runtime/agentlog/providers/service.cjs`; Modify `runtime/agentlog/app-runtime.cjs`, `runtime/agentlog/manager/ipc.cjs`, `runtime/agentlog/manager/preload.cjs`, `src/manager/types.ts`, `src/manager/__tests__/App.test.tsx`; Test `test/agentlog/provider-service.test.cjs`, `test/agentlog/manager-ipc.test.cjs`。

**Interfaces:** `createProviderService({ repository, fs, paths })` exposes `list(scope)`, `getEditDraft(id)`, `create(input)`, `update(id,input)`, `remove(id)`, `getEditorView(appId)`, `fetchModels(input: { appId, endpoint, apiKey?, allowLocal? })`, `checkEndpoint(input: { appId, endpoint, apiKey?, allowLocal? })`; renderer API `agentLog.providers.{list,getEditDraft,create,update,remove,getEditorView,fetchModels,checkEndpoint}`. `getEditorView` reads existing files without writing them. All calls validate App ID, IDs, lengths and config object depth before processing.

- [ ] **Step 1: Write failing tests.** Assert list/create/update/remove round trip, one `providers` change event per mutation, only `getEditDraft` returns decrypted editable config, malformed App ID and oversized nested config return `INVALID_ARGUMENT`, a missing config file produces an empty editor view, and URL/model queries reject private network targets unless explicitly local.
- [ ] **Step 2: Run** `node --test test/agentlog/provider-service.test.cjs test/agentlog/manager-ipc.test.cjs`; expect FAIL.
- [ ] **Step 3: Wire service and IPC** using the existing envelope and preload patterns. Implement bounded model/endpoint queries with timeouts and no logging of response headers or credentials. Use a dedicated provider validation module if `ipc.cjs` would otherwise become harder to read. Do not implement activation in this task.
- [ ] **Step 4: Run** focused tests and `npm run typecheck:manager`; expect PASS.

### Task 5: 表单能力对照与共享输入组件

**Files:** Create `src/manager/providers/forms/ProviderEditor.tsx`, `src/manager/providers/forms/ProviderPresetPicker.tsx`, `src/manager/providers/forms/ProviderFields.tsx`, `src/manager/providers/forms/provider-validation.ts`; Test `src/manager/__tests__/ProviderEditor.test.tsx`。

**Interfaces:** `<ProviderEditor appId={appId} initialDraft={draft} editorView={view} onSave={async (draft) => ...} />`; `validateProviderDraft(draft): { valid: boolean; fieldErrors: Record<string,string> }`. Preserve the upstream draft's structured config, category, headers, endpoint, model, website, notes and icon values.

- [ ] **Step 1: Write failing tests.** Selecting each of the ten App IDs shows the correct catalog; custom entry retains structured JSON; a proxy/OAuth preset can be saved with `activation: "unavailable"`; a malformed URL or JSON shows a field error without submitting; API Key input remains masked; model retrieval and endpoint check show loading, result and timeout feedback.
- [ ] **Step 2: Run** `npm run test:manager -- ProviderEditor`; expect FAIL.
- [ ] **Step 3: Adapt shared CC Switch form components** into Mobi's provider folder, including IME-safe input and preset selection. Keep full CC fields behind the relevant App/preset sections; do not remove advanced sections. Map text into Mobi i18n, including English and Chinese.
- [ ] **Step 4: Run** focused tests and `npm run typecheck:manager`; expect PASS.

### Task 6: 切换型工具添加表单

**Files:** Create `src/manager/providers/forms/switching/ClaudeFields.tsx`, `CodexFields.tsx`, `GeminiFields.tsx`, `GrokBuildFields.tsx`, `ClaudeDesktopFields.tsx`; Modify `ProviderEditor.tsx`; Test `src/manager/__tests__/SwitchingProviderForms.test.tsx`。

**Interfaces:** Each component receives `{ draft: ProviderDraft; onChange(next: ProviderDraft): void; editorView: ProviderEditorView }`. The components may reuse CC Switch form helpers, config editors and model selectors, with source mapping in Task 1's manifest.

- [ ] **Step 1: Write failing tests.** For each of the five tools, render official, third-party and custom presets; fill its upstream-specific required fields; save and compare the structured `settingsConfig` shape to pinned CC Switch golden fixtures. Rapidly changing tool and IME composition must not save values under the previous App ID.
- [ ] **Step 2: Run** `npm run test:manager -- SwitchingProviderForms`; expect FAIL.
- [ ] **Step 3: Port the five CC Switch form branches** and their pure helpers. Keep Codex TOML/config sections and Claude live projection read-only during add; mark proxy-dependent formats inactive.
- [ ] **Step 4: Run** focused tests and manager typecheck; expect PASS.

### Task 7: 共存型工具添加表单

**Files:** Create `src/manager/providers/forms/coexisting/OpenCodeFields.tsx`, `OpenClawFields.tsx`, `HermesFields.tsx`, `PiFields.tsx`, `MiniMaxFields.tsx`; Modify `ProviderEditor.tsx`; Test `src/manager/__tests__/CoexistingProviderForms.test.tsx`。

**Interfaces:** Same `ProviderDraft`/`onChange` contract as Task 6; preserve provider key, category, model routing and tool-specific config objects.

- [ ] **Step 1: Write failing tests.** Cover each of the five tools' official/custom categories and source-specific options, including OpenCode provider key and Pi thinking settings; compare saved config shape to pinned CC fixtures. Switching App ID while submitting must not cross-save.
- [ ] **Step 2: Run** `npm run test:manager -- CoexistingProviderForms`; expect FAIL.
- [ ] **Step 3: Port the five CC Switch branches** and helpers without writing live Agent config. Record copied source paths in Task 1's manifest.
- [ ] **Step 4: Run** focused tests and manager typecheck; expect PASS.

### Task 8: 通用供应商与完整添加流程

**Files:** Create `src/manager/providers/ProviderPage.tsx`, `src/manager/providers/forms/UniversalProviderEditor.tsx`; Modify `src/manager/App.tsx`, `src/manager/components/AppShell.tsx`, `src/manager/i18n.tsx`, `src/manager/styles.css`; Test `src/manager/__tests__/ProviderPage.test.tsx`, `src/manager/__tests__/App.test.tsx`。

**Interfaces:** `<ProviderPage api={api.providers} />` owns current App tab, list, add/edit/delete panels and loading/error states. Universal provider saves one source record and derives per-App drafts only for Claude, Codex and Gemini, matching CC Switch's supported set.

- [ ] **Step 1: Write failing tests.** App has 「使用情况 / 供应商」 navigation; each of ten tabs opens its full add form; save immediately appears in its own list after a `providers` event; editing and deleting work; universal profile creates only supported three App drafts; OAuth/proxy-only profile is visible with disabled enable action and a reason; double click submits once.
- [ ] **Step 2: Run** `npm run test:manager -- ProviderPage App`; expect FAIL.
- [ ] **Step 3: Build the page** with Mobi's blue/white theme and accessible controls. Add API mocks to existing App tests and keep usage page behavior intact. No CC Switch settings panel is imported.
- [ ] **Step 4: Run** focused tests, typecheck and manager build; expect PASS.

### Task 9: 交付验证与版本

**Files:** Modify `package.json`, `package-lock.json`, `CHANGELOG.md`; Test `test/agentlog/provider-source.test.cjs` and all touched suites。

**Interfaces:** No new runtime interface; deliverable is a usable provider creation page and saved records for all ten tools, ready for the switching plan.

- [ ] **Step 1: Run** `npm run test:phase2`; fix only failures caused by this change, then rerun affected suites and the full gate.
- [ ] **Step 2: Run a desktop smoke check** with a temporary user-data directory: add one secretless official profile and one API-key profile, restart Mobi, verify both reappear, edit/delete, and verify no live Agent config file changed.
- [ ] **Step 3: Bump version** to `0.1.23` in package files and add a Chinese user-facing changelog entry saying supplier creation is available while activation comes in the next stage.
- [ ] **Step 4: Run** `git diff --check`, `npm run typecheck:manager`, `npm run build:manager`, and focused tests; expect all PASS. Report scope and known proxy/OAuth activation limits without claiming switching is complete.
