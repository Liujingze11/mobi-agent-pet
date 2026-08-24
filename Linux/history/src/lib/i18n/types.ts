export interface TranslationMap {
  app: { name: string; version: string }
  languageGate: { title: string; subtitle: string }
  pulsecore: {
    status: Record<string, string>
    statusDot: Record<string, string>
    forms: Record<string, string>
    quickPanel: {
      startWork: string; startLearning: string; openGui: string
      pause: string; resume: string; stop: string
      selectProject: string; selectTask: string; selectTopic: string
      back: string; start: string; formsLabel: string; close: string
    }
    review: {
      workTitle: string; learningTitle: string; duration: string
      completed: string; problems: string; solutions: string; nextSteps: string
      learningContent: string; gains: string; questions: string
      skip: string; aiSave: string; aiSummarizing: string; inputPlaceholder: string
    }
  }
  gui: {
    sidebar: Record<string, string>
    overview: {
      greeting: Record<string, string>
      todayWork: string; todayLearning: string; sessionCount: string
      todayCompleted: string; weeklyTrend: string; noData: string
    }
    projects: {
      title: string; newProject: string; importFolder: string
      selectFolder: string; aiScan: string; aiScanning: string; aiScanDone: string
      aiScanFailed: string; projectName: string; description: string
      create: string; cancel: string; noProjects: string
      active: string; completed: string; archived: string; archive: string; noDescription: string
    }
    tasks: { title: string; newTask: string; taskName: string; priority: string; noTasks: string }
    knowledge: { title: string; allTopics: string; categoryLabel: string; topicLabel: string; newCategory: string; newTopic: string; noData: string }
    sessions: {
      title: string; workTab: string; learningTab: string
      date: string; project: string; topic: string; start: string; end: string
      duration: string; status: string
      statusCompleted: string; statusPaused: string; statusActive: string; noData: string
    }
    reports: {
      dailyTitle: string; weeklyTitle: string; monthlyTitle: string
      view: string; generateDaily: string; generateWeekly: string; generateMonthly: string
      generating: string; workLabel: string; learningLabel: string
      sessions: string; streakDays: string; activeDays: string; avgWorkPerDay: string
      aiSummary: string; projectDetails: string; learningDetails: string
      year: string; week: string; month: string; weekPrefix: string; weekSuffix: string
    }
    achievements: { title: string; unlocked: string; locked: string; noData: string }
    settings: {
      title: string; aiSettings: string
      provider: string; apiKey: string; baseUrl: string; model: string
      save: string; testConnection: string; testing: string; saved: string
      connectionSuccess: string; connectionFailed: string
      language: string; languageLabel: string; general: string
      generalPlaceholder: string; dataPath: string
    }
    pulseBar: {
      idle: string; working: string; learning: string; deepFocus: string; paused: string
      workLabel: string; learningLabel: string
      startWork: string; startLearning: string
      selectProject: string; selectTask: string; selectTopic: string
      pause: string; resume: string; stop: string; start: string
    }
  }
  tray: { startWork: string; startLearning: string; openGui: string; quit: string; tooltip: string }
  contextMenu: { startWork: string; startLearning: string; openGui: string; quit: string }
  seed: {
    defaultUser: string; defaultCompany: string; defaultCompanyDesc: string
    categories: Array<{ name: string; description: string }>
    achievements: Array<{ name: string; description: string }>
  }
  ai: Record<string, string>
}
