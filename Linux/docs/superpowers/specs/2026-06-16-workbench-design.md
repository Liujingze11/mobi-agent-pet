# 工作会话 + 任务系统 + 闭环报表 设计

**日期**: 2026-06-16 | **状态**: 已批准

## 目标

1. 开始工作/学习弹窗重写（项目+任务+知识+计时器一体化）
2. 主任务+子任务系统（可勾选checklist）
3. 新增工作台页面（计时器+任务+知识+报表更新）
4. API Key 缺失时提示配置
5. 报表手动更新按钮
6. 知识库关联工作会话

## 数据库

- `tasks` 表新增 `parent_id TEXT` 字段
- 其他表不变

## 新增页面

- `src/components/gui/workbench/WorkbenchPage.tsx` — 工作台

## 修改组件

- `QuickPanel.tsx` — 重写为完整开始工作/学习弹窗
- `Sidebar.tsx` — 新增工作台入口
- `DailyReport.tsx` / `WeeklyReport.tsx` / `MonthlyReport.tsx` — 手动更新按钮
- 翻译文件 — 新增 workbench keys

## IPC 新增

- `tasks:list-subtasks`, `tasks:create-subtask`, `tasks:toggle-subtask`
- `app:check-api-key`
- `reports:refresh-daily`, `reports:refresh-weekly`, `reports:refresh-monthly`
