# Seven Pet States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌宠运行逻辑、默认方案、动作管理、互动和贴边显示只使用空闲、漫游、工作、等待、完成、错误、被提起七状态。

**Architecture:** 共享七状态契约和有效动作方案，在 Agent 输入边界把细分事件映射到桌宠状态。主进程桌宠控制器统一管理状态、提起覆盖、展示期限和恢复；渲染器只播放当前有效动作槽。贴边、省电、窗口过渡是独立显示参数，不能扩充状态枚举。

**Tech Stack:** Node.js >=22.12.0、Electron、CommonJS/浏览器共享模块、Node 内置测试、现有 JSDOM/Vitest；不增加依赖。

**Spec:** `docs/superpowers/specs/2026-10-10-seven-pet-states-design.md`（2026-10-10 用户已确认）。

## Global Constraints

- 桌面宠物只有七个状态：空闲、漫游、工作、等待、完成、错误、被提起。
- 动作不能重新成为额外的逻辑状态。
- 默认配置与动作管理里展示的配置一致，不需要先点击保存才能进入七状态播放模型。
- 任一播放入口都不能选取当前状态有效动作槽以外的素材。
- 正常显示和贴边显示使用同一逻辑状态及同一动作方案。
- 提起期间继续接收并记录 Agent 事件；释放后恢复最新任务状态。
- Agent 会话检测、事件记录、统计、权限协议和终端跳转保持现有语义。
- 此次不决定自动模式应关闭哪几个状态。
- 所有下述路径相对 `Linux/mobi-agent-pet/`；命令在该应用目录执行。保留已有未提交改动，不做 reset/stash/批量替换旧名称。
- 执行前按 using-git-worktrees 检查现有工作区。工作包含大量用户未提交的现有七状态代码，不能从干净 HEAD 启动并漏掉这些内容；使用已适合的工作区或完整保留当前内容的隔离副本。
- 只提交本任务新增文件或本任务明确修改的差异；无法从已有未提交差异中安全分离时，保留可审阅差异，禁止把整个文件的用户改动顺手提交。

## Review Focus

- 被提起时连续出现完成、错误、新任务，松开/失焦/捕获丢失后要恢复最后有效状态；Task 3/4 测试覆盖。
- 切换主题或动作方案后到达旧渲染帧，必须拒绝旧 generation/revision，不能更新素材和展示期限；Task 3/4 覆盖。
- 某个已保存动作素材消失，不修改磁盘偏好，使用合法默认/空闲回落，并保留其余有效配置；Task 2 覆盖。
- 贴边入场或退出时出现等待/工作事件，几何过渡不得吞掉任务更新；Task 5 覆盖。
- 系统唤醒、窗口重载或重复松开使旧 timer 回调到达，不恢复过期状态，不重复创建播放器；Task 3/5/6 覆盖。

---

## Interface Map

- `pet-states.js`（新增，共享）：`PET_STATE_IDS`，`isPetState(value): boolean`，`normalizePetState(value): PetState|null`，`PET_STATE_PRIORITY`。浏览器全局 `MobiPetStates`。
- `pet-action-plan.js`：`resolveEffectivePlan(theme): ActionPlan`，`playbackSlot(plan,state): Slot`，`createPlayer(...)`；`STATE_IDS` 引用共享枚举，不维护第二份。
- `pet-theme-model.js`（新增，Node）：`normalizePetTheme(theme): Theme`，保留 `_sourcePetAssets`、`_defaultPetActionPlan` 等资源描述，规范化活动主题的 `states` 为七 ID。
- `pet-state-controller.js`（新增，Node）：`createPetStateController({resolveTaskState,getPlan,publish,getAllowedStates,timers})`；返回 `getState()`、`getSnapshot()`、`request(state,options)`、`setHeld(boolean)`、`refreshPlan()`、`reportFrame(frame)`、`cleanup()`。
- `PetState` 为七 ID；`ActionPlan/Slot` 沿用现有 v1 结构。未知状态返回 `null`；规范控制器不接受非法状态。
- `PetSnapshot = {state,themeGeneration,stateRevision}`；只在真实状态变化或方案重载时改变相关编号。
- `ActionFrame = {state,file,themeGeneration,stateRevision}`；时长由主进程有效方案解析，不信任渲染器提供的自由时长。
- `DisplayContext = {miniMode:boolean,miniEdge:'left'|'right'}`，通过独立显示 IPC/几何参数传递。
- 控制器使用显示覆盖优先级：`held` 高于任务展示；任务展示优先级 `error > waiting > complete > working > roam > idle`。新工作请求可以终止上一轮完成/错误展示；其可中断性由事件原因判断，不能仅比较优先级。

### Task 1: 共享七状态契约

**Files:** Create `runtime/clawd/src/pet-states.js`, `runtime/clawd/test/pet-states.test.js`; modify `runtime/clawd/src/pet-action-plan.js`, `runtime/clawd/src/index.html`, `runtime/clawd/src/dashboard.html`, `runtime/clawd/test/pet-action-plan.test.js`。

**Interfaces:** Produces Interface Map 中的状态契约；两个页面在 `pet-action-plan.js` 前加载共享模块。

- [ ] **Step 1: 写失败测试。**

```js
assert.deepEqual(PET_STATE_IDS, ['idle','roam','working','waiting','complete','error','held']);
assert.equal(normalizePetState('thinking'), 'working');
assert.equal(normalizePetState('notification'), 'waiting');
assert.equal(normalizePetState('attention'), 'complete');
assert.equal(normalizePetState('sleeping'), 'idle');
assert.equal(normalizePetState('drag'), 'held');
assert.equal(normalizePetState('invented'), null);
```

测试完整旧输入表、小窗兼容输入、枚举不可变、Node/浏览器 VM 同一输出和脚本加载顺序。旧 `mini-enter/peek/sleep` → 空闲，`mini-working` → 工作，`mini-alert` → 等待，`mini-happy` → 完成，`mini-crabwalk` → 漫游。
- [ ] **Step 2: 运行失败验证。** `node --test runtime/clawd/test/pet-states.test.js runtime/clawd/test/pet-action-plan.test.js`；新契约不存在导致失败。
- [ ] **Step 3: 实现共享 API。** `groupForState()` 委托输入映射；播放器从规范状态读取槽，未知状态不播放任意 fallback 素材。
- [ ] **Step 4: 运行同一测试及 `dashboard-actions.test.js`。** 输出必须全部通过；工作子事件变化不重启同组队列。
- [ ] **Step 5: 审阅差异并保存本任务进度。** 按 Global Constraints 隔离提交；建议提交信息 `refactor: share canonical pet state contract`。

### Task 2: 默认、保存方案与主题加载统一

**Files:** Create `runtime/clawd/src/pet-theme-model.js`, `runtime/clawd/test/pet-theme-model.test.js`; modify `pet-action-plan.js`, `theme-context.js`, `theme-schema.js`, `theme-loader.js`, `state-visual-resolver.js`, `settings-animation-overrides-main.js`, `dashboard-pet-scene.js`（均位于 `runtime/clawd/src/`）以及 `runtime/clawd/scripts/validate-theme.js`。

**Interfaces:** Consumes Task 1；produces `normalizePetTheme(theme)` 和 `resolveEffectivePlan(theme)`。后续控制器、数据接口、渲染器和帧校验只使用这个有效方案。

- [ ] **Step 1: 写失败测试。** 使用真实 Mobi A/B/C 主题，证明未保存时渲染配置与管理页默认方案相同；验证加载结果 `Object.keys(theme.states)` 只有七 ID。

```js
assert.deepEqual(Object.keys(normalizePetTheme(legacyTheme).states), PET_STATE_IDS);
assert.deepEqual(createThemeContext(theme).getRendererConfig().actionPlan, resolveEffectivePlan(theme));
assert.deepEqual(resolveEffectivePlan(theme).states.working.actions.map(a=>a.file), ['working.svg']);
```

另外验证七状态新格式不要求 `thinking/sleeping/mini-*`，旧格式仍可导入，保存的跨状态分配/模式/声音/命中范围不丢失。删除素材时仅在内存剔除缺失项；槽为空回落空闲，空闲无合法项则采用主题默认；原保存对象和磁盘偏好不被改写。
- [ ] **Step 2: 运行失败验证。** `node --test runtime/clawd/test/pet-theme-model.test.js runtime/clawd/test/theme-context.test.js runtime/clawd/test/pet-action-plan.test.js`；当前未保存配置为 `null`，新格式被旧校验拒绝。
- [ ] **Step 3: 实现规范化与有效方案。** 先保留原资源索引/默认方案，再规范化活动主题，避免循环依赖和丢失旧动作库。只在主题加载/验证边界兼容旧格式；正常运行不再从细分状态、tiers 或 display hints 直接选播放文件。资源路径校验保留 basename、存在性和主题归属检查。
- [ ] **Step 4: 验证模型与现有主题测试。** `node --test runtime/clawd/test/pet-theme-model.test.js runtime/clawd/test/theme-context.test.js runtime/clawd/test/theme-schema.test.js runtime/clawd/test/theme-runtime.test.js runtime/clawd/test/mobi-themes.test.js runtime/clawd/test/settings-animation-overrides-main.test.js runtime/clawd/test/dashboard-actions.test.js`；七状态输出及用户设置保持断言通过。
- [ ] **Step 5: 审阅差异并保存进度。** 建议 `refactor: use one effective pet action plan`。

### Task 3: 主进程拥有七状态与恢复计时

**Files:** Create `runtime/clawd/src/pet-state-controller.js`, `runtime/clawd/test/pet-state-controller.test.js`, `runtime/clawd/test/pet-state-integration.test.js`; modify `runtime/clawd/src/state.js`, `runtime/clawd/src/state-priority.js`, `runtime/clawd/src/main.js`。

**Interfaces:** Consumes Task 1/2；produces控制器 API 与 `PetSnapshot`。`state.js` 的 `getCurrentState()`、观察器和桌宠 IPC 返回规范状态；会话 Map 和事件记录保留 Agent 细分信息。

- [ ] **Step 1: 写失败测试。** Fake timers 覆盖 request/held/refreshPlan/cleanup；真实 `state.js` 入口覆盖全部旧事件。

```js
controller.request('working'); controller.setHeld(true); controller.request('error');
assert.equal(controller.getState(), 'held');
controller.setHeld(false); assert.equal(controller.getState(), 'error');
assert.ok(published.every(frame => isPetState(frame.state)));
assert.equal(controller.reportFrame(oldGenerationFrame), false);
```

验证完成/错误顺序完整一轮、随机按实际选中素材原生时长返回、空槽回落、新工作中断旧展示、held 期间先完成后新任务恢复工作，以及 cleanup 后旧回调不再发布状态。
- [ ] **Step 2: 运行失败验证。** `node --test runtime/clawd/test/pet-state-controller.test.js runtime/clawd/test/pet-state-integration.test.js`；当前控制器缺失，真实入口泄漏旧状态。
- [ ] **Step 3: 实现控制器并接入 `state.js`。** 桌宠 `currentState`、pending/auto-return 计时和提起锁迁入控制器；旧 Agent 状态解析保留。禁止用 getter 改名掩盖原状态机。移除桌宠睡眠链和清扫/搬运独立展示期限，保留 Agent 完成防抖/权限锁和会话清理计时。
- [ ] **Step 4: 验证集成与会话回归。** `node --test runtime/clawd/test/pet-state-controller.test.js runtime/clawd/test/pet-state-integration.test.js runtime/clawd/test/state.test.js runtime/clawd/test/state-priority.test.js runtime/clawd/test/state-session-snapshot.test.js runtime/clawd/test/startup-session-recovery-regressions.test.js`。旧测试只修改桌宠显示预期；Agent 原始状态/记录预期不得机械替换。
- [ ] **Step 5: 审阅差异并保存进度。** 建议 `refactor: centralize seven-state pet transitions`。

### Task 4: 渲染、提起与帧校验收敛

**Files:** Modify `runtime/clawd/src/renderer.js`, `hit-renderer.js`, `pet-interaction-ipc.js`, `preload.js`, `preload-hit.js`, `theme-context.js`, `main.js`; tests `pet-action-plan.test.js`, `pet-interaction-ipc.test.js`, `hit-renderer.test.js`, `renderer-low-power.test.js`, `main-action-frame.test.js`。

**Interfaces:** Consumes Task 3 的状态快照；输入窗口只上报提起/释放和原有菜单、位置操作，不传入任意播放文件。`state-change` 第三个参数为 `{themeGeneration,stateRevision}`；帧返回 `ActionFrame`。

- [ ] **Step 1: 写失败测试。** 通过实际注册的 IPC handler 和渲染器测试夹具，证明点击/连击/文件拖入不能停止有效播放器并直接播放主题 reaction 文件；按下、松开、blur、pointercancel、lostpointercapture 都驱动主进程 held API。

```js
assert.equal(acceptActionFrame({sender: foreignWindow}, validFrame), false);
assert.equal(acceptActionFrame(ownerEvent, {...validFrame, file:'unassigned.svg'}), false);
assert.equal(acceptActionFrame(ownerEvent, {...validFrame, themeGeneration:oldGeneration}), false);
```

`acceptActionFrame` 是测试中执行真实 `updateActionVisual` callback 的 harness 包装，不新增第二套生产校验函数。覆盖 same-state 不重启队列、held 更新与释放、一窗口只有一个播放器、非法状态/旧时长/不匹配 revision 被拒绝。
- [ ] **Step 2: 运行失败验证。** `node --test runtime/clawd/test/pet-interaction-ipc.test.js runtime/clawd/test/hit-renderer.test.js runtime/clawd/test/main-action-frame.test.js runtime/clawd/test/renderer-low-power.test.js`；新断言暴露旧直播和渲染器独立提起路径。
- [ ] **Step 3: 更新桥接与播放器。** 移除自由文件 reaction 播放 API，主进程 held 状态驱动相同播放器；几何上的 lifted class 由状态决定。帧校验使用控制器当前快照、实际 sender 和有效方案，实际时长在主进程计算。直接 swap 仅供已校验帧和同帧加载失败重试使用。
- [ ] **Step 4: 运行同一专项及 `pet-action-plan.test.js`、`pet-state-integration.test.js`。** 验证工作画面变化、命中范围、提起锁和状态同步，无绕过路径。
- [ ] **Step 5: 审阅差异并保存进度。** 建议 `fix: route pet interaction through configured states`。

### Task 5: 贴边、静止检测、模式与重载统一

**Files:** Modify `runtime/clawd/src/mini.js`, `tick.js`, `roam.js`, `hit-geometry.js`, `pet-geometry-main.js`, `app-mode.js`, `theme-runtime.js`, `tray-status-light.js`, `renderer.js`, `main.js`; tests `mini.test.js`, `tick.test.js`, `roam.test.js`, `hit-geometry.test.js`, `pet-geometry-main.test.js`, `app-mode-main.test.js`, `theme-runtime.test.js`, `main-mini-animation-cycle.test.js`, `renderer-low-power.test.js`。

**Interfaces:** Consumes控制器；geometry 接口添加可选 `DisplayContext` 参数，默认正常显示。`mini-mode-change` 保留现有独立 IPC，但不再派生新的状态名。

- [ ] **Step 1: 写失败测试。** 活跃工作状态入场/退出/探头仍是工作；等待事件发生在过渡期间，过渡后仍等待。静止 60 秒和鼠标绕圈不得产生睡眠/眩晕状态或直播素材。提起后移动不得触发漫游。

```js
assert.equal(petStateAfterMiniEntry, 'working');
assert.ok(stateMessages.every(message => isPetState(message.state)));
assert.equal(petStateAfterMouseIdle, 'idle');
assert.equal(playerCountAfterWakeAndReload, 1);
```

验证同状态显示形态切换不重启队列，几何显式 mini 参数仍正确裁切和跨屏定位；后台/DND/自动/返回常规都只发布七状态，等待被抑制时回落工作/空闲且不解决权限请求。
- [ ] **Step 2: 运行失败验证。** `node --test runtime/clawd/test/mini.test.js runtime/clawd/test/tick.test.js runtime/clawd/test/app-mode-main.test.js runtime/clawd/test/main-mini-animation-cycle.test.js`；新断言捕获 mini-* 与睡眠链。
- [ ] **Step 3: 更新显示形态与恢复。** 小窗保留窗口动画/边界锁，停止替换逻辑状态及资源；删除旧鼠标静止状态链、随机直播和眩晕触发。roam 实际移动时进入漫游，取消后重新解析任务。低功耗暂停/唤醒只管理播放器；主题重载提升 generation、清理过期计时并恢复合法最新状态。
- [ ] **Step 4: 运行本任务列出的专项测试。** 修复所有真实消费者；托盘任务 activity 仍可读 Agent 细分事件，而桌宠 state-change 仅读规范状态。原生几何用已有多屏 fixture 验证，不能只做源码字符串断言。
- [ ] **Step 5: 审阅差异并保存进度。** 建议 `refactor: keep pet state independent of display form`。

### Task 6: 预览封口、端到端回归与最终审查

**Files:** Modify `runtime/clawd/src/settings-animation-overrides-main.js`, `settings-tab-anim-overrides.js`, `dashboard-actions.js`, `pet-cue-policy.js` 及对应现有测试；create `runtime/clawd/test/pet-seven-state-flow.test.js`, `docs/verification/2026-10-10-seven-pet-states.md`；必要时更新 `runtime/clawd/docs/guides/state-mapping.md`、应用 README 中的状态说明。

**Interfaces:** 卡片隔离预览不触碰桌宠控制器。旧桌宠预览接口返回 `{status:'error',code:'PET_PREVIEW_MOVED',message:'请在动作管理中预览动作。'}`，英文按现有语言机制提供。

- [ ] **Step 1: 写失败测试。** 旧预览调用无状态/素材副作用；真正主题数据经过管理页、保存控制器、有效方案、真实状态入口和帧校验贯通。跨状态安排 sleeping 文件到工作槽后，逻辑始终工作；未分配该素材时静止不能把它播放出来。
- [ ] **Step 2: 运行失败验证。** `node --test runtime/clawd/test/pet-seven-state-flow.test.js runtime/clawd/test/settings-animation-overrides-main.test.js runtime/clawd/test/dashboard-actions.test.js`。
- [ ] **Step 3: 封闭预览与旧 cue 路径，更新用户说明。** 不删除可用于动作库的素材或用户设置；旧 asset 标签只留在导入/元数据边界。贯通测试覆盖主题切换后旧帧、空槽回落、held 期间事件、贴边过渡事件和系统唤醒。
- [ ] **Step 4: 验证三款主题。** 分别执行 `node runtime/clawd/scripts/validate-theme.js runtime/clawd/themes/mobi-a`、`mobi-b`、`mobi-c`（各自完整命令）；期望无 schema/资源错误。运行 `npm run test:phase2`，保存完整日志，确认退出码 0 和实际测试统计；运行 `git diff --check`。
- [ ] **Step 5: 深度静态审查与最终独立复审。** 搜索桌宠 state 赋值、state-change/hit-state-sync、setState/applyState、自由文件播放、sleep timers 和 mini-*。逐条证明旧名称只存在于 Agent 输入/旧资源描述/迁移测试；审查默认/已保存方案、生命周期、输入窗口与文件归属校验。执行方式由用户在审阅本计划后选择；复审后只针对新失败或未解决问题追加测试。
- [ ] **Step 6: 记录验证并交付。** 文档写明变更、实际测试结果、未自动验证的原生拖动/透明窗/跨屏观感，以及本次包含主进程变更，需要完全退出后重启才能加载。遵循分离提交约束，建议 `refactor: finish unified seven-state pet runtime`。

## Plan Self-Review

- 状态契约、有效方案、主进程拥有状态、互动限制、贴边形态、主题兼容、模式/重载和全部验收标准分别由 Task 1–6 承担。
- 所有后续任务调用的接口均在 Interface Map 或本任务中明确；测试 harness 包装与生产 API 已区分。
- 五项 Review Focus 均落实到所属任务的失败测试；任务之间按接口依赖顺序执行。
- 测试只更新桌宠状态预期，不对 Agent 会话和历史事件做机械全局替换。
- 不提前确定自动模式的七状态取舍，不扩充动作管理界面或增加依赖。

## Execution Handoff

计划已完成并自查；等待用户审阅并选择执行方式。推荐由当前会话顺序实施，因为各任务共享状态、主题和 IPC 接口，依赖紧密；实施结束后做一次独立整体复审。若用户选择子代理方式，再按 subagent-driven-development 逐任务派发和审查。
