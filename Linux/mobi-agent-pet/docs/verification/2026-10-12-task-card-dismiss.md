# 临时任务卡片收起

后续用户要求取消定时/鼠标离开收起，并增加双击容错；最终规则与验证见 [任务卡片停留与双击容错](2026-10-12-task-card-stability.md)。本报告记录之前保留离开宽限的实现。

用户要求临时任务卡片点击外部空白处收起，拖动桌宠时收起，并保留原有功能。桌宠单击不弹菜单，桌宠右键菜单仍取消，系统托盘保留。

## 改动

- 临时展开期间用 16ms 的只读按钮状态采样识别新按下；点击桌宠、任务卡片或额度环的实际窗口区域不会误关。采样不截获点击，不改变窗口焦点。
- 拖动快照的鼠标位移超过原有 3px 阈值后，只通知一次收起卡片。采用主进程拖拽路径，覆盖透明窗口 pointermove 延迟的情况；普通按住与双击不触发收起。
- 固定卡片保持原有显示规则，不参与点击或拖动收起。原有鼠标移出宽限、会话跳转、额度独立显示、模式开关与低功耗销毁保留。
- 收起、关闭、资格失效、固定切换及销毁时停止按钮采样并释放 X11 连接；卡片数据保留，下一次双击可重新展开。

原生采样参考：[Windows GetAsyncKeyState](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-getasynckeystate)、[Apple CGEventSource buttonState](https://developer.apple.com/documentation/coregraphics/cgeventsource/buttonstate(_:button:))、[Xlib XQueryPointer](https://xorg.freedesktop.org/X11R7.0/doc/PDF/xlib.pdf)。Windows 只检查当前状态高位；Linux 按钮位与键盘修饰位分开处理。原生接口不可用时保留原有自动收起和拖动收起，不中断应用。

## 验证

- 新增回归修前失败、修后通过：外部点击（包括原 hover padding 内空白）、内部及桌宠点击、拖动收起与再次展开、固定卡片、原宽限、模式关闭、额度环内部点击、仅额度独立展开、原生采样不可用。
- 相关测试 255 通过；最后补充仅额度用例后的两个新增测试文件 12 通过。
- `npm run test:phase2`：6847 通过、22 跳过、0 失败；包含 manager 类型检查和构建。该完整检查后只补充 3 个额度/降级测试，没有修改产品代码。
- 完整 AgentLog 主程序在隔离配置、禁用集成的实例中运行：真实 HUD 窗口外部点击收起，内部点击及普通按住保持；真实 Electron 输入窗口按下加主进程 cursor poll 驱动拖拽，HUD 收起，pet 位移 +70/+35，held 保持；再次展开、固定规则、自动模式关闭验证通过。
- 上述原生窗口探针使用受控按钮状态与屏幕坐标，未操作用户鼠标。X11 按钮读取器另行调用真实原生库验证返回合法按钮状态；Windows/macOS 通过注入绑定验证，未做实体平台验收。
- 首次窗口探针因 app ready 前访问 screen 失败，已修正探针时序后重新运行；最新日志输出 `HUD_DISMISS_PASS`，退出码 0。第一次失败未作为成功依据。
- 只读审查未发现阻塞问题；建议的额度点击与独立展开覆盖已补充。`git diff --check` 通过。

本地忽略日志：`mobi-hud-dismiss-red.log`、`mobi-mouse-buttons-red.log`、`mobi-hud-dismiss-green.log`、`mobi-hud-dismiss-focused.log`、`mobi-hud-dismiss-final-focused.log`、`mobi-hud-dismiss-full.log`、`mobi-hud-dismiss-native.log`。

需要重启应用加载主进程改动。本轮未提交或推送。
