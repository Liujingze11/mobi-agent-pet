import { ipcMain, BrowserWindow, dialog } from 'electron'
import { getDatabase } from './db/connection'
import fs from 'node:fs'
import path from 'node:path'
import { timerEngine, aiRegistry, reportGenerator } from './main'
import * as ProjectQueries from './db/queries/projects'
import * as TaskQueries from './db/queries/tasks'
import * as WorkSessionQueries from './db/queries/work-sessions'
import * as LearningQueries from './db/queries/learning'
import * as ReportQueries from './db/queries/reports'
import * as AchievementQueries from './db/queries/achievements'
import * as SettingsQueries from './db/queries/settings'
import * as UserQueries from './db/queries/users'
import { createGuiWindow, getGuiWindow, showPulseCore, hidePulseCore, togglePulseCore, getPulseCoreWindow } from './windows'
import { exportToMarkdown } from './report/export'

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

  // ---- Dialog ----
  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ---- Project Tools (Folder Scan + AI) ----
  ipcMain.handle('project:scan-folder', async (_e, folderPath: string) => {
    const files: Record<string, string> = {}
    const keyFiles = ['package.json', 'README.md', 'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml', '.git/config']
    for (const f of keyFiles) {
      const fp = path.join(folderPath, f)
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, 'utf-8')
        // 限制大小
        files[f] = content.slice(0, 3000)
      }
    }

    const folderName = path.basename(folderPath)

    // 快速从 package.json 提取信息
    let pkgInfo: any = {}
    if (files['package.json']) {
      try { pkgInfo = JSON.parse(files['package.json']) } catch {}
    }

    // 调用 AI 生成项目描述
    let aiResult = { name: folderName, description: '', techStack: '', color: '#6366f1' }
    try {
      const summary = await aiRegistry.summarize({
        type: 'work',
        projectName: folderName,
        rawNotes: `请分析以下项目文件，生成项目描述和技术栈摘要。

文件夹名: ${folderName}
${pkgInfo.name ? `package.json name: ${pkgInfo.name}` : ''}
${pkgInfo.description ? `package.json description: ${pkgInfo.description}` : ''}
${Object.keys(files).join(', ') ? `包含文件: ${Object.keys(files).join(', ')}` : ''}

README.md 摘要:
${files['README.md']?.slice(0, 1500) || '无'}

package.json:
${files['package.json']?.slice(0, 1500) || '无'}

请输出JSON:
{
  "completed_work": ["项目名建议"],
  "problems": [],
  "solutions": [],
  "knowledge_gained": ["技术栈"],
  "next_steps": [],
  "tags": ["标签"],
  "summary": "一段话项目描述",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
        durationMinutes: 0,
        userAnswers: {}
      })
      aiResult.name = summary.completedWork?.[0] || pkgInfo.name || folderName
      aiResult.description = summary.summary || pkgInfo.description || ''
      aiResult.techStack = summary.knowledgeGained?.join(', ') || Object.keys(pkgInfo.dependencies || {}).slice(0, 8).join(', ')
      // 根据技术栈选颜色
      const ts = aiResult.techStack.toLowerCase()
      if (ts.includes('react') || ts.includes('vue')) aiResult.color = '#3b82f6'
      else if (ts.includes('python') || ts.includes('django') || ts.includes('flask')) aiResult.color = '#22c55e'
      else if (ts.includes('rust') || ts.includes('cargo')) aiResult.color = '#f59e0b'
      else if (ts.includes('go')) aiResult.color = '#06b6d4'
    } catch (err) {
      // AI 失败时用基础信息
      aiResult.name = pkgInfo.name || folderName
      aiResult.description = pkgInfo.description || `项目文件夹: ${folderName}`
      aiResult.techStack = Object.keys(pkgInfo.dependencies || {}).slice(0, 6).join(', ')
    }

    return { ...aiResult, folderName, folderPath }
  })

  // ---- Tasks ----
  ipcMain.handle('tasks:list-by-project', (_e, projectId: string) =>
    TaskQueries.listTasksByProject(db, projectId))
  ipcMain.handle('tasks:create', (_e, data: any) =>
    TaskQueries.createTask(db, data))
  ipcMain.handle('tasks:update', (_e, id: string, data: any) =>
    TaskQueries.updateTask(db, id, data))
  ipcMain.handle('tasks:remove', (_e, id: string) =>
    TaskQueries.removeTask(db, id))
  ipcMain.handle('tasks:list-main', (_e, projectId: string) =>
    TaskQueries.listMainTasks(db, projectId))
  ipcMain.handle('tasks:list-subtasks', (_e, parentId: string) =>
    TaskQueries.listSubtasks(db, parentId))
  ipcMain.handle('tasks:create-subtask', (_e, data: any) =>
    TaskQueries.createSubtask(db, data))
  ipcMain.handle('tasks:toggle-subtask', (_e, id: string) =>
    TaskQueries.toggleSubtask(db, id))

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
  ipcMain.handle('app:has-api-key', () => {
    const key = SettingsQueries.getSetting(db, 'ai_api_key')
    return !!key && key.length > 0
  })
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
  ipcMain.handle('reports:refresh-daily', async (_e, date: string) =>
    reportGenerator.generateDaily(date))
  ipcMain.handle('reports:refresh-weekly', async (_e, year: number, week: number) =>
    reportGenerator.generateWeekly(year, week))
  ipcMain.handle('reports:refresh-monthly', async (_e, year: number, month: number) =>
    reportGenerator.generateMonthly(year, month))
  ipcMain.handle('reports:export-markdown', (_e, reportId: string, type: string) => {
    let report
    if (type === 'daily') report = db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(reportId)
    else if (type === 'weekly') report = db.prepare('SELECT * FROM weekly_reports WHERE id = ?').get(reportId)
    else report = db.prepare('SELECT * FROM monthly_reports WHERE id = ?').get(reportId)
    if (!report) return ''
    const data = JSON.parse((report as any).content_json)
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
  ipcMain.handle('window:close-gui', () => {
    const guiWin = getGuiWindow()
    if (guiWin) guiWin.close()
  })
  ipcMain.handle('window:show-pulsecore', () => showPulseCore())
  ipcMain.handle('window:hide-pulsecore', () => hidePulseCore())
  ipcMain.handle('window:toggle-pulsecore', () => togglePulseCore())
  ipcMain.handle('window:is-pulsecore-visible', () => {
    const w = getPulseCoreWindow()
    return w ? w.isVisible() : false
  })
  ipcMain.handle('window:drag', (_e, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (win && win.isAlwaysOnTop()) {
      const [x, y] = win.getPosition()
      win.setPosition(x + dx, y + dy)
    }
  })
  ipcMain.handle('window:resize', (_e, scale: number) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (win && win.isAlwaysOnTop()) {
      const baseW = 180, baseH = 220
      const s = Math.max(0.6, Math.min(2, scale))
      const [x, y] = win.getPosition()
      win.setBounds({ x, y, width: Math.round(baseW * s), height: Math.round(baseH * s) })
    }
  })

  // ---- App ----
  ipcMain.handle('app:get-mode', () =>
    SettingsQueries.getSetting(db, 'app_mode') || 'solo')
  ipcMain.handle('app:set-mode', (_e, mode: string) => {
    SettingsQueries.setSetting(db, 'app_mode', mode)
    return mode
  })
  ipcMain.handle('app:onboarding-complete', () => {
    // 首次引导完成后显示 PulseCore
    showPulseCore()
  })
  ipcMain.handle('app:quit', () => {
    const { app } = require('electron')
    app.quit()
  })
}
