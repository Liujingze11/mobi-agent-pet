# 开发版从应用菜单启动闪退

用户实际反馈：从 GNOME「显示应用程序」点击开发版，只出现一个很快关闭的终端，桌面宠物和主窗口都没有出现。

## 根因与证据

- 磁盘上的新入口是 `Terminal=false`，Exec 带 `--desktop`；实际点击在 14:09:45 和 14:09:54 的阶段日志却是 `mode=manual`，没有这个参数。桌面菜单仍在执行旧调用，符合旧入口缓存未更新的情况。
- 手动/旧入口分支使用 `nohup npm run dev &` 后立即退出。终端可能在 nohup 完成信号保护前关闭，SIGHUP 会打断刚 fork 的子进程。日志停在 runtime-resolved，没有 npm 输出。
- 用真正的 `Gio.DesktopAppInfo.launch` 执行临时 `Terminal=true`、不带参数的旧入口，复现终端闪过、主进程为空。
- 回归测试用慢 nohup shim 复现这个时间窗口：先发布自身 PID，稍后执行真实 nohup；对已验证为安全整数且大于 1 的 PID 发送 SIGHUP，旧版本 worker 无法启动，测试先失败。测试仅读写隔离临时目录，不启动 Electron GUI。

## 修复

- 手动/旧入口分支在 fork 前先 `trap '' HUP`，子进程从出生起继承忽略 HUP，消除 nohup 初始化前的竞态。SIGINT/SIGTERM 与现有正常退出流程保持不变。
- 新桌面入口继续 `Terminal=false`、`--desktop` + exec npm，隐藏启动进程跟随应用生命周期；不依赖终端窗口。
- 安装器先完整写入同目录临时文件，再原子 rename 替换应用菜单和桌面入口，避免桌面菜单观察到被截断的 .desktop。现有读者仍能读取完整旧文件，后续读者读取新文件。
- Linux 开发版 `app.setDesktopName` 和 `StartupWMClass` 都与 `mobi-agent-pet-dev.desktop` 匹配。原先窗口类是 mobi-agent-pet，唯一已安装的入口却是 mobi-agent-pet-dev.desktop，GNOME 曾报 appInfo 为空。此问题独立修正；其他系统与打包版不覆盖其桌面标识。
- 再次打开最小化的 Manager 时先 restore，再 show/focus；新增对应回归。
- 启动日志记录入口 PID、时间、模式及 Node/npm 解析阶段，便于区分入口未执行、环境恢复与实际构建启动。

桌面身份依据：[Electron app.setDesktopName](https://www.electronjs.org/docs/latest/api/app#appsetdesktopnamename-linux)、[GNOME 42.9 ShellApp](https://github.com/GNOME/gnome-shell/blob/42.9/src/shell-app.c)。现场日志和窗口属性是本次判断的主要证据。

## 验证

- 相同的旧 Terminal=true 无参数入口，修复后启动 PID 114726，跨完整测试运行及多个工具调用仍存活；仅该排查实例随后被关闭以继续冷启动检查。
- 从更新后的 `gtk-launch mobi-agent-pet-dev` 冷启动，主窗口出现，未新增终端窗口，WM_CLASS 为 mobi-agent-pet-dev，主进程 PID 121107。
- 五个相关测试文件 56 项通过。独立复审修正了测试 PID 文件可能尚为空的竞态，随后独立 20 项相关测试及桌面身份专项测试通过，无剩余 Critical / Important。
- 完整 `npm run test:phase2` 退出码 0：业务 307、管理页面 79、运行时 6385 项通过，共 6771 项通过，22 项跳过；类型检查和构建通过。日志 `/tmp/mobi-menu-launch-phase2.log`。
- 测试 PID 读取保护修正后，重新运行完整 `npm test`，307 项通过，0 失败，日志 `/tmp/mobi-menu-final-business.log`。
- Bash 语法检查与 git diff --check 通过。

最终持续运行检查：等待 30 秒并跨后续独立命令后，PID 121107 仍存活，主窗口 Map State=IsViewable、尺寸 1180×760；GIO 解析的实际入口为 --desktop，Terminal=false，StartupWMClass=mobi-agent-pet-dev。应用保留运行。
