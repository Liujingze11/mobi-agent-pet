# DevPulse AI — 开发文档

> 智能研发记录桌面助手。PulseCore 悬浮宠物 + GUI 管理面板，记录工作/学习时长，AI 生成日报/周报/月报。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 33 |
| 前端 | React 19 + TypeScript + Tailwind CSS 3 |
| 构建 | Vite 6 + vite-plugin-electron |
| 数据库 | SQLite (better-sqlite3) |
| AI | DeepSeek API (可扩展多 Provider) |
| 图表 | Recharts |
| 图标 | Lucide React |
| 打包 | electron-builder (AppImage / deb / dmg / nsis) |

## 项目结构

```
Linux/
├── electron/                  # 主进程 (Electron Main Process)
│   ├── main.ts                # 入口：初始化 DB、服务、窗口、托盘
│   ├── preload.ts             # contextBridge 暴露 API 给渲染进程
│   ├── ipc-handlers.ts        # 所有 IPC 通道处理器
│   ├── windows.ts             # BrowserWindow 创建/管理
│   ├── tray.ts                # 系统托盘
│   ├── i18n.ts                # 主进程翻译 (t 函数)
│   ├── ai/                    # AI Provider (DeepSeek, 可扩展)
│   │   ├── types.ts           # SummarizeInput/Output, ReportInput/Output
│   │   ├── provider.ts        # BaseAIProvider 抽象类
│   │   ├── deepseek.ts        # DeepSeek 实现
│   │   └── registry.ts        # AIProviderRegistry (注册/切换 Provider)
│   ├── db/
│   │   ├── connection.ts      # 数据库连接 (WAL mode, FK ON)
│   │   ├── migrate.ts         # 版本化迁移 (v1→v2, _migrations 表)
│   │   ├── seed.ts            # 种子数据 (用户/公司/分类/成就)
│   │   ├── schema.sql         # 完整 DDL
│   │   ├── schema.v1.sql      # v1 快照
│   │   ├── schema.v2.sql      # v2: tasks 表增加 parent_id
│   │   └── queries/           # 数据查询层
│   │       ├── projects.ts    # 项目 CRUD
│   │       ├── tasks.ts       # 任务 CRUD + 子任务
│   │       ├── work-sessions.ts
│   │       ├── learning.ts    # 学习分类/主题/会话
│   │       ├── reports.ts     # 日报/周报/月报
│   │       ├── achievements.ts
│   │       ├── settings.ts    # app_settings 键值存储
│   │       └── users.ts
│   ├── timer/
│   │   ├── engine.ts          # TimerEngine 定时器引擎
│   │   ├── state.ts           # TimerStateManager 状态机
│   │   ├── persistence.ts     # 快照保存/恢复
│   │   └── types.ts           # TimerStatus, TickPayload, SessionResult
│   ├── report/
│   │   ├── generator.ts       # ReportGenerator
│   │   ├── daily.ts           # 日报生成
│   │   ├── weekly.ts          # 周报生成
│   │   ├── monthly.ts         # 月报生成
│   │   ├── export.ts          # Markdown 导出
│   │   └── types.ts           # DailyReportData 等
│   ├── achievements/checker.ts # AchievementChecker
│   └── utils/                 # id / time / logger
│
├── src/                       # 渲染进程 (Renderer)
│   ├── gui/                   # GUI 管理面板
│   │   ├── App.tsx            # I18nProvider + OnboardingGate + 路由
│   │   ├── main.tsx           # ReactDOM 入口
│   │   └── index.html
│   ├── pulsecore/             # PulseCore 悬浮窗
│   │   ├── App.tsx            # 宠物 + QuickPanel + WorkDialog + 计时器
│   │   ├── main.tsx
│   │   └── index.html
│   ├── components/
│   │   ├── pulsecore/
│   │   │   ├── PulseCore.tsx   # Canvas 宠物渲染 (使用 PetForm 对象)
│   │   │   ├── pets.ts         # PetForm 基类 + 5个子类 (OOP)
│   │   │   ├── QuickPanel.tsx  # 开始工作/学习入口面板
│   │   │   ├── WorkDialog.tsx  # 工作/学习表单弹窗
│   │   │   ├── ReviewDialog.tsx # 复盘弹窗
│   │   │   └── AchievementToast.tsx
│   │   └── gui/
│   │       ├── layout/        # Layout, Sidebar, PulseBar
│   │       ├── overview/      # OverviewPage (概览)
│   │       ├── projects/      # ProjectList
│   │       ├── tasks/         # TaskList
│   │       ├── knowledge/     # KnowledgePage
│   │       ├── sessions/      # SessionTable
│   │       ├── reports/       # DailyReport, WeeklyReport, MonthlyReport
│   │       ├── workbench/     # WorkbenchPage (工作台)
│   │       ├── achievements/  # AchievementWall
│   │       └── settings/      # SettingsPage + PetSelector
│   ├── lib/
│   │   ├── ipc.ts             # api = window.electronAPI
│   │   ├── types.ts           # 共享 TS 类型 + window.electronAPI 声明
│   │   └── i18n/              # 国际化
│   │       ├── index.tsx      # I18nProvider, useI18n, OnboardingGate
│   │       ├── zh-CN.ts       # 中文翻译 (~200 keys)
│   │       ├── en-US.ts       # 英文翻译
│   │       └── types.ts       # TranslationMap 接口
│   └── styles/globals.css
│
├── resources/icons/           # App 图标 (DP+AI logo, 各种尺寸)
├── docs/superpowers/          # 设计文档和实现计划
├── package.json
├── vite.config.ts
├── electron-builder.yml
└── tailwind.config.js
```

## 架构关键点

### 窗口系统
- **PulseCore window**: 180×220, `type:'toolbar'`, `alwaysOnTop`, `transparent`, `skipTaskbar`
  - 首次启动不创建（仅显示 GUI 引导页）
  - 后续启动直接显示
  - 作为 GUI 子窗口 (`setParentWindow`)，合并为一个任务栏条目
- **GUI window**: 1200×800, 关闭→隐藏 (不退出), 仅托盘退出才真正关闭
- **托盘**: 始终显示，右键菜单：开始工作/学习、显示/隐藏宠物、打开面板、退出

### 数据流
```
渲染进程 (React) ←→ preload (contextBridge) ←→ IPC handlers ←→ DB queries ←→ SQLite
```

### 定时器引擎
- `TimerEngine` 管理状态机: `idle → working/learning → paused → ...`
- 每 1s 广播 `timer:tick`，每 5s 保存快照
- 启动时从快照恢复 (<24h 内有效)
- `TimerStateManager.validateTransition()` 校验状态切换合法性

### AI Provider
- `BaseAIProvider` 抽象类 → `DeepSeekProvider`
- `AIProviderRegistry` 管理多 Provider
- `summarize()` 用于复盘总结
- `generateReport()` 用于日报/周报/月报
- 配置存储在 `app_settings` 表 (ai_api_key, ai_base_url, ai_model)

### 国际化
- `I18nProvider` React Context + `useI18n()` hook
- 主进程: `electron/i18n.ts` — `t(key)` 函数
- 语言存 `app_settings.language` (`zh-CN` | `en-US`)
- 首次启动: `OnboardingGate` 选语言→选模式→完成
- Settings 页面可随时切换

### 宠物系统 (OOP)
- `PetForm` 抽象基类 (pets.ts): `id`, `displayName`, `colors(status)`, `draw(ctx,...)`
- 5 个子类: `HeartbeatForm`, `EnergyCoreForm`, `PulseRingForm`, `HexCrystalForm`, `DataStreamForm`
- `petRegistry` 注册所有宠物
- Settings → PetSelector 可视化选宠，通过 IPC `settings:pet-changed` 跨窗口同步

## 常用命令

```bash
# 开发
npm run electron:dev          # 启动 Vite + Electron
npm run dev                   # 仅 Vite

# 构建
npm run build                 # tsc + vite build
npm run electron:build:linux  # 构建 Linux 包 (AppImage + deb)

# 清理数据库（模拟首次启动）
rm -f ~/.config/devpulse-ai/data/devpulse.db*

# TypeScript 检查
npx tsc --noEmit

# 重编译原生模块 (切换 Node 版本后)
npm rebuild better-sqlite3 --build-from-source
# 或为 Electron 编译
npx electron-rebuild -f -w better-sqlite3
```

## 数据库

### 核心表
| 表 | 用途 |
|----|------|
| users | 用户 |
| companies | 公司 |
| projects | 项目 (status: active/completed/archived) |
| tasks | 任务 (parent_id → 子任务, status: todo/in_progress/done) |
| work_sessions | 工作会话 |
| learning_sessions | 学习会话 |
| learning_categories | 知识分类 |
| learning_topics | 知识主题 |
| daily_reports | 日报 (user_id + date UNIQUE) |
| weekly_reports | 周报 (user_id + year + week UNIQUE) |
| monthly_reports | 月报 (user_id + year + month UNIQUE) |
| achievements | 成就定义 |
| user_achievements | 用户已解锁成就 |
| pulsecore_snapshot | 定时器崩溃恢复快照 |
| app_settings | 键值设置 (language, ai_api_key, app_mode, pet_form) |
| _migrations | 迁移版本追踪 |

### 迁移
- `_migrations` 表追踪版本号
- `CURRENT_VERSION = 2` (v1: 初始 schema, v2: tasks.parent_id)
- 新增迁移: 创建 `schema.v<N>.sql`，增加 `CURRENT_VERSION`

## IPC API 清单

### Timer
`timer:start-work`, `timer:start-learning`, `timer:pause`, `timer:resume`, `timer:stop`, `timer:get-state`, `timer:get-today-stats`

### Projects
`projects:list`, `projects:get`, `projects:create`, `projects:update`, `projects:remove`

### Tasks
`tasks:list-by-project`, `tasks:list-main`, `tasks:list-subtasks`, `tasks:create`, `tasks:create-subtask`, `tasks:toggle-subtask`, `tasks:update`, `tasks:remove`

### Learning
`learning:list-categories`, `learning:create-category`, `learning:list-topics`, `learning:create-topic`

### Sessions
`sessions:list-work`, `sessions:list-learning`, `sessions:get-work`, `sessions:get-learning`, `sessions:save-review`

### AI
`ai:summarize`, `ai:generate-report`, `ai:validate-connection`, `ai:get-settings`, `ai:save-settings`

### Reports
`reports:get-daily`, `reports:generate-daily`, `reports:refresh-daily`
`reports:get-weekly`, `reports:generate-weekly`, `reports:refresh-weekly`
`reports:get-monthly`, `reports:generate-monthly`, `reports:refresh-monthly`
`reports:export-markdown`

### Settings
`settings:get`, `settings:set`, `settings:get-all`

### Window
`window:open-gui`, `window:close-gui`, `window:show-pulsecore`, `window:hide-pulsecore`, `window:toggle-pulsecore`, `window:is-pulsecore-visible`, `window:drag`, `window:resize`

### App
`app:get-mode`, `app:set-mode`, `app:onboarding-complete`, `app:has-api-key`, `app:notify-pet-changed`, `app:quit`

### 跨窗口事件
`timer:tick` (main → all windows)
`timer:state-change` (main → all windows)
`settings:pet-changed` (main → all windows)

## 翻译文件 key 结构

```
app.name, app.version
languageGate.title, languageGate.subtitle
pulsecore.status.{idle,working,learning,deepFocus,paused}
pulsecore.forms.{heartbeat,energyCore,pulseRing,hexCrystal,dataStream}
pulsecore.quickPanel.{startWork,startLearning,openGui,pause,resume,...}
pulsecore.review.{workTitle,learningTitle,completed,problems,...}
gui.sidebar.{workbench,overview,projects,...}
gui.overview.{greeting.{...},todayWork,todayLearning,...}
gui.projects.{title,newProject,...}
gui.settings.{title,aiSettings,language,general,...}
gui.pulseBar.{idle,working,startWork,...}
tray.{startWork,startLearning,openGui,quit,tooltip,showPulse,hidePulse}
contextMenu.{startWork,startLearning,openGui,quit}
seed.{defaultUser,categories,achievements}
ai.{workSummarySystem,reportDailySystem,...}
```

## 注意事项

1. **better-sqlite3 是原生模块** — Electron 和系统 Node 版本不同，切换环境需 rebuild
2. **preload 只能用 `contextBridge`** — 不要开 `nodeIntegration`
3. **PulseCore 窗口透明** — `backgroundColor: '#00000000'` 是有效的 8 位 hex（不要改）
4. **GUI 关闭 = 隐藏** — `before-quit` 设 `forceQuit` 标志才真正关闭
5. **种子数据只跑一次** — `seedDefaults()` 检查 `users` 表有数据就跳过
6. **首次启动判断** — `isFirstLaunch(db)` 检查 `app_settings.language` 是否存在
7. **跨窗口状态同步** — 通过 IPC 事件广播，不要假设两个窗口共享内存
