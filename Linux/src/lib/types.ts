// ============================================================
// 共享类型定义 (Renderer Process)
// ============================================================

export type TimerStatus = 'idle' | 'working' | 'learning' | 'deep_focus' | 'paused'

export interface TimerState {
  status: TimerStatus
  sessionType: 'work' | 'learning' | null
  currentSessionId: string | null
  projectId: string | null
  taskId: string | null
  topicId: string | null
  startTime: string | null
  pausedAt: string | null
  accumulatedPauseMs: number
}

export interface TickPayload {
  status: TimerStatus
  elapsedMs: number
  effectiveMs: number
  todayWorkMinutes: number
  todayLearningMinutes: number
}

export interface DailyStats {
  workSeconds: number
  learningSeconds: number
  sessionCount: number
}

// ============================================================
// Window API 类型声明
// ============================================================

declare global {
  interface Window {
    electronAPI: {
      timer: {
        startWork: (projectId: string, taskId?: string) => Promise<TimerState>
        startLearning: (topicId: string) => Promise<TimerState>
        pause: () => Promise<TimerState>
        resume: () => Promise<TimerState>
        stop: () => Promise<any>
        getState: () => Promise<TimerState>
        getTodayStats: () => Promise<DailyStats>
        onTick: (cb: (p: TickPayload) => void) => () => void
        onStateChange: (cb: (s: TimerState) => void) => () => void
      }
      projects: {
        list: (companyId?: string) => Promise<any[]>
        create: (d: any) => Promise<any>
        update: (id: string, d: any) => Promise<any>
        remove: (id: string) => Promise<any>
      }
      dialog: {
        openFolder: () => Promise<string | null>
      }
      projectTools: {
        scanFolder: (folderPath: string) => Promise<{ name: string; description: string; techStack: string; color: string; folderName: string; folderPath: string }>
      }
      tasks: {
        listByProject: (projectId: string) => Promise<any[]>
        listMain: (projectId: string) => Promise<any[]>
        listSubtasks: (parentId: string) => Promise<any[]>
        create: (d: any) => Promise<any>
        createSubtask: (d: any) => Promise<any>
        toggleSubtask: (id: string) => Promise<any>
        update: (id: string, d: any) => Promise<any>
        remove: (id: string) => Promise<any>
      }
      learning: {
        listCategories: () => Promise<any[]>
        createCategory: (d: any) => Promise<any>
        listTopics: (categoryId?: string) => Promise<any[]>
        createTopic: (d: any) => Promise<any>
      }
      sessions: {
        listWork: (f?: any) => Promise<any[]>
        listLearning: (f?: any) => Promise<any[]>
        saveReview: (id: string, type: string, d: any) => Promise<any>
      }
      ai: {
        summarize: (i: any) => Promise<any>
        generateReport: (i: any) => Promise<any>
        validateConnection: () => Promise<{ ok: boolean; error?: string }>
        getSettings: () => Promise<any>
        saveSettings: (s: any) => Promise<any>
      }
      hasApiKey: () => Promise<boolean>
      reports: {
        getDaily: (d: string) => Promise<any>
        generateDaily: (d: string) => Promise<any>
        refreshDaily: (d: string) => Promise<any>
        getWeekly: (y: number, w: number) => Promise<any>
        generateWeekly: (y: number, w: number) => Promise<any>
        refreshWeekly: (y: number, w: number) => Promise<any>
        getMonthly: (y: number, m: number) => Promise<any>
        generateMonthly: (y: number, m: number) => Promise<any>
        refreshMonthly: (y: number, m: number) => Promise<any>
        exportMarkdown: (id: string, type: string) => Promise<string>
      }
      achievements: {
        listAll: () => Promise<any[]>
        listUnlocked: () => Promise<any[]>
        check: () => Promise<any[]>
      }
      settings: {
        get: (k: string) => Promise<string | undefined>
        set: (k: string, v: string) => Promise<void>
        getAll: () => Promise<any[]>
      }
      window: {
        openGui: () => Promise<void>
        closeGui: () => Promise<void>
        showPulseCore: () => Promise<void>
        hidePulseCore: () => Promise<void>
        togglePulseCore: () => Promise<boolean>
        isPulseCoreVisible: () => Promise<boolean>
        drag: (dx: number, dy: number) => Promise<void>
        resize: (scale: number) => Promise<void>
      }
      app: {
        getMode: () => Promise<string>
        setMode: (m: string) => Promise<string>
        onboardingComplete: () => Promise<void>
        quit: () => Promise<void>
      }
    }
  }
}

export {}
