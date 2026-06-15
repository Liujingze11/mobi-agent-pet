# DevPulse AI — 产品设计规格书

> 版本: v1.0 MVP  
> 日期: 2026-06-15  
> 状态: 设计阶段，待实现

---

## 一、产品概述

**DevPulse AI** 是一个面向研发团队和个人开发者的智能研发记录软件。以桌面宠物 **PulseCore 脉核** 为核心入口，通过常驻桌面的智能助手自动记录研发时长和学习时长，结合 DeepSeek API 实现 AI 自动总结与日报/周报/月报生成。

### 核心定位

- **主产品形态**：桌面悬浮宠物 PulseCore 脉核（能量核心，非猫狗）
- **辅助功能**：后台 GUI 管理面板（本地桌面窗口，非 Web 页面）
- **目标用户**：研发团队 + 独立开发者
- **平台**：macOS / Linux / Windows（首版优先 Linux 开发）

### 不做什么

- ❌ 不是 Web 网站
- ❌ 不是普通日报系统
- ❌ 不是浏览器插件
- ❌ 第一版不做团队协作服务器同步

---

## 二、技术选型

### 桌面框架：Electron

| 评估维度 | Electron | Tauri |
|---------|----------|-------|
| 透明悬浮窗 | ✅ 成熟稳定，三平台一致 | ⚠️ Linux 下行为不一致 |
| 窗口置顶 | ✅ `alwaysOnTop: true` | ✅ `always_on_top: true` |
| 动画渲染 | ✅ Chromium CSS/Canvas/WebGL | ✅ 但 Linux 透明窗问题限制 |
| 开发速度 | ✅ JS/TS 全栈，生态丰富 | ⚠️ Rust 学习成本 |
| 打包体积 | ~150MB | ~5MB |
| 跨平台成熟度 | ✅ 非常成熟 | ⚠️ 追赶中 |

**结论**：MVP 选 Electron。核心原因：PulseCore 透明悬浮窗是产品脸面，Electron 的跨平台一致性不可替代。等 Tauri 透明窗口成熟后可考虑迁移（React 层可复用）。

### 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron |
| UI 框架 | React 18 + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| 图表 | Recharts |
| 本地数据库 | SQLite (better-sqlite3) |
| AI API | DeepSeek API（主），预留多 Provider |
| 打包 | electron-builder |
| 动画 | CSS animations + Canvas（PulseCore 核心动画） |

---

## 三、跨平台桌面应用架构

```
┌─────────────────────────────────────────────────────────────┐
│                    DevPulse AI 桌面应用                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  PulseCore 悬浮窗  │    │     后台 GUI 管理窗口          │   │
│  │  (始终置顶、透明)   │    │   (普通窗口，托盘打开)         │   │
│  │                  │    │                              │   │
│  │  BrowserWindow   │    │   BrowserWindow              │   │
│  │  transparent:true│    │   frame:true                 │   │
│  │  alwaysOnTop:true│    │   resizable:true             │   │
│  │  frame:false     │    │                              │   │
│  │  skipTaskbar:true│    │                              │   │
│  └────────┬─────────┘    └──────────────┬───────────────┘   │
│           │                             │                    │
│           │    IPC (contextBridge)       │                    │
│           ▼                             ▼                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Electron Main Process                   │ │
│  │                                                        │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │ │
│  │  │  Timer    │ │  AI      │ │  Report  │ │  System    │ │ │
│  │  │  Engine   │ │  Provider│ │Generator │ │  Tray      │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │ │
│  │       │            │            │              │        │ │
│  │       ▼            ▼            ▼              ▼        │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │           SQLite (better-sqlite3)                │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              React UI Layer (共享组件)                    │ │
│  │                                                        │ │
│  │  ┌─────────────────┐  ┌────────────────────────────┐  │ │
│  │  │ PulseCore UI    │  │  GUI Pages                 │  │ │
│  │  │ (悬浮窗 React)  │  │  (管理面板 React)           │  │ │
│  │  │                 │  │                            │  │ │
│  │  │ • 能量核心动画  │  │  • Overview 总览           │  │ │
│  │  │ • 快捷控制面板  │  │  • Projects 项目管理       │  │ │
│  │  │ • 复盘弹窗     │  │  • Tasks 任务管理           │  │ │
│  │  │ • 成就动画     │  │  • Knowledge 知识库         │  │ │
│  │  └─────────────────┘  │  • Sessions 记录查看        │  │ │
│  │                       │  • Reports 日报/周报/月报   │  │ │
│  │                       │  • Achievements 成就        │  │ │
│  │                       │  • Settings 设置            │  │ │
│  │                       └────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 架构原则

- **主进程拥有所有数据和业务逻辑**：Timer Engine、AI Provider、Report Generator、SQLite 操作均在主进程
- **渲染进程只做 UI**：通过 `contextBridge` IPC 与主进程通信，不直接操作数据库
- **双 BrowserWindow**：PulseCore 悬浮窗和 GUI 管理窗口各自独立加载，可独立存活
- **崩溃恢复**：主进程每 5 秒持久化当前 session 快照到 SQLite

---

## 四、PulseCore 悬浮窗交互设计

### 折叠态（默认常驻桌面）

```
  ┌──────────────────────┐
  │                      │
  │     ◉ PulseCore      │    ← 能量核心本体
  │    ╭─────────╮       │       呼吸发光动画
  │   ╱           ╲      │       当前状态颜色变化
  │  │    ⚡💗⚡    │     │
  │   ╲           ╱      │
  │    ╰─────────╯       │
  │                      │
  │   今日研发: 3h 12m    │    ← 悬浮文字 (hover 显示)
  │   今日学习: 1h 05m    │
  └──────────────────────┘
```

- 大小约 80×80 核心可视区域，窗口实际约 120×140（含透明边距）
- 始终置顶，`skipTaskbar: true`（不在任务栏显示）
- 核心区域作为拖动 handle，核心外区域鼠标穿透到下方桌面
- 右键菜单：开始工作 / 开始学习 / 查看今日 / 打开 GUI / 退出

### 展开态（点击 PulseCore 本体）

点击后在 PulseCore 旁边弹出快捷面板，PulseCore 本体保持不动：

```
  ┌──────────────────────┐
  │                      │      ┌─────────────────────────┐
  │     ◉ PulseCore      │      │ 快捷面板                  │
  │    ╭─────────╮       │  ◄── │                         │
  │   ╱  (活跃)   ╲      │  连接 │ ● 当前状态: Working      │
  │  │    ⚡💗⚡    │     │      │                         │
  │   ╲           ╱      │      │ 项目: DevPulse AI        │
  │    ╰─────────╯       │      │ 任务: 架构设计            │
  │                      │      │                         │
  │   00:32:15           │      │ ⏱ 本次: 00:32:15        │
  └──────────────────────┘      │ ⏸ 暂停  ⏹ 结束          │
                                │                         │
                                │ 📊 今日: 研发 3h44m      │
                                │        学习 1h05m       │
                                │                         │
                                │ [查看今日记录]            │
                                │ [打开完整面板]            │
                                └─────────────────────────┘
```

### 复盘弹窗（结束计时后）

结束计时后 PulseCore 变暗，弹窗居中覆盖：

```
  ┌──────────────────────────────────────────┐
  │  📝 本次工作复盘                          │
  │                                          │
  │  项目: DevPulse AI  任务: 架构设计         │
  │  时长: 00:52:18                          │
  │                                          │
  │  这段时间完成了什么？   遇到的问题？         │
  │  解决了什么？         下一步准备做什么？    │
  │                                          │
  │        [跳过]           [AI 总结并保存]   │
  └──────────────────────────────────────────┘
```

- 学习复盘类似，问题换为：学习内容、学习收获、遇到的疑问
- AI 总结后 PulseCore 释放脉冲动画，返回折叠态
- 跳过则原文保存不做 AI 总结

### 成就动画

达成成就时 PulseCore 爆发强脉冲 3 连发 + 金色光芒 + 成就卡片 3 秒展示。

---

## 五、PulseCore 状态机

```
                          ┌─────────────┐
                    ┌────►│    IDLE     │◄────────────┐
                    │     │   空闲状态   │              │
                    │     └──────┬──────┘              │
                    │            │                     │
                    │    选择项目/知识主题               │
                    │            │                     │
                    │            ▼                     │
                    │     ┌─────────────┐              │
                    │     │  WORKING /  │    暂停       │
                    │     │  LEARNING   │◄────┐        │
                    │     └──┬──────┬───┘     │        │
                    │        │      │         │        │
                    │   深度专注 │      │结束     │        │
                    │   (自动)  │      │计时     │        │
                    │        │      │         │        │
                    │        ▼      ▼         │        │
                    │  ┌────────┐ ┌────────┐  │        │
                    │  │ DEEP   │ │ REVIEW │  │        │
                    │  │ FOCUS  │ │ 复盘   │  │        │
                    │  └───┬────┘ └───┬────┘  │        │
                    │      │          │       │        │
                    │      ▼          ▼       │        │
                    │  ┌────────┐ ┌────────┐  │        │
                    │  │ PAUSED │ │ACHIEVE-│──┤        │
                    │  │ 暂停   │ │ MENT   │  │        │
                    │  └───┬────┘ └────────┘  │        │
                    │      │                  │        │
                    │      └──────────────────┘        │
                    └──────────────────────────────────┘
```

### 状态表

| 状态 | 触发条件 | 视觉效果 | 可执行操作 |
|---|---|---|---|
| **IDLE** | 应用启动 / 复盘结束 | 低频呼吸，暗蓝色柔光，无脉冲 | 选择项目/主题 → 开始 |
| **WORKING** | 点"开始" | 中频心跳，蓝色核心，脉冲波纹外扩 | 暂停、结束、进入深度专注 |
| **LEARNING** | 点"开始学习" | 中频心跳，绿色核心，脉冲波纹外扩 | 暂停、结束 |
| **DEEP_FOCUS** | 计时 > 25min 自动 / 手动 | 低频稳定心跳，金色核心，极简显示 | 退出专注 |
| **PAUSED** | 点击暂停 | 核心变暗，波纹停止，微弱暗光 | 继续、结束 |
| **REVIEW** | 点"结束" | 核心变暗，复盘弹窗弹出 | 填写复盘 → AI 总结 → IDLE |
| **ACHIEVEMENT** | 达成成就条件 | 强脉冲 3 连发，金色光芒，成就卡片 | 3 秒后回到上一状态 |

---

## 六、后台 GUI 页面结构

### 导航树

```
  📊 Overview      总览（统计卡片 + 趋势图 + 热力图）
  📁 Projects      项目管理（CRUD + 累计时长）
  ✅ Tasks         任务管理（按项目分组，状态管理）
  📚 Knowledge     知识库（分类树 + 主题列表 + 知识卡片）
  📝 Sessions      记录查看（表格 + 筛选 + 详情）
  ─────────────────
  📄 Daily         日报
  📅 Weekly        周报
  📈 Monthly       月报
  ─────────────────
  🏆 Achievements  成就墙
  ⚙️  Settings      设置（AI / 外观 / 数据 / 通用）
```

### 首次进入

首次进入 GUI 时弹出模式选择：独立开发者 / 团队开发，决定数据隔离策略。

---

## 七、数据库 Schema

### 数据模型关系

```
  users ─┬─ user_companies ─── companies
         │
         ├─ work_sessions ───── projects ─── tasks
         │       │
         │       └─ work_session_tags ─── tags
         │
         ├─ learning_sessions ── learning_topics ── learning_categories
         │       │
         │       └─ learning_session_tags ─── tags
         │
         ├─ daily_reports
         ├─ weekly_reports
         ├─ monthly_reports
         ├─ user_achievements ── achievements
         ├─ pulsecore_snapshot (崩溃恢复)
         └─ app_settings (键值对)
```

### 核心枚举与默认值

- 所有主键：`TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))`（32 字符 hex）
- 时间字段：ISO 8601 TEXT（`datetime('now')`）
- 时长字段：`INTEGER` 秒（精确，展示时换算）
- Session 状态：`'active' | 'paused' | 'completed'`
- 项目状态：`'active' | 'archived' | 'completed'`
- 任务状态：`'todo' | 'in_progress' | 'done' | 'paused'`
- 用户角色：`'owner' | 'admin' | 'member'`
- AI 总结 session_type：`'work' | 'learning'`
- Pulsecore 状态：`'idle' | 'working' | 'learning' | 'deep_focus' | 'paused'`

### 完整 DDL

参见 `electron/db/schema.sql`（共 16 张表）：
users, companies, user_companies, projects, tasks, learning_categories, learning_topics, work_sessions, learning_sessions, ai_summaries, daily_reports, weekly_reports, monthly_reports, achievements, user_achievements, tags, work_session_tags, learning_session_tags, pulsecore_snapshot, app_settings

---

## 八、Timer Engine

### 设计原则

- 运行在主进程，单例模式
- 独立于任何渲染窗口，窗口关闭计时不丢失
- 每 1 秒 tick 广播给渲染进程（IPC）
- 每 5 秒持久化 snapshot 到 SQLite（崩溃恢复）
- 深度专注：持续 25 分钟无暂停自动触发

### 核心接口

```typescript
interface TimerEngine {
  startWork(projectId: string, taskId?: string): void
  startLearning(topicId: string): void
  pause(): void
  resume(): void
  stop(): SessionResult

  getState(): TimerState
  getCurrentSession(): Session | null
  getTodayStats(): DailyStats

  onTick(handler: (payload: TickPayload) => void): void
  onStateChange(handler: (state: TimerState) => void): void
}
```

### 崩溃恢复

启动时读取 `pulsecore_snapshot` → 有未完成 session 且 < 24h → 恢复计时并补时间差 → > 24h → 视为过期自动结束标记"异常中断"。

---

## 九、AI Summary Provider 接口

### 架构

- Provider 可插拔，统一接口
- MVP 实现 DeepSeekProvider（OpenAI-compatible API）
- 预留 OpenAIProvider、ClaudeProvider、OllamaProvider
- Provider 配置（API Key 等）存在主进程，渲染进程不接触

### 核心接口

```typescript
interface AIProvider {
  readonly name: string
  readonly displayName: string
  readonly models: string[]
  configure(config: ProviderConfig): void
  validateConnection(): Promise<{ ok: boolean; error?: string }>
  summarize(input: SummarizeInput): Promise<SummarizeOutput>
  generateReport(input: ReportInput): Promise<ReportOutput>
}
```

### 失败处理

调用失败 → 重试 1 次 → 仍失败 → 原文保存（降级）→ 通知用户"AI 总结失败，已保存原文"

---

## 十、Report Generator

### 三级报告

| 报告 | 周期 | 核心内容 |
|------|------|---------|
| Daily Pulse | 每日 | 今日总时长、项目分布、学习分布、时间线、AI 综述 |
| Weekly Pulse | 每周 | 7 天趋势、项目占比、学习分布、知识沉淀、下周计划 |
| Monthly Pulse | 每月 | 周趋势、热力图、项目进展里程碑、月度复盘总结 |

### 生成方式

- 手动生成（GUI 报告页面点"生成"）
- 自动生成（每日 18:00 自动生成日报）
- 增量更新（每次 session 结束自动更新当日日报统计数据）

### 导出

- Markdown（默认，可复制到飞书/Notion/语雀）
- PDF（后续支持）

---

## 十一、成就系统

### 成就类型

| 类别 | 示例 |
|------|------|
| **milestone** 里程碑 | 首次记录、第 10/50/100 次 session、累计研发 100h/500h/1000h |
| **streak** 连续 | 连续记录 3/7/30/100 天、连续 5 个工作日 |
| **volume** 体量 | 单日研发超 8h、单周学习超 20h |
| **special** 特殊 | 完成第一个项目、生成第一篇周报、使用 AI 总结 100 次 |

### 成就条件

`achievements.condition_json` 存储 JSON 格式的解锁条件定义，Engine 在每次 session 结束/报告生成后检查触发。

---

## 十二、MVP 项目目录结构

```
DevPulse-AI/
├── package.json
├── electron-builder.yml
├── tsconfig.json
│
├── electron/                       # Electron 主进程
│   ├── main.ts                     # 应用入口
│   ├── preload.ts                  # contextBridge
│   ├── tray.ts                     # 系统托盘
│   ├── windows.ts                  # 窗口管理器
│   ├── ipc-handlers.ts             # IPC 路由
│   ├── timer/                      # Timer Engine
│   │   ├── engine.ts
│   │   ├── state.ts
│   │   ├── persistence.ts
│   │   └── types.ts
│   ├── ai/                         # AI Provider
│   │   ├── registry.ts
│   │   ├── provider.ts
│   │   ├── deepseek.ts
│   │   ├── prompt-templates.ts
│   │   └── types.ts
│   ├── report/                     # Report Generator
│   │   ├── generator.ts
│   │   ├── daily.ts
│   │   ├── weekly.ts
│   │   ├── monthly.ts
│   │   ├── export.ts
│   │   └── types.ts
│   ├── db/                         # 数据库
│   │   ├── connection.ts
│   │   ├── migrate.ts
│   │   ├── seed.ts
│   │   ├── schema.sql
│   │   └── queries/                # 按模块分查询文件
│   │       ├── projects.ts
│   │       ├── tasks.ts
│   │       ├── work-sessions.ts
│   │       ├── learning.ts
│   │       ├── reports.ts
│   │       ├── achievements.ts
│   │       ├── settings.ts
│   │       └── users.ts
│   └── utils/
│       ├── time.ts
│       ├── id.ts
│       └── logger.ts
│
├── src/                            # React UI（渲染进程）
│   ├── pulsecore/                  # PulseCore 悬浮窗入口
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── gui/                        # GUI 管理面板入口
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── components/
│   │   ├── pulsecore/              # PulseCore 专属
│   │   │   ├── PulseCore.tsx
│   │   │   ├── CoreAnimation.tsx
│   │   │   ├── QuickPanel.tsx
│   │   │   ├── ReviewDialog.tsx
│   │   │   └── AchievementToast.tsx
│   │   ├── gui/                    # GUI 专属
│   │   │   ├── layout/ (Sidebar, TopBar, Layout)
│   │   │   ├── overview/ (OverviewPage, StatCard, WeeklyTrend, ProjectPie)
│   │   │   ├── projects/ (ProjectList, ProjectCard, ProjectForm)
│   │   │   ├── tasks/ (TaskList, TaskForm)
│   │   │   ├── knowledge/ (KnowledgePage, CategoryTree, TopicForm)
│   │   │   ├── sessions/ (SessionTable, SessionDetail)
│   │   │   ├── reports/ (DailyReport, WeeklyReport, MonthlyReport)
│   │   │   ├── achievements/ (AchievementWall)
│   │   │   └── settings/ (SettingsPage, AISettings, GeneralSettings)
│   │   └── shared/                 # 共享组件
│   │       ├── Button.tsx, Input.tsx, Dialog.tsx, Select.tsx
│   │       ├── TimeDisplay.tsx, EmptyState.tsx
│   ├── hooks/                      # React Hooks
│   │   ├── useIpc.ts, useTimer.ts
│   │   ├── useProjects.ts, useTasks.ts
│   │   ├── useKnowledge.ts, useReports.ts
│   ├── lib/                        # 前端工具
│   │   ├── ipc.ts, time.ts, types.ts
│   └── styles/
│       ├── globals.css, pulsecore.css, gui.css
│
├── resources/                      # 应用图标 / 托盘图标
├── scripts/                        # 构建/开发脚本
└── docs/                           # 设计文档
    └── superpowers/specs/
        └── 2026-06-15-devpulse-ai-design.md  ← 本文件
```

---

## 十三、MVP 范围清单

### ✅ 包含

1. Electron 跨平台桌面应用框架
2. PulseCore 能量核心悬浮窗（折叠/展开/复盘/成就）
3. 后台 GUI 管理窗口
4. 项目管理（CRUD）
5. 任务管理（CRUD + 状态）
6. 知识分类 + 主题管理
7. 选择项目或知识主题开始计时
8. 开始/暂停/继续/结束计时
9. 复盘输入框（结束计时后弹出）
10. DeepSeek API 接口实现（AI 总结 + 报告生成）
11. WorkSession 保存
12. LearningSession 保存
13. SQLite 数据持久化
14. GUI 中查看今日记录
15. 自动生成日报
16. 自动生成周报
17. 自动生成月报
18. 基础统计图表（Overview 页）
19. 成就定义 + 触发 + 展示
20. 系统托盘 + 后台常驻
21. 崩溃恢复
22. 模式选择（独立开发者 / 团队开发）
23. 多 AI Provider 预留接口

### ❌ 暂不包含（后续版本）

- 团队协作服务器同步
- 多用户权限管理（Schema 已预留）
- PDF 导出
- 开机启动
- 国际化
- vibe coding 项目管理

---

## 十四、开发顺序

1. ✅ 梳理产品需求和功能边界（本文档）
2. ✅ Tauri vs Electron 技术选型
3. ✅ 跨平台桌面应用架构
4. ✅ PulseCore 悬浮窗交互
5. ✅ PulseCore 状态机
6. ✅ 后台 GUI 页面结构
7. ✅ 数据库 Schema
8. ✅ Timer Engine
9. ✅ AI Provider 接口
10. ✅ Report Generator
11. ✅ MVP 项目目录结构
12. ⬜ 实现 MVP（下一步）
13. ⬜ 运行、测试、打包说明

---

## 附录：未来扩展预留

- **vibe coding 项目管理**：projects 表预留 `type` 字段可扩展
- **多 Provider**：AIProvider 接口可插拔
- **团队协作**：companies + user_companies 表已设计
- **Tauri 迁移**：React UI 层与 Electron main process 通过 IPC 解耦，迁移时只需重写主进程
