# 开发版后台启动与退出清理

开发版桌面入口先前使用 `Terminal=true`，脚本在 `npm run dev` 完成后还会 `read` 等待按回车，导致退出应用后仍留下终端窗口。

## 修改

- 应用菜单与桌面快捷方式改为 `Terminal=false`，入口仍指向仓库的 `scripts/launch-dev.sh`。
- 启动脚本保留 nvm 环境恢复，使用 nohup 后台运行，输入为 `/dev/null`，全部输出追加到 `${XDG_STATE_HOME:-$HOME/.local/state}/mobi-agent-pet/dev.log`，立即返回，不再等待回车。
- Electron 启动器改为可隔离测试的函数。只向自己启动的 Electron 子进程转发 SIGINT/SIGTERM，等待 close 后移除转发监听并返回退出码，避免原实现向自己发信号时再次触发转发。
- 应用原有 before-quit 流程继续负责托盘 helper、状态服务器、Agent 监控及其他自有资源的关闭，不向用户正在运行的 Agent 发信号。
- 已运行 `npm run shortcut:dev`，更新 `/home/ljz/.local/share/applications/mobi-agent-pet-dev.desktop` 与 `/home/ljz/桌面/mobi-agent-pet-dev.desktop`，核对实际入口包含 `Terminal=false`。

## 验证

- 相关 43 项测试通过，包括快捷方式、启动器信号、启动失败、业务关闭和 Linux 托盘 supervisor。
- 真实子进程 fixture（不启动 GUI）验证：后台入口立即返回、工作进程仍运行、日志可读；模拟应用退出后，app 与 worker PID 均停止。
- 独立复审无 Critical / Important；审查者独立运行 9 项测试通过。
- Bash 语法检查及 `git diff --check` 通过。
- 最终 `npm run test:phase2` 退出码 0：业务 300 项、管理页面 79 项、上游运行时 6383 项通过，共 6762 项通过，22 项跳过；类型检查和管理页面构建通过。日志 `/tmp/mobi-background-phase2-final.log`。
- 旧环境清理测试曾依赖局部变量名的源码正则；现改为实际调用启动器验证子进程环境，并验证原始环境不被修改。

测试旧启动器时发现其导入会直接启动 Electron；意外启动的测试实例已按日志中的精确 PID 64414 关闭，后续验证使用隔离 fixture，不启动实际 GUI。

## 首次点击不显示主窗口的修复

用户反馈开发版打不开后，用实际 GNOME 会话环境复现：启动入口能够恢复 nvm、执行构建并启动 Electron，但第一次点击只有 122×122 的宠物窗口及命中窗口，没有 Manager；再次点击才会由 second-instance 事件打开 Manager。最初根据立即读取的空日志推断后台进程没启动，随后等待构建完成推翻了这一推断，没有据此替换 nohup 启动方式。

- 开发入口显式传递 `AGENTLOG_OPEN_MANAGER_ON_STARTUP=1`。
- 业务运行时在应用就绪并完成存储初始化后响应此标记，打开 Manager。未带标记的启动继续只显示宠物；既有单实例与退出清理流程保留。
- 回归测试先失败（首次窗口数量为 0、子进程继承标记为 0），再验证修复。完整 `npm test` 302 项通过；独立复审 26 项相关测试通过，无审查问题。日志 `/tmp/mobi-first-launch-green.log`。
- 从实际 `gtk-launch mobi-agent-pet-dev` 冷启动，首次即出现标题为 Mobi Agent Pet、1180×760 的主窗口，主进程 PID 89819；无需终端或第二次点击。

## 桌面入口持续运行修复

持续检查发现仅验证窗口短暂出现不足：nohup 桌面入口的 owner 立即结束，命令会话中的实际桌面实例随后也已停止。该现象可能受调试命令会话的生命周期影响，不能据此断言 GNOME 本身会回收应用。桌面入口现使用 `--desktop`，脚本以 `exec npm run dev` 保持隐藏的入口进程跟随应用生命周期；`Terminal=false` 不变。手动调用脚本仍用 nohup 后台启动并立即返回。

- 已重新安装并核对应用菜单、桌面两份实际快捷方式。
- 新增桌面生命周期 fixture 先红（应用运行时 owner 已退出 0），修复后验证 owner 与 npm worker 为同一 PID，应用退出后 owner 返回 0；手动后台模式独立验证。
- 完整业务测试更新为 303 项通过，0 失败，日志仍为 `/tmp/mobi-first-launch-green.log`。

最终持久运行验证使用实际 GNOME 会话环境与快捷方式的相同脚本/`--desktop` 参数，并通过独立进程会话隔离调试命令退出的影响。应用首次出现 Manager 后，跨工具调用并再等待 30 秒，owner PID 92650 与主进程 PID 92926 仍存活，1180×760 主窗口仍存在。独立增量复审 27 项测试通过，无 Critical / Important。应用保留运行，未停止用户的 Agent。
