import { app, BrowserWindow } from 'electron'
import { showPulseCore, createGuiWindow } from './windows'
import { createTray } from './tray'
import { initDatabase } from './db/connection'
import { runMigrations } from './db/migrate'
import { seedDefaults } from './db/seed'
import { initIpcHandlers } from './ipc-handlers'
import { TimerEngine } from './timer/engine'
import { AIProviderRegistry } from './ai/registry'
import { ReportGenerator } from './report/generator'
import { loadLanguage, isFirstLaunch } from './i18n'

// 全局单例
export let timerEngine: TimerEngine
export let aiRegistry: AIProviderRegistry
export let reportGenerator: ReportGenerator

app.whenReady().then(async () => {
  // 初始化数据库
  const db = initDatabase()
  runMigrations(db)
  seedDefaults(db)
  const firstLaunch = isFirstLaunch(db)
  loadLanguage(db)

  // 初始化核心服务
  timerEngine = new TimerEngine(db)
  aiRegistry = new AIProviderRegistry(db)
  reportGenerator = new ReportGenerator(db, aiRegistry)

  // 初始化 IPC
  initIpcHandlers()

  // 创建托盘（始终显示）
  createTray()

  if (firstLaunch) {
    // 首次启动：显示 GUI 引导页（语言+模式选择），暂不显示 PulseCore
    createGuiWindow()
  } else {
    // 后续启动：直接显示 PulseCore
    showPulseCore()
  }

  // 崩溃恢复
  await timerEngine.recoverFromSnapshot()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showPulseCore()
    }
  })
})

app.on('window-all-closed', () => {
  // 不退出应用，保持后台运行
})

app.on('before-quit', () => {
  if (timerEngine) {
    timerEngine.saveSnapshot()
  }
})
