import Database from 'better-sqlite3'

export type Language = 'zh-CN' | 'en-US'
let current: Language = 'zh-CN'

const msgs: Record<Language, Record<string, string>> = {
  'zh-CN': {
    'tray.startWork': '💼 开始工作', 'tray.startLearning': '📚 开始学习',
    'tray.openGui': '📊 打开管理面板', 'tray.quit': '❌ 退出 DevPulse AI',
    'tray.tooltip': 'DevPulse AI — PulseCore 脉核',
    'tray.showPulse': '🔮 显示 PulseCore', 'tray.hidePulse': '🙈 隐藏 PulseCore',
    'ctx.startWork': '💼 开始工作', 'ctx.startLearning': '📚 开始学习',
    'ctx.openGui': '📊 打开管理面板', 'ctx.quit': '❌ 退出 DevPulse AI',
    'window.title': 'DevPulse AI',
  },
  'en-US': {
    'tray.startWork': '💼 Start Work', 'tray.startLearning': '📚 Start Learning',
    'tray.openGui': '📊 Dashboard', 'tray.quit': '❌ Quit DevPulse AI',
    'tray.tooltip': 'DevPulse AI — PulseCore',
    'tray.showPulse': '🔮 Show PulseCore', 'tray.hidePulse': '🙈 Hide PulseCore',
    'ctx.startWork': '💼 Start Work', 'ctx.startLearning': '📚 Start Learning',
    'ctx.openGui': '📊 Dashboard', 'ctx.quit': '❌ Quit DevPulse AI',
    'window.title': 'DevPulse AI',
  },
}

export function t(key: string): string {
  return msgs[current]?.[key] || key
}

export function getLanguage(): Language { return current }

export function loadLanguage(db: Database.Database): Language {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'language'").get() as any
  if (row?.value === 'zh-CN' || row?.value === 'en-US') current = row.value
  return current
}

export function setLanguage(lang: Language): void { current = lang }

/** 检查是否首次启动（language 设置不存在） */
export function isFirstLaunch(db: Database.Database): boolean {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'language'").get() as any
  return !row
}
