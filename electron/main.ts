import { app, BrowserWindow } from 'electron'
import { createPulseCoreWindow, createGuiWindow } from './windows'
import { createTray } from './tray'
import { initDatabase } from './db/connection'
import { runMigrations } from './db/migrate'
import { seedDefaults } from './db/seed'
import { initIpcHandlers } from './ipc-handlers'
import { TimerEngine } from './timer/engine'
import { AIProviderRegistry } from './ai/registry'
import { ReportGenerator } from './report/generator'

// 全局单例
export let timerEngine: TimerEngine
export let aiRegistry: AIProviderRegistry
export let reportGenerator: ReportGenerator

let pulseCoreWindow: BrowserWindow | null = null
let guiWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  // 初始化数据库
  const db = initDatabase()
  runMigrations(db)
  seedDefaults(db)

  // 初始化核心服务
  timerEngine = new TimerEngine(db)
  aiRegistry = new AIProviderRegistry(db)
  reportGenerator = new ReportGenerator(db, aiRegistry)

  // 初始化 IPC
  initIpcHandlers()

  // 创建窗口
  pulseCoreWindow = createPulseCoreWindow()
  createTray(pulseCoreWindow, () => guiWindow)

  // 崩溃恢复
  await timerEngine.recoverFromSnapshot()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      pulseCoreWindow = createPulseCoreWindow()
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
