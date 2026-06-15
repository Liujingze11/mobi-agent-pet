import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Timer
  timer: {
    startWork: (projectId: string, taskId?: string) =>
      ipcRenderer.invoke('timer:start-work', projectId, taskId),
    startLearning: (topicId: string) =>
      ipcRenderer.invoke('timer:start-learning', topicId),
    pause: () => ipcRenderer.invoke('timer:pause'),
    resume: () => ipcRenderer.invoke('timer:resume'),
    stop: () => ipcRenderer.invoke('timer:stop'),
    getState: () => ipcRenderer.invoke('timer:get-state'),
    getTodayStats: () => ipcRenderer.invoke('timer:get-today-stats'),
    onTick: (callback: (payload: any) => void) => {
      const handler = (_event: any, payload: any) => callback(payload)
      ipcRenderer.on('timer:tick', handler)
      return () => { ipcRenderer.removeListener('timer:tick', handler) }
    },
    onStateChange: (callback: (state: any) => void) => {
      const handler = (_event: any, state: any) => callback(state)
      ipcRenderer.on('timer:state-change', handler)
      return () => { ipcRenderer.removeListener('timer:state-change', handler) }
    }
  },

  // Projects
  projects: {
    list: (companyId?: string) => ipcRenderer.invoke('projects:list', companyId),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    create: (data: any) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id)
  },

  // Tasks
  tasks: {
    listByProject: (projectId: string) => ipcRenderer.invoke('tasks:list-by-project', projectId),
    create: (data: any) => ipcRenderer.invoke('tasks:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('tasks:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('tasks:remove', id)
  },

  // Learning
  learning: {
    listCategories: () => ipcRenderer.invoke('learning:list-categories'),
    createCategory: (data: any) => ipcRenderer.invoke('learning:create-category', data),
    listTopics: (categoryId?: string) => ipcRenderer.invoke('learning:list-topics', categoryId),
    createTopic: (data: any) => ipcRenderer.invoke('learning:create-topic', data)
  },

  // Sessions
  sessions: {
    listWork: (filters?: any) => ipcRenderer.invoke('sessions:list-work', filters),
    listLearning: (filters?: any) => ipcRenderer.invoke('sessions:list-learning', filters),
    getWork: (id: string) => ipcRenderer.invoke('sessions:get-work', id),
    getLearning: (id: string) => ipcRenderer.invoke('sessions:get-learning', id),
    saveReview: (id: string, type: string, data: any) =>
      ipcRenderer.invoke('sessions:save-review', id, type, data)
  },

  // AI
  ai: {
    summarize: (input: any) => ipcRenderer.invoke('ai:summarize', input),
    generateReport: (input: any) => ipcRenderer.invoke('ai:generate-report', input),
    validateConnection: () => ipcRenderer.invoke('ai:validate-connection'),
    getSettings: () => ipcRenderer.invoke('ai:get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('ai:save-settings', settings)
  },

  // Reports
  reports: {
    getDaily: (date: string) => ipcRenderer.invoke('reports:get-daily', date),
    generateDaily: (date: string) => ipcRenderer.invoke('reports:generate-daily', date),
    getWeekly: (year: number, week: number) => ipcRenderer.invoke('reports:get-weekly', year, week),
    generateWeekly: (year: number, week: number) => ipcRenderer.invoke('reports:generate-weekly', year, week),
    getMonthly: (year: number, month: number) => ipcRenderer.invoke('reports:get-monthly', year, month),
    generateMonthly: (year: number, month: number) => ipcRenderer.invoke('reports:generate-monthly', year, month),
    exportMarkdown: (reportId: string, type: string) => ipcRenderer.invoke('reports:export-markdown', reportId, type)
  },

  // Achievements
  achievements: {
    listAll: () => ipcRenderer.invoke('achievements:list-all'),
    listUnlocked: () => ipcRenderer.invoke('achievements:list-unlocked'),
    check: () => ipcRenderer.invoke('achievements:check')
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all')
  },

  // Window controls
  window: {
    openGui: () => ipcRenderer.invoke('window:open-gui'),
    minimizePulseCore: () => ipcRenderer.invoke('window:minimize-pulsecore'),
    closeGui: () => ipcRenderer.invoke('window:close-gui'),
    drag: (dx: number, dy: number) => ipcRenderer.invoke('window:drag', dx, dy),
    resize: (scale: number) => ipcRenderer.invoke('window:resize', scale)
  },

  // App
  app: {
    getMode: () => ipcRenderer.invoke('app:get-mode'),
    setMode: (mode: string) => ipcRenderer.invoke('app:set-mode', mode),
    quit: () => ipcRenderer.invoke('app:quit')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
