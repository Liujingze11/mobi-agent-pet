# 编辑自定义模式托盘入口修复

用户重启后的程序点击入口没有弹窗。原因是 `menu.js` 的 `buildTraySnapshot()` 只转发了 `openSettingsWindow`，遗漏 `openCustomModeEditor`；托盘命令执行时抛出 `TypeError: ctx.openCustomModeEditor is not a function`。直接调用编辑器窗口和直接构造 tray-menu-model 的此前测试没有覆盖这层中转。

修复为菜单 modelContext 补齐 `openCustomModeEditor` 转发，不改变模式或设置窗口。

验证：

- 新回归通过真实 `initMenu → buildTrayMenu → commands.execute` 链路复现修前 TypeError；修后连续两次菜单重建都只打开编辑器。
- 相关测试 79 通过、1 跳过；完整 upstream 6442 通过、22 跳过、0 失败。
- 完整 AgentLog 主程序在隔离配置与禁用集成的实例中，通过真正的托盘 snapshot 命令打开窗口；窗口可见，21 个滑动开关、7 个状态，空闲必选。重复打开复用窗口，关闭后重开成功，状态不变，无 renderer 错误。
- 原生探针首次使用中文标题断言，但隔离 fresh-install 配置选择了系统英文，导致探针断言失败。改为接受合法中英文标题后重新执行全部原生断言，退出码 0，日志输出 `CUSTOM_ENTRY_PASS`。未将第一次运行作为成功依据。
- 只读针对性审查未发现代码阻塞问题；`git diff --check` 通过。

本地忽略日志：`mobi-custom-entry-red.log`、`mobi-custom-entry-focused.log`、`mobi-custom-entry-upstream.log`、`mobi-custom-entry-native.log`。

用户当前已运行实例仍需重启以加载本轮 menu.js 修复。本轮未提交或推送。
