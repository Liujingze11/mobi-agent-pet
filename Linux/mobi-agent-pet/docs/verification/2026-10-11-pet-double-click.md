# 桌宠双击任务卡片验证

后续已增加独立点击对、共享拖动门槛和持续展开规则，见 [2026-10-12 任务卡片停留与双击容错](2026-10-12-task-card-stability.md)。

## 行为

- 普通单击和右键均不打开桌宠菜单，左键按住移动仍可拖拽；设置入口保留在托盘菜单。
- 双击通过现有 `pet-interaction:reveal-session-hud` IPC 展开任务卡片；空闲、工作、等待和漫游均可使用。
- 模式规则保持生效：常规开启，后台与自动关闭，自定义按保存的配置。没有可显示的数据时不创建空卡片。
- 迷你模式保留单击退出，Ctrl/Cmd 点击保留打开概览。免打扰时不通过双击展开卡片。
- 卡片固定、自动收起与额度环沿用现有实现；各语言的入口说明改为双击。

## 实现要点

按下与松开时会产生 held 状态及取消反馈消息，旧点击计数会被取消。任务卡片使用 Chromium 原生 `dblclick` 事件，避免依赖该计数。松开时也检查移动距离，防止透明窗口未及时投递 pointermove 时把拖动当成双击。

## 验证

- 行为修改后的 `npm run test:phase2`：6836 通过、22 跳过、0 失败，包含管理界面类型检查与构建。
- 文案和测试格式整理后的输入、IPC、HUD、多语言、设置浏览器环境回归：273 通过、0 失败。
- `node --check` 检查两个修改的运行脚本；`git diff --check` 通过。
- 使用独立 userData 的 Electron 窗口，加载真实输入页、preload、交互 IPC、状态控制器与 HUD。通过原生 mouseDown/mouseUp 的双击计数验证：工作状态下双击显示“双击验证”任务；单击不弹菜单；只有松开位置变化的拖动不误触发；自动模式保持隐藏卡片。
- Electron 验证使用受控鼠标位置与会话数据，没有修改正在运行的用户应用或偏好；不等同于跨平台实体鼠标手动验收。

验证日志位于仓库根目录的 `mobi-double-click-verification.log`、`mobi-double-click-focused.log`、`mobi-double-click-native.log`（日志不提交）。

## 取消桌宠菜单（2026-10-12）

取消右键菜单调用，同时移除 preload 的菜单 API、主进程菜单 IPC 和对应弹出方法。保留 contextmenu 的 preventDefault，避免出现浏览器默认菜单；托盘菜单保留。双击卡片、拖拽、迷你模式与概览快捷操作沿用现有规则。

更新原有输入测试后先确认旧实现失败（右键仍调用菜单一次），再移除入口。输入、IPC、HUD 与托盘菜单回归：135 通过、1 跳过、0 失败。完整 `npm run test:phase2`：6836 通过、22 跳过、0 失败，包含类型检查和管理界面构建。取消菜单后的日志为 `mobi-no-pet-menu-red.log`、`mobi-no-pet-menu-green.log`、`mobi-no-pet-menu-verification.log`。
