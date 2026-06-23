# DevPulse AI — PulseCore 脉核

智能研发记录桌面助手。以桌面悬浮能量核心 **PulseCore** 为入口，自动记录研发与学习时长，结合 AI 生成日报/周报/月报。

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue)
![tech](https://img.shields.io/badge/tech-Electron%20%2B%20React%20%2B%20TypeScript-3178c6)
![version](https://img.shields.io/badge/version-0.1.0--MVP-orange)

## 什么是 DevPulse AI？

DevPulse AI 是一个面向研发团队和个人开发者的桌面应用。它不是普通的日报系统——

- 🐾 **PulseCore 脉核** — 常驻桌面的悬浮能量宠物（非猫狗），是产品的核心入口
- ⏱️ **自动计时** — 记录工作/学习时长，无需手动操作
- 🤖 **AI 总结** — 通过 DeepSeek API 自动生成日报、周报、月报
- 📊 **数据看板** — 本地 GUI 管理面板，可视化工作数据
- 🔒 **数据本地化** — SQLite 存储，数据完全在本地，不上传云端

## 功能

- **桌面宠物 PulseCore** — 5 种能量形态，Canvas 渲染 + 粒子特效
- **工作计时器** — 开始/暂停/完成，自动记录会话时长
- **学习记录** — 分类/主题管理，独立学习计时
- **AI 日报** — 一键生成当日工作总结
- **AI 周报/月报** — 自动汇总周期数据，Markdown 导出
- **成就系统** — 里程碑解锁（专注时长、任务数量等）
- **中英双语** — 首次启动选择语言，设置中可随时切换

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron 33 |
| 前端 | React 19 + TypeScript 5 |
| 样式 | Tailwind CSS 3 |
| 构建 | Vite 6 + vite-plugin-electron |
| 数据库 | SQLite (better-sqlite3) |
| AI | DeepSeek API（可扩展多 Provider） |
| 图表 | Recharts |
| 图标 | Lucide React |
| 打包 | electron-builder |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 开发

```bash
# 克隆仓库
git clone https://github.com/Liujingze11/DevPulse-AI.git
cd DevPulse-AI/Linux

# 安装依赖
npm install

# 启动开发模式（Vite + Electron 热重载）
npm run electron:dev
```

### 打包

```bash
# Linux (AppImage + deb)
npm run electron:build:linux

# macOS (dmg + zip)
npm run electron:build:mac

# Windows (NSIS installer)
npm run electron:build:win
```

构建产物在 `Linux/release/` 目录下。

## 项目结构

```
DevPulse_AI/
├── Linux/                       # 主代码目录
│   ├── electron/                # Electron 主进程
│   │   ├── main.ts              # 入口：DB、窗口、托盘
│   │   ├── preload.ts           # contextBridge API
│   │   ├── ipc-handlers.ts      # IPC 通道处理
│   │   ├── windows.ts           # BrowserWindow 管理
│   │   ├── tray.ts              # 系统托盘
│   │   ├── ai/                  # AI Provider 层
│   │   ├── db/                  # 数据库（schema + 迁移 + 查询）
│   │   ├── timer/               # 计时引擎
│   │   ├── report/              # 报告生成器
│   │   └── achievements/        # 成就检查
│   └── src/                     # 渲染进程
│       ├── pulsecore/           # PulseCore 悬浮窗
│       ├── gui/                 # GUI 管理面板
│       └── components/          # 共享组件
├── Mac/                         # macOS 资源
├── Windows/                     # Windows 资源
└── Daily Work Report/           # 日报导出示例
```

## 平台支持

| 平台 | 状态 |
|------|------|
| Linux (AppImage / deb) | ✅ 主要开发平台 |
| macOS (dmg / zip) | ✅ 支持 |
| Windows (NSIS) | ✅ 支持 |

## License

MIT
