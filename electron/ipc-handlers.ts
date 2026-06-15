import { ipcMain, BrowserWindow } from 'electron'
import { getDatabase } from './db/connection'
import { timerEngine, aiRegistry, reportGenerator } from './main'
import * as ProjectQueries from './db/queries/projects'
import * as TaskQueries from './db/queries/tasks'
import * as WorkSessionQueries from './db/queries/work-sessions'
import * as LearningQueries from './db/queries/learning'
import * as ReportQueries from './db/queries/reports'
import * as AchievementQueries from './db/queries/achievements'
import * as SettingsQueries from './db/queries/settings'
import * as UserQueries from './db/queries/users'
import { createGuiWindow, getGuiWindow } from './windows'

export function initIpcHandlers(): void {
  const db = getDatabase()

  // ---- Timer ----
  ipcMain.handle('timer:start-work', (_e, projectId: string, taskId?: string) =>
    timerEngine.startWork(projectId, taskId))
  ipcMain.handle('timer:start-learning', (_e, topicId: string) =>
    timerEngine.startLearning(topicId))
  ipcMain.handle('timer:pause', () => timerEngine.pause())
  ipcMain.handle('timer:resume', () => timerEngine.resume())
  ipcMain.handle('timer:stop', () => timerEngine.stop())
  ipcMain.handle('timer:get-state', () => timerEngine.getState())
  ipcMain.handle('timer:get-today-stats', () => timerEngine.getTodayStats())

  timerEngine.onTick((payload) => {
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send('timer:tick', payload))
  })
  timerEngine.onStateChange((state) => {
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send('timer:state-change', state))
  })

  // ---- Projects ----
  ipcMain.handle('projects:list', (_e, companyId?: string) =>
    ProjectQueries.listProjects(db, companyId))
  ipcMain.handle('projects:get', (_e, id: string) =>
    ProjectQueries.getProject(db, id))
  ipcMain.handle('projects:create', (_e, data: any) =>
    ProjectQueries.createProject(db, data))
  ipcMain.handle('projects:update', (_e, id: string, data: any) =>
    ProjectQueries.updateProject(db, id, data))
  ipcMain.handle('projects:remove', (_e, id: string) =>
    ProjectQueries.removeProject(db, id))

  // ---- Tasks ----
  ipcMain.handle('tasks:list-by-project', (_e, projectId: string) =>
    TaskQueries.listTasksByProject(db, projectId))
  ipcMain.handle('tasks:create', (_e, data: any) =>
    TaskQueries.createTask(db, data))
  ipcMain.handle('tasks:update', (_e, id: string, data: any) =>
    TaskQueries.updateTask(db, id, data))
  ipcMain.handle('tasks:remove', (_e, id: string) =>
    TaskQueries.removeTask(db, id))

  // ---- Learning ----
  ipcMain.handle('learning:list-categories', () =>
    LearningQueries.listCategories(db))
  ipcMain.handle('learning:create-category', (_e, data: any) =>
    LearningQueries.createCategory(db, data))
  ipcMain.handle('learning:list-topics', (_e, categoryId?: string) =>
    LearningQueries.listTopics(db, categoryId))
  ipcMain.handle('learning:create-topic', (_e, data: any) =>
    LearningQueries.createTopic(db, data))

  // ---- Sessions ----
  ipcMain.handle('sessions:list-work', (_e, filters?: any) =>
    WorkSessionQueries.listWorkSessions(db, filters))
  ipcMain.handle('sessions:list-learning', (_e, filters?: any) =>
    LearningQueries.listLearningSessions(db, filters))
  ipcMain.handle('sessions:get-work', (_e, id: string) =>
    WorkSessionQueries.getWorkSession(db, id))
  ipcMain.handle('sessions:get-learning', (_e, id: string) =>
    LearningQueries.getLearningSession(db, id))
  ipcMain.handle('sessions:save-review', (_e, id: string, type: string, data: any) => {
    if (type === 'work') return WorkSessionQueries.completeWorkSession(db, id, data)
    return LearningQueries.completeLearningSession(db, id, data)
  })

  // ---- AI ----
  ipcMain.handle('ai:summarize', async (_e, input: any) =>
    aiRegistry.summarize(input))
  ipcMain.handle('ai:generate-report', async (_e, input: any) =>
    aiRegistry.generateReport(input))
  ipcMain.handle('ai:validate-connection', async () =>
    aiRegistry.validateConnection())
  ipcMain.handle('ai:get-settings', () => ({
    activeProvider: SettingsQueries.getSetting(db, 'ai_active_provider') || 'deepseek',
    apiKey: SettingsQueries.getSetting(db, 'ai_api_key') || '',
    baseUrl: SettingsQueries.getSetting(db, 'ai_base_url') || 'https://api.deepseek.com/v1',
    model: SettingsQueries.getSetting(db, 'ai_model') || 'deepseek-chat'
  }))
  ipcMain.handle('ai:save-settings', (_e, settings: any) => {
    if (settings.apiKey) SettingsQueries.setSetting(db, 'ai_api_key', settings.apiKey)
    if (settings.baseUrl) SettingsQueries.setSetting(db, 'ai_base_url', settings.baseUrl)
    if (settings.model) SettingsQueries.setSetting(db, 'ai_model', settings.model)
    if (settings.provider) SettingsQueries.setSetting(db, 'ai_active_provider', settings.provider)
    return { ok: true }
  })

  // ---- Reports ----
  ipcMain.handle('reports:get-daily', (_e, date: string) => {
    const uid = (UserQueries.getFirstUser(db) as any).id
    return ReportQueries.getDailyReport(db, uid, date)
  })
  ipcMain.handle('reports:generate-daily', async (_e, date: string) =>
    reportGenerator.generateDaily(date))
  ipcMain.handle('reports:get-weekly', (_e, year: number, week: number) => {
    const uid = (UserQueries.getFirstUser(db) as any).id
    return ReportQueries.getWeeklyReport(db, uid, year, week)
  })
  ipcMain.handle('reports:generate-weekly', async (_e, year: number, week: number) =>
    reportGenerator.generateWeekly(year, week))
  ipcMain.handle('reports:get-monthly', (_e, year: number, month: number) => {
    const uid = (UserQueries.getFirstUser(db) as any).id
    return ReportQueries.getMonthlyReport(db, uid, year, month)
  })
  ipcMain.handle('reports:generate-monthly', async (_e, year: number, month: number) =>
    reportGenerator.generateMonthly(year, month))
  ipcMain.handle('reports:export-markdown', (_e, reportId: string, type: string) => {
    let report
    if (type === 'daily') report = ReportQueries.getDailyReport(db, reportId, reportId)
    else if (type === 'weekly') report = db.prepare('SELECT * FROM weekly_reports WHERE id = ?').get(reportId)
    else report = db.prepare('SELECT * FROM monthly_reports WHERE id = ?').get(reportId)
    if (!report) return ''
    const data = JSON.parse((report as any).content_json)
    const { exportToMarkdown } = require('./report/export')
    return exportToMarkdown(data, type)
  })

  // ---- Achievements ----
  ipcMain.handle('achievements:list-all', () =>
    AchievementQueries.listAchievements(db))
  ipcMain.handle('achievements:list-unlocked', () => {
    const uid = (UserQueries.getFirstUser(db) as any).id
    return AchievementQueries.getUserAchievements(db, uid)
  })
  ipcMain.handle('achievements:check', () => {
    const uid = (UserQueries.getFirstUser(db) as any).id
    return AchievementQueries.getUnnotifiedAchievements(db, uid)
  })

  // ---- Settings ----
  ipcMain.handle('settings:get', (_e, key: string) =>
    SettingsQueries.getSetting(db, key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    SettingsQueries.setSetting(db, key, value))
  ipcMain.handle('settings:get-all', () =>
    SettingsQueries.getAllSettings(db))

  // ---- Window ----
  ipcMain.handle('window:open-gui', () => createGuiWindow())
  ipcMain.handle('window:minimize-pulsecore', () => {
    const wins = BrowserWindow.getAllWindows()
    const pulseCoreWin = wins.find(w => w.isAlwaysOnTop())
    if (pulseCoreWin) pulseCoreWin.minimize()
  })
  ipcMain.handle('window:close-gui', () => {
    const guiWin = getGuiWindow()
    if (guiWin) guiWin.close()
  })
  ipcMain.handle('window:drag', (_e, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (win && win.isAlwaysOnTop()) {
      const [x, y] = win.getPosition()
      win.setPosition(x + dx, y + dy)
    }
  })

  // ---- App ----
  ipcMain.handle('app:get-mode', () =>
    SettingsQueries.getSetting(db, 'app_mode') || 'solo')
  ipcMain.handle('app:set-mode', (_e, mode: string) => {
    SettingsQueries.setSetting(db, 'app_mode', mode)
    return mode
  })
  ipcMain.handle('app:quit', () => {
    const { app } = require('electron')
    app.quit()
  })
}
