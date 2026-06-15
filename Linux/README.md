# DevPulse AI — PulseCore 脉核

智能研发记录桌面助手。以桌面悬浮能量核心 **PulseCore** 为主入口，自动记录研发/学习时长，结合 AI 自动生成日报/周报/月报。

## 技术栈

- **桌面框架**: Electron
- **UI**: React + TypeScript + Tailwind CSS
- **数据库**: SQLite (better-sqlite3)
- **AI**: DeepSeek API (可扩展多 Provider)
- **打包**: electron-builder

## 开发环境

```bash
# 激活 conda 环境
conda activate devpulse

# 安装依赖
npm install

# 启动开发模式 (Vite + Electron)
npm run electron:dev
```

## 打包

```bash
# Linux
npm run electron:build:linux

# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win
```

## 项目结构

```
electron/     — Electron 主进程 (Timer, AI, Report, DB)
src/          — React 渲染进程
  pulsecore/  — PulseCore 悬浮窗入口
  gui/        — GUI 管理面板入口
  components/ — UI 组件
docs/         — 设计文档
```
