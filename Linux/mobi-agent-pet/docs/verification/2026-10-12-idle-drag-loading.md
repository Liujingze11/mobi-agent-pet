# 空闲拖拽被 SVG 子 frame 加载取消

## 复现与原因

常规模式，mobi-b，122×122。完整 AgentLog 主程序在独立 userData、独立 HTTP 端口、禁用 Agent 集成的实例中复现；未修改用户配置或会话。原生 Electron 输入窗口接受按下事件后，空闲拖拽锁在 10–27ms 内被 `main.js` 的 `did-start-loading` 回调清除，状态恢复 idle。工作、漫游可以保持 held。

空闲 SVG 使用 `<object>`。切换到 held 时卸载旧 object，子 frame 导航到 `about:blank`，同样触发 webContents `did-start-loading`。事件发生时 `isLoadingMainFrame()` 为 false；原回调无条件调用 `cancelPetHold()`，把动画子 frame 加载当作主页面重载。

此前组件探针没有包含 main.js 页面加载生命周期回调，因此空闲按下/移动可以通过，未覆盖这条取消路径。鼠标被用户移动而未命中输入窗口的样本已排除，不作为复现证据。

## 修复

渲染窗口加载回调仅在 `isLoadingMainFrame()` 为 true 时取消拖拽并重置低功耗暂停。输入窗口重载和两个窗口的进程崩溃恢复路径保留。

## 验证

- 新回归修前失败，修后通过：重复 SVG 子 frame 加载保留物理拖拽锁、held、快照、暂停和 hover 状态。
- 主页面及输入窗口重载回归验证解除锁、清除快照、恢复状态、复位暂停和 hover。
- 相关测试 195 通过；补充重载断言后单文件 5 通过。
- `npm run test:phase2`：6836 通过、22 跳过、0 失败；包含 manager 类型检查与构建。
- 完整原生程序修后 idle、working、roam、再次 idle 均保持 held 和拖拽锁。实际 render/input `webContents.reload()` 均解除拖拽；render 主页面加载事件的 `isLoadingMainFrame()` 为 true，子 frame 为 false。
- 针对性只读代码审查未发现阻塞问题；`git diff --check` 通过。

本轮完整程序验证使用 Electron 输入事件，不移动用户鼠标。前序受控 X11 组件测试验证输入窗口命中、按下和全局鼠标轮询移动，但完整程序的 OS 鼠标拖拽仍需在重启后的用户实例确认。

本地忽略日志：`mobi-full-drag-event-trace.log`、`mobi-full-drag-fixed.log`、`mobi-full-drag-reload-verified.log`、`mobi-idle-drag-focused.log`、`mobi-idle-drag-full.log`。

当前已运行的用户实例加载的是修复前 main.js，需要重启应用使修复生效。本轮未提交或推送。
