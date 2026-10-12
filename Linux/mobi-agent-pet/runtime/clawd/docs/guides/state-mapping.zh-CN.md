# 状态映射

[返回 README](../../README.zh-CN.md)

桌宠只有七个逻辑状态。每个状态播放有效动作方案中启用的动作；未保存设置时，默认方案也立即生效。

| 桌宠状态 | 含义 | 常见触发 |
| --- | --- | --- |
| `idle` 空闲 | 没有活动任务 | 无活动，或任务展示结束 |
| `roam` 漫游 | 自主移动 | 开始漫游 |
| `working` 工作 | 任务进行中 | 思考、工具执行、子代理、上下文整理、工作树操作 |
| `waiting` 等待 | 需要输入或确认 | 通知、权限请求 |
| `complete` 完成 | 已确认一轮任务完成 | Stop 或完成事件 |
| `error` 错误 | 已报告任务失败 | 工具或任务执行失败 |
| `held` 被提起 | 用户正在提起桌宠 | 输入窗口拖动；释放后恢复最新任务 |

动作的名称和画面不决定状态。例如把睡眠动作分配到工作槽后，逻辑仍然是工作。非空闲槽没有启用动作时回落到空闲动作；保存的素材消失时只在内存中剔除，保留磁盘偏好。

贴边只改变裁切、位置和悬停几何，继续使用同一个状态和动作方案。鼠标静止、绕圈不再产生睡眠或眩晕状态；点击和文件拖入不能直接插播未分配动作。动作预览只在动作管理卡片中播放。

Agent 上报、会话和历史记录保留原始事件及状态。在桌宠边界，`thinking`、`juggling`、`sweeping`、`carrying` 统一为工作；`notification` 统一为等待；`attention` 统一为完成。旧睡眠和 `mini-*` 资源名称只用于导入与素材元数据。

下面的 Hook 表描述 Agent 原始输入。桌宠状态按上述规则映射，具体画面由动作方案决定。

## Kimi Code CLI（Kimi-CLI）Hook 事件

Kimi Code CLI（Kimi-CLI）现已采用 hook-only 集成（`~/.kimi/config.toml`），下面这 13 个 hook 事件会映射到 Agent 会话的原始状态：

| Kimi Hook Event | 状态 |
|---|---|
| SessionStart | idle |
| SessionEnd | 删除会话；无其他 live 会话时回到 idle |
| UserPromptSubmit | thinking |
| PreToolUse | 默认映射到 working。payload 携带明确审批信号（`permission_required` / `requires_approval` / `waiting_for_approval` / `is_permission_request`）时始终立即切到 permission 类动画。在此之外，持久化模式决定门控工具的处理方式：**`suspect`（安装器默认）**启用延迟启发式——suspect 窗口内没等到 `PostToolUse` 就认定 Kimi 阻塞在审批 TUI 上并弹出提示；`explicit` 仅响应显式信号（现行 kimi-cli 从不发出，等于不弹卡）。安装脚本（`npm run install:kimi-hooks` 及启动时自动同步）把模式以 `--permission-mode=<mode>` 参数持久化到 `~/.kimi/config.toml` 的 `command` 字段，重新同步时保留既有选择。运行时环境变量优先级高于持久化参数：`CLAWD_KIMI_PERMISSION_MODE=explicit\|suspect`（压过持久化参数；但 `CLAWD_KIMI_DISABLE_PRETOOL_PERMISSION` 与 `CLAWD_KIMI_PERMISSION_IMMEDIATE` 的判定顺序在它之前）；`CLAWD_KIMI_PERMISSION_IMMEDIATE=1` 对门控工具强制立即映射；`CLAWD_KIMI_PERMISSION_SUSPECT=1`（旧别名）只对当前进程开启 suspect；`CLAWD_KIMI_PERMISSION_SUSPECT_MS=<ms>` 可调 suspect 窗口；`CLAWD_KIMI_DISABLE_PRETOOL_PERMISSION=1` 无论其他开关如何都保持 explicit-only。排队的门控调用由每会话的门控台账跟踪：每答复一个审批，就会为下一个待审批重新弹卡。 |
| PostToolUse | working |
| PostToolUseFailure | error |
| Stop | attention |
| StopFailure | error |
| SubagentStart | juggling |
| SubagentStop | working |
| PreCompact | sweeping |
| PostCompact | attention |
| Notification | notification |

## Pi Extension 事件

Pi 使用全局 extension（`~/.pi/agent/extensions/clawd-on-desk`），会把交互式会话生命周期事件映射到 Agent 会话的原始状态：

| Pi Extension Event | Clawd Event | 状态 |
|---|---|---|
| session_start | SessionStart | idle |
| before_agent_start | UserPromptSubmit | thinking |
| tool_call | PreToolUse | working |
| tool_result (ok) | PostToolUse | working |
| tool_result (isError) | PostToolUseFailure | error |
| agent_end | Stop | attention |
| session_before_compact | PreCompact | sweeping |
| session_compact | PostCompact | attention |
| session_shutdown | SessionEnd | 删除会话；无其他 live 会话时回到 idle |

Pi 当前在 Clawd 中是 state-only 集成：Clawd 不接管权限、不新增确认弹窗，Pi 保持默认 YOLO 执行行为。

## 显示与播放生命周期

普通单击不打开菜单，右键也不弹出菜单；按住左键移动可拖拽。在模式启用任务卡片且有可显示数据时，双击桌宠展开任务卡片；额度环有数据且启用时也使用这一入口。迷你模式沿用单击退出，Ctrl/Cmd 点击沿用打开概览。设置仍可通过托盘菜单进入。

主进程管理提起锁和完成/错误展示期限。渲染帧携带状态、主题代数及状态修订号；旧帧和当前槽以外的文件被拒绝。切换角色或动作方案会使旧帧和计时器失效。省电暂停/恢复只影响播放。

## 模式规则

审批、通知、问答和计划确认统一归入“Agent 气泡”，共用一个模式开关。气泡在桌宠所在屏幕右下角向上堆叠，使用概览的 Agent 配色，不再跟随桌宠；各类卡片原有的操作和停留时间规则保留。

| 模式 | 桌宠显示 | 状态范围 | 提醒与审批 |
| --- | --- | --- | --- |
| 常规 | 显示 | 全部七状态 | 气泡、任务提示、托盘提醒开启；手动审批 |
| 后台 | 隐藏 | 不展示状态动作 | Agent 气泡、托盘提醒开启；手动审批；任务提示关闭 |
| 自动 | 显示 | 空闲、工作、等待、完成、错误、被提起 | Agent 气泡、任务提示关闭；托盘提醒开启；支持的请求自动处理 |
| 自定义 | 按独立配置 | 必须保留空闲，其余状态可选 | 只在“编辑自定义模式”中配置 |

从托盘的模式菜单打开“编辑自定义模式”独立小窗口。功能开关及七个状态选项使用滑动开关，空闲固定保留。设置中不再内嵌编辑器；桌面宠物只保留概览、动作管理和主题。

前三种模式使用固定规则，不读取旧的独立行为开关。自动模式关闭漫游，保留等待。常规模式在满足自主移动条件时允许漫游，进入空闲或上次漫游结束后至少停留 120 秒。自定义模式可在“编辑自定义模式”中设置漫游间隔（10–3600 秒，默认 120 秒）；空闲动作需要更久时继续等待。第四种模式的配置单独保存；保存不会切换模式，也不会修改前三种模式。自定义模式未启用的状态回到空闲，Agent 原始状态和工作记录保持完整。动作方案仍可在动作管理中替换。

应用不提供声音设置、声音编辑或播放。旧音频素材与偏好保留用于兼容，但不参与运行。每次启动回到常规模式。启用自动审批需要当前运行期间的确认；切换模式或保存当前自定义配置会使旧审批请求失效，不会追溯批准之前的请求。
