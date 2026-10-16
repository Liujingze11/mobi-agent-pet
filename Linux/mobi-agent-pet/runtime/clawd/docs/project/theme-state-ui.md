# Theme, State, And UI Notes

This document holds the state machine, theme system, UI runtime, and platform caveats that were previously embedded in the root `AGENTS.md`.

## Dual-Window Model

桌宠使用两个独立的顶层窗口：

- 渲染窗口（`win`）：透明大窗口，永久 `setIgnoreMouseEvents(true)`，只负责显示 SVG 动画和眼球追踪
- 输入窗口（`hitWin`）：小矩形窗口，`transparent: true` + `setShape` 覆盖 hitbox 区域，`focusable: true`，永久 `setIgnoreMouseEvents(false)`，接收所有 pointer 事件

输入事件流：`hitWin renderer → IPC → main → renderWin renderer`

这个架构解决了 Windows 上的拖拽失效 bug：`WS_EX_NOACTIVATE` + layered window + Chromium child HWND 的组合在 z-order 变化后会走进激活死路径。分离后输入窗口保持 `focusable: true`，避开了这个问题。

## State Machine

- 多会话追踪：`sessions` Map 按 `session_id` 独立记录状态，`resolveDisplayState()` 取最高优先级
- 状态优先级：`error(8) > notification(7) > sweeping(6) > attention(5) > carrying/juggling(4) > working(3) > thinking(2) > idle(1) > sleeping(0)`
- 最小显示时长：防止快速闪切（`error=5s`、`attention/notification=4s`、`carrying=3s`、`sweeping=2s`、`working/thinking=1s`）
- 一次性状态：`attention/error/sweeping/notification/carrying` 显示后自动回退（`AUTO_RETURN_MS`）
- 睡眠序列：20s 鼠标静止 → idle-look → 60s → yawning(3s) → dozing → 10min → collapsing(0.8s) → sleeping；鼠标移动触发 waking(1.5s) → 恢复
- 逻辑 `idle` 与静置视觉分离：Settings 可为当前主题选择一个常驻 idle 变体，但不改变状态优先级；thinking / working / permission / completion / sleep / reaction / roam 仍会覆盖它，结束后再回到所选视觉
- DND 模式：跳过 dozing，直接 yawning → collapsing → sleeping；同时屏蔽 hook 事件
- 隐藏桌宠（petHidden，由模式规则或快捷键控制）：语义是「看不见宠物」而非免打扰——隐藏时收起宠物、Session HUD 和当时 pending 的权限气泡（恢复显示时回来），但隐藏期间新到的权限请求仍照常弹气泡，这是有意设计、不要当 bug 修；要连权限气泡都静默是 DND 的职责（它有回终端确认的 fallback）。Allow/Deny 全局快捷键跟随「可见气泡」：隐藏期间只要有可见气泡就保持注册，但只作用于可见的请求，收起的旧气泡不会被盲操作（#601）。petHidden 不持久化，重启恢复显示
- working 子动画：Clawd 主题为 1 个会话 → typing，2 个 → headphones groove，3+ → building；Calico / Cloudling 仍为 typing / juggling / building
- juggling 子动画：1 个 subagent → juggling，2+ → conducting

## Theme System

Clawd 是主题化桌宠：动画资源、计时、hitbox、眼球追踪参数都来自主题配置。

- 内置主题目录：`themes/clawd/`、`themes/calico/`、`themes/cloudling/`；`themes/template/` 是脚手架模板
- 用户主题目录：`<userData>/themes/<id>/theme.json`
- `theme.json` 必需状态：`idle`、`working`、`thinking`
- `states.idle[0]` 是主题默认的 follow-idle；Settings 的“默认待机动画”选项来自该主题声明的 idle 状态与 idle animation pool，并按主题分别持久化到 `prefs.idleVisual`
- 若启用 `eyeTracking.enabled`，`eyeTracking.states` 所列状态中的全部文件都必须是 SVG（`idleAnimations` 池不受此 schema 约束）；实际挂载眼追的文件还必须提供配置对应的追踪目标。逻辑 `idle` 只有 `states.idle[0]` 这个 follow-idle 会挂载眼追（模板的 legacy 目标是 `#eyes-js`），用户选择的非默认静置视觉不启用眼球跟随或 spin-to-dizzy
- 若 `sleepSequence.mode` 为 `full`（默认），需提供 `yawning / dozing / collapsing / waking`；`direct` 可直接进入 `sleeping`
- 若 `miniMode.supported` 为 true，需提供 8 个基础 mini 状态；`mini-working` 是可选增强，缺失时优雅跳过
- 能力缺失时走 `VISUAL_FALLBACK_STATES` 回退链
- 默认配置集中在 `theme-loader.js` 顶部的 `DEFAULT_*` 常量
- 变体是白名单 deep-merge；数组和特定字段会整体替换
- Animation override 是用户 per-slot 覆盖，和作者定义的 variants 正交
- SVG 会经过白名单消毒，阻断脚本、事件属性、外部资源、`javascript:` 和路径穿越
- `trustedRuntime.scriptedSvgFiles` 只对 loader 判定为内置的主题生效；外部主题声明该字段会被忽略
- 支持 SVG / GIF / APNG / WebP / PNG / JPG；动画周期由 `src/animation-cycle.js` 探测
- 更新视觉遵循主题绑定：`checking` 可选走 `theme.updateVisuals.checking`，未声明时回退到当前主题的 `thinking`；发现新版本时会进入 `available -> notification`；`downloading / success / error` 继续分别走 `carrying / attention / error`

主题创建流程见 `docs/guides/guide-theme-creation.md`。

## Settings Panel

Settings 是独立 `BrowserWindow`，采用 4 层结构：

| 层 | 文件 | 职责 |
|---|---|---|
| Schema / 持久化 | `src/prefs.js` | `SCHEMA` 定义；`load/save/migrate/validate`；坏文件自动 `.bak` + fallback |
| 内存 store | `src/settings-store.js` | `createStore()` 返回 `{ getSnapshot, subscribe, _commit }`；`_commit` closure-private |
| 控制器 | `src/settings-controller.js` | 唯一写入者；`applyUpdate` / `applyBulk` / `applyCommand` / `hydrate`；pre-commit effect gate |
| UI | `src/settings-renderer.js` + `settings.html` + `preload-settings.js` | 主题卡片、animation overrides、agent 开关、诊断；只通过 IPC 调 controller |

关键取舍：

- `applyUpdate` 和 `applyBulk` 对同步/异步 effect 同构
- `hydrate()` 是唯一跳过 effect 的入口
- 设置写入路径只有 `controller → store → subscribers`
- `idleVisual` 是 per-theme 文件映射；缺失键表示使用主题默认，主题升级删除已选文件或删除主题时会安静回退，不改变逻辑状态
- About tab 使用 inline SVG，而不是 `<object>`，因为 `settings.html` CSP 是 `default-src 'none'`

## Window Behavior

- 允许贴边与迷你显示功能已移除：没有边缘吸附、迷你入场/退出、边缘裁剪或恢复迷你状态的应用入口；普通拖拽和安全边界回弹保留。
- 旧自定义 `allowEdgePinning` / `miniModeEnabled` 和顶层迷你偏好忽略。旧 `miniMode=true` 的文件有有效 `preMiniX/preMiniY` 时恢复为普通位置，再按普通屏幕范围校正。
- 常规、后台、自动模式固定跨屏保持大小，启动像素恢复也使用有效模式规则；自定义模式保留独立开关。旧主题迷你布局元数据只作兼容数据，不激活运行时。Mobi 三套角色已移除全部旧迷你素材、生成分支和 miniMode 配置，动作管理只使用当前普通动作。
- 全屏规则保持原样：主要是 Windows 全屏窗口下继续尝试置顶及维持可拖动，关闭置顶处理并不保证隐藏桌宠。

## State To Animation Mapping

权威表格见 `docs/guides/state-mapping.md`。这里只保留实现层面的补充：

- Mobi 三套角色通过 `defaultActions` 为七个可见状态各指定一个默认动作，使用素材原生周期。空闲分别为莫比静止站立、莫莫咖啡续命、比比急着思索；漫游、工作、等待、完成、错误、被提起分别采用各自的 roam、working、notification、attention（框内彩纸雨）、error、drag。其他动作仍在动作库中；保存的自定义计划优先，动作管理的“恢复默认”采用这套单动作配置。未声明该字段的旧主题继续使用原有默认推导。
- working 子动画：Clawd 主题为 1 会话 → typing，2 → headphones groove，3+ → building；Calico / Cloudling 仍为 typing / juggling / building
- juggling 子动画：1 subagent → juggling，2+ → conducting
- 睡眠序列和 DND 行为见上面的 State Machine
- `attention / error / sweeping / notification / carrying` 是一次性状态，显示后按 `autoReturn` 回退

## Assets

- 素材按主题组织：每个主题目录自带 `assets/`
- `assets/svg/` 与 `assets/gif/` 是默认 Clawd 主题使用的公共根路径
- 文档预览 GIF 放在 `assets/gif/`，运行时不直接读
- 需要编辑的源素材先复制到 `assets/source/`
- SVG 运行时用 `<object type="image/svg+xml">`，其他位图格式走 `<img>`
- 默认 SVG 内部 ID：`#eyes-js`、`#body-js`、`#shadow-js`、`#eyes-doze`

## Runtime UI Systems

### Sound

- `app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")` 要在窗口创建前设置
- `main.js` 里的 `playSound(name)` 会检查 `soundMuted`、`doNotDisturb` 和 cooldown
- `renderer.js` 用 `_audioCache` 缓存 `Audio` 对象
- `attention/mini-happy` 播放 complete，`notification/mini-alert` 播放 confirm

### Eye Tracking

- `tick.js` 每 50ms 轮询鼠标
- 眼球位移量量化到 0.5px 像素网格
- 鼠标没动时会 dedup 跳过发送
- 普通 idle 只有当前文件等于主题的 `idleFollowSvg` 才挂载眼球追踪；非默认静置视觉跳过 attach/re-attach，mini-idle 仍按自己的能力独立追踪
- 从 `idle-look` 返回 `idle-follow` 时需要 `forceEyeResend`
- 当前实现**故意不用**跨进程“renderer ready”握手；主进程持续发 `eye-move`，恢复靠延迟 `forceEyeResend` 和 renderer 侧的自检重挂载
- 任何 `!moved` / dedup 优化都必须保留 `forceEyeResend` 旁路，否则 idle-look 结束后的眼球重定位会被吞掉

### Animated SVG Through `<img>`

- `renderer.js` 里给 `<img>` SVG 追加的 `?_t=` cache-bust query 是必需的
- 原因不是 HTTP 缓存，而是 Chromium 会复用同 URL SVG 的文档与 CSS 动画时间线；`forwards` 的一次性动画第二次加载时会直接停在末帧
- 相关 dedup 逻辑必须比较规范化后的文件名，而不是带 query 的最终 URL

### Idle Playback And System Wake

- 空闲省电功能已移除：不因停留空闲而暂停播放器、SVG/RAF、眼睛跟踪或降低鼠标采样频率，也不因该选项延迟销毁隐藏 HUD/额度环。
- 旧 `lowPowerIdle` / `lowPowerIdleMode` 配置忽略，其他自定义模式选项保留。「工作时保持唤醒」是独立功能，继续保留。
- 常规、后台、自动模式固定开启「工作时保持唤醒」，忽略旧偏好和自定义模式开关；只有自定义模式按 `keepAwake` 配置。沿用已有会话进行中判断（含等待审批），有任务时使用 `prevent-app-suspension`，全部任务结束后释放；不要求屏幕常亮。
- 系统睡眠后的 SVG 时间轴恢复、眼睛 OBJECT 重载/重绑定及重试保留，不依赖省电开关。Cloudling 运行时与源副本移除省电暂停 API；原始素材保留。

### Pet Input And Task Cards

- 双击展开任务卡片；普通单击与右键不弹出桌宠菜单，系统托盘菜单保留。
- 任务卡片保留任务状态和上下文用量，账号额度继续由额度环显示；运行时间及其编辑开关已移除。旧 `hudElapsed` 配置在读取时丢弃，其他自定义选项继续保留。
- 自定义模式的任务卡片和额度提示独立控制：关闭卡片仍可双击仅显示额度环。主程序直接使用有效模式的额度策略；后台和完全访问模式继续隐藏卡片与额度环。
- 自定义编辑器主要功能显示桌宠、托盘图标提醒、桌面通知与审批、审批方式、任务卡片；「状态与漫游」移入「更多设置」，包含七种状态与漫游间隔。「更多设置」整体默认折叠，展开后状态与漫游、气泡与闪烁、卡片与额度、电脑与窗口四个分区直接显示，不再分别折叠。全部配置字段仍参与保存，折叠不重置草稿；无效的隐藏数字输入会展开对应区域。
- 编辑器顶部的常规、后台、完全访问按钮仅套用对应模式的完整配置到本地草稿，不切换运行模式或立即保存；用户修改后保存为自定义模式。重置仅将草稿恢复为原有自定义默认配置。模式按钮使用独立圆角样式，选中项为蓝底白字，右侧重置弱化显示。固定模式与模板共用 `builtInModeProfile`，复制包含省略显示的选项（例如工作期间防止休眠、跨屏大小和额度开关），修改副本不会改动三个固定模式。
- 编辑器新增审批方式、上下文用量、跨屏保持大小的字段说明，以及状态与漫游、气泡与闪烁的模块说明；合计十处问号均使用真实应用截图。模块问号只打开说明，不切换折叠状态。说明复用同一对话框，Esc、关闭按钮、点击外部可收起并恢复触发按钮焦点，不改草稿或运行模式。
- 普通按下仍进入 held；屏幕坐标位移超过共享的 8px 门槛后才移动窗口、收起未固定卡片。轻微晃动不会移动桌宠。
- 拖拽 SVG 可通过 `reactions.drag.releaseDuration` 声明松开过渡。该文件使用 OBJECT 通道；renderer 在松开时记录标记节点的当前姿势，并触发同一 SVG 内的 `pet-released` 样式。过渡完成恢复最新任务动作，再次提起、切换主题和卸载会取消旧回调；文档不可用时立即恢复任务动作。
- 莫比「提起掉落」悬空时物品只掉一次，松开后落地并双手接回电脑，过渡约 1.6 秒；SVG 自己负责悬空摆动，不叠加通用 held 摆动。此衔接属于原拖拽动作，不增加动作库卡片。
- 莫莫「提起掉杯」沿用同一松开机制：咖啡杯只掉落一次，悬空保持困倦神态并轻晃，松开后落地、握住杯柄接回咖啡，过渡约 1.6 秒；手掌、手臂端点与杯柄在接回过程中同步。
- 比比「提起掉包」提起时公文包掉落一次，悬空保持急躁、咬牙神态，双腿快速交替蹬动；松开后落地、抓住提柄接回身旁的公文包，过渡约 1.6 秒。三位角色的拖拽均由各自连续骨架绘制，旧四段拖拽剧情已移除。
- 双击点击对独立于 held 状态和旧反馈计数，兼容原生双击事件。实际拖动结果按手势编号同步，迟到结果不会影响下一次点击。
- 未固定的卡片在实际显示后 5 秒自动收起；点击外部、实际拖动或失去显示资格时立即收起。再次双击重新计时，数据更新不会续期；固定卡片保持原有显示规则。
- 会话跳转、额度环及 Ctrl/Cmd 打开概览保持原有规则；卡片仍受模式开关限制。

### Automatic Approval

- 自动模式（界面名称为「完全访问模式」）沿用已授权的 `unattended` 策略：支持的工具确认和计划审批自动确认，不修改 Agent 的权限模式。自定义编辑器的同一审批策略称为「完全访问」。
- 可接管的问题优先选择明确推荐项：单选必须只有一个推荐项，多选选择全部推荐项；没有推荐或单选推荐不唯一时，回复 `You choose whatever is best.`，交给 Agent 自行决定。推荐只认明确布尔标记或选项末尾完整括号中的推荐标记，不默认选第一项。
- 问题及选项保持原始文本，长问题不能按界面截断后的文字回传。非法输入不发送部分答案；不支持的原生交互继续原生回退。
- 原有确认授权、请求代际、退出失效、禁用 Agent、headless 和免打扰门禁不变。

## Electron And Platform Notes

- `win.setFocusable(false)`：渲染窗口永不抢焦点
- `hitWin.focusable: true`：输入窗口允许激活，这是修复拖拽 bug 的关键
- `win.showInactive()`：显示时不打断用户输入
- 渲染 / 输入窗口都依赖 `backgroundThrottling: false`；unfocused 节流会放大眼球追踪和输入恢复的时序问题
- 路径统一用 `path.join(__dirname, ...)`
- 透明无边框浮窗：`frame: false`, `transparent: true`, `alwaysOnTop: true`
- 使用单实例锁：`app.requestSingleInstanceLock()`
- 位置持久化到 `clawd-prefs.json`
- 多显示器钳制走 `clampToScreen()` + `getNearestWorkArea()`

## Known Limits

- `hitWin` 点击会短暂抢焦点，这是当前可接受代价
- 当前开发环境没有 macOS 手测机；所有 macOS 特定路径都只能做 code review + best-effort 推断，真正行为变化需要额外人工验证
- 启动恢复依赖 `detectRunningClaudeProcesses()` 与后续 hook 事件
- Windows 前台窗口锁通过 ALT trick + `koffi` FFI 绕过，仍有边缘失败可能
- hook 脚本依赖 Node.js
- Windows 终端聚焦依赖 `koffi`；macOS 依赖 `osascript`
- Codex CLI 以 official hooks 为主、JSONL 轮询为 fallback；WebSearch / compaction / abort 等 hook 未覆盖事件仍可能有轮询延迟
- Copilot CLI 自动同步 `<COPILOT_HOME 或 ~/.copilot>/hooks/hooks.json`；`disableAllHooks: true` 时 doctor warning 且不挂 Fix 按钮
- Gemini 无权限气泡，除非未来提供兼容的阻塞式审批协议；Cursor 权限走 stdout；Kiro 没有 global hooks；opencode 与 MiMo Code 权限只能走 event hook + bridge
- opencode child / subtask session 只有在 `session.created` 明确带 `event.properties.info.parentID` 时才会被标记为 headless；这类后台 child 不进入 HUD / focus / 多会话 fanout；MiMo Code 与 opencode 同源，child session 行为一致
- 进程存活检测依赖进程名匹配，非标准进程名可能漏检

## Do Not Fix This Again

Language 子菜单底部截断是 Electron 透明窗口 + Windows DWM 的底层兼容问题，不要再尝试通过纯 JS 调整 `alwaysOnTop` 或透明窗策略来修。
