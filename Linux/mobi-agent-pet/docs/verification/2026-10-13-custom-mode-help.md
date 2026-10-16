# 自定义模式：真实截图说明

2026-10-13。仅调整编辑页面文案与帮助交互，不修改模式、审批、拖动、漫游或提醒的实际行为。

五个原有字段保留同一配置键，名称调整为：托盘图标提醒、桌面通知与审批、桌宠任务卡片、账号额度环、任务期间防止电脑休眠。每项问号打开原生 modal dialog，含短说明与真实应用截图。关闭按钮、Esc、点击外部可关闭，焦点回到触发按钮。问号不会切换开关或提交表单。

## 截图来源

运行当前应用的隔离 Electron 实例，使用独立临时配置，禁止安装集成、启动 Agent 或执行终端请求，不移动真实鼠标。截图直接来自应用窗口的 capturePage，以及 Electron desktopCapturer 对系统栏和应用区域的裁剪；没有使用生成图片或重绘界面。

- `runtime/clawd/assets/help/tray-bar.png`：当前 Linux 顶部系统栏的实际应用入口，蓝色环形图标。裁剪仅保留系统图标，不含其他应用内容。
- `agent-bubble.png`：真实正常模式权限请求卡片，Codex 绿色边框。`npm test` 是测试请求文本，没有执行命令。
- `pet-overlays.png`：真实工作状态桌宠、旁边额度环、下方任务卡片。使用临时纯色背景窗口，避免捕获用户桌面内容。
- `task-card.png`：实际 HUD 以 2 倍缩放渲染后截图，保持文字清晰。
- `quota-ring.png`：实际额度渲染器以 4 倍缩放渲染，精确裁剪读数和圆环。Claude 示例短周期已用 27%、7 天已用 41%，读数显示最大用量窗口。不是余额或上下文。
- `keep-awake.png`：实际编辑页面以 2 倍缩放，裁剪开启状态的真实开关行。

截图中的任务名称、用量和审批请求来自隔离实例的示例数据；帮助中明确标注。原有配置文件没有改动。

账号额度来自 Agent 上报，仅支持有数据的来源。额度环与上下文统计分开。防止休眠的实现继续使用 prevent-app-suspension，可允许屏幕关闭，不会唤醒已休眠电脑。

帮助图片已纳入主应用现有资源范围，并补充独立 runtime 构建资源白名单。

## 验证

- `node --test runtime/clawd/test/custom-mode-editor.test.js runtime/clawd/test/custom-mode-profile.test.js runtime/clawd/test/app-mode-main.test.js runtime/clawd/test/settings-window.test.js`：49 项通过。
- 原生 Electron 检查：620×720 和 480×480 各检查五个帮助，共 10 项通过。所有图片加载、有可见尺寸；对话框处于 modal 状态且不越出窗口；没有横向溢出，小窗口长内容可滚动；真实 Esc 输入关闭并恢复焦点；帮助前后配置相同，更多设置折叠状态不变。
- 独立代码复核无其他重要问题。

页面及帮助窗口实拍保存在 [custom-mode-help](custom-mode-help/)。
