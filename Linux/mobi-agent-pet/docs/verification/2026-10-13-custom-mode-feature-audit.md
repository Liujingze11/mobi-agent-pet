# 编辑自定义模式：功能完整性核对 — 2026-10-13

## 结论

当前配置的 17 项行为字段全部在编辑框中，没有多出的配置字段；七种状态齐全，空闲固定必选。此前已移除的功能没有重新加入页面。发现一处实际联动错误和一处命名不一致，本轮只调查，没有修复产品代码或调整布局。此前“完全访问模式”改名的未提交修改保留。

后续已按用户确认修复这两处问题，见 `2026-10-13-custom-mode-quota-fix.md`。以下为修复前的调查记录。

## 核对清单

| 分组 | 已有控制项 | 对应配置 |
| --- | --- | --- |
| 桌宠显示 | 显示桌宠、七状态、漫游间隔 | petVisible、states、roamIntervalSeconds |
| 提醒与审批 | 托盘提醒、闪烁间隔、闪烁时长、合并后的 Agent 气泡、通知气泡时长、审批气泡时长、审批方式 | trayAlerts、flashIntervalMs、flashDurationMs、agentBubbles、notificationSeconds、permissionSeconds、permissionAutomationMode |
| 任务信息 | 任务卡片、状态标签、上下文用量、额度提示 | sessionHud、hudStateLabels、hudContext、hudQuota |
| 保持唤醒 | 工作时保持唤醒 | keepAwake |
| 窗口行为 | 跨屏保持大小、全屏应用上显示桌宠 | keepSizeAcrossDisplays、fullscreenOverlay |

七状态为 idle、roam、working、waiting、complete、error、held。动作替换与主题仍在各自页面，不属于自定义模式开关的遗漏。

桌宠双击展开卡片、未固定卡片 5 秒收起、外部点击和实际拖动收起是统一交互规则，目前没有单独的模式配置字段。普通单击及右键桌宠菜单继续取消，系统托盘保留。

## 已删除功能

声音、运行时间、空闲省电、贴边、迷你显示、气泡跟随桌宠均未在编辑框出现。配置模型移除 hudElapsed、lowPowerIdle、allowEdgePinning、miniModeEnabled，并在读取旧配置时丢弃它们；bubbleFollow、旧独立 permissionBubbles / notificationBubbles 仅用于丢弃或迁移为单一 agentBubbles。

对照基线 e621ab5 和功能提交 91a296d，以及独立编辑窗口、任务卡片内容、空闲省电移除、窗口功能移除、任务卡片收起和推荐审批的验证记录。较早记录中的 21 / 20 开关数量是删除后续功能前的历史结果，当前为 17 个滑动开关（10 个布尔选项加 7 个状态），另有 5 个数字输入和 1 个审批下拉框。

## 发现的问题

1. **额度提示被任务卡片开关错误联动。** 自定义配置 sessionHud=false、hudQuota=true 时，app-mode.js 正确返回 sessionHudShowQuota=true，但 main.js:2003 又使用 suppressSessionHud 将传给 HUD 模块的 quota 值改为 false。session-hud.js 本身支持任务卡片与额度环独立显示，因此“单独显示额度”的意图在主程序投影处丢失。
2. **审批方式的命名未统一。** 模式菜单已改为“完全访问模式”，自定义编辑器仍使用“无人值守”。两者都使用 unattended 策略，属于标签不一致，未增加新的审批功能。

本轮不依据“子项在总开关关闭时仍能编辑”判断功能多余。这些是保留的配置值，实际显示仍由总开关和模式门禁控制；是否折叠或禁用属于后续界面设计。

## 验证

- 在 JSDOM 中渲染真实编辑器，比较 profile 全部键与真实表单：17 对 17，missing=[]，extra=[]；七状态齐全。
- 113 项相关测试通过，覆盖编辑保存、删除字段迁移、固定模式边界、保存确认和回滚、卡片以及唤醒。现有测试未覆盖主程序在自定义模式下关闭卡片但保留额度的组合，不能用测试通过掩盖该问题。
- 真实隔离 Electron 实例复现额度问题：custom 下配置额度=true，主程序传给 HUD 的额度=false，额度窗口不显示；同一额度数据切回 normal 后窗口显示。输出 CUSTOM_QUOTA_DEPENDENCY_REPRODUCED，退出 0。
- 实际独立编辑框截图确认五个分组及保存/恢复默认控件。第一轮截图探测在 ready-to-show 前过早读取可见性，改为等待窗口可见后成功；不是产品打开失败。
- 测试使用私有配置、禁用集成和受控输入，没有保存实际用户配置、移动真实鼠标或执行 Agent 命令。

截图：[页面上部](/home/ljz/.codex/visualizations/2026/10/10/01a1233f-634d-75e3-9dfa-a2eda4633da8/custom-mode-audit/01-custom-mode-top.png)、[页面下部](/home/ljz/.codex/visualizations/2026/10/10/01a1233f-634d-75e3-9dfa-a2eda4633da8/custom-mode-audit/02-custom-mode-bottom.png)。本轮不评估或更改视觉布局。
