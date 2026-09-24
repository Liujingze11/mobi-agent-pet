# Mobi Agent Pet｜莫比 Pet

Mobi Agent Pet 是一款以 AI 编程助手状态为核心的 Linux 桌面宠物，并提供本地项目、会话与工作时间记录。桌宠运行时基于 Clawd，上层管理界面使用 React。当前开发版本为 0.1.0。

## 当前功能

- 在桌面显示 AI Agent 的工作状态，并通过系统托盘打开设置和会话面板。
- 记录项目、Agent 会话与人工计时，数据保存在本地 SQLite。
- 在设置中控制桌宠显示和开机自启。

## 开发

应用项目位于 [`Linux/mobi-agent-pet/`](Linux/mobi-agent-pet/)。仓库与应用目录均使用 Mobi Agent Pet 的名称。

```bash
cd Linux/mobi-agent-pet
npm install
npm run dev
```

开发快捷方式可通过 `npm run shortcut:dev` 安装。详细说明见[应用 README](Linux/mobi-agent-pet/README.md)。

## 验证

```bash
cd Linux/mobi-agent-pet
npm run test:phase2
```

目前主要在 Linux x64 开发；安装包会在产品功能稳定后构建。现有用户数据继续保存在原应用数据目录，以便改名后沿用设置和历史记录。
