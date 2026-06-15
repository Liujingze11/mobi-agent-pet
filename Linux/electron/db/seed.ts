import Database from 'better-sqlite3'
import { generateId } from '../utils/id'

export function seedDefaults(db: Database.Database): void {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count
  if (userCount > 0) return

  // 默认用户
  const userId = generateId()
  db.prepare(`INSERT INTO users (id, name) VALUES (?, ?)`).run(userId, '默认用户')

  // 默认公司
  const companyId = generateId()
  db.prepare(`INSERT INTO companies (id, name, description) VALUES (?, ?, ?)`).run(
    companyId, '个人项目', '个人研发项目'
  )
  db.prepare(`INSERT INTO user_companies (user_id, company_id, role) VALUES (?, ?, ?)`).run(
    userId, companyId, 'owner'
  )

  // 默认知识分类
  const defaultCategories = [
    { name: 'AI', icon: '🤖', color: '#8b5cf6', sort: 0 },
    { name: '前端', icon: '🎨', color: '#3b82f6', sort: 1 },
    { name: '后端', icon: '⚙️', color: '#22c55e', sort: 2 },
    { name: '数据库', icon: '🗄️', color: '#f59e0b', sort: 3 },
    { name: 'Linux', icon: '🐧', color: '#ef4444', sort: 4 },
    { name: 'Claude Code', icon: '💻', color: '#6366f1', sort: 5 },
    { name: 'DeepSeek', icon: '🔮', color: '#06b6d4', sort: 6 },
    { name: '论文阅读', icon: '📄', color: '#84cc16', sort: 7 },
    { name: '公司业务', icon: '🏢', color: '#f97316', sort: 8 },
    { name: '架构设计', icon: '🏗️', color: '#a855f7', sort: 9 }
  ]

  const insertCat = db.prepare(
    `INSERT INTO learning_categories (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`
  )
  for (const cat of defaultCategories) {
    insertCat.run(generateId(), cat.name, cat.icon, cat.color, cat.sort)
  }

  // 默认成就
  const defaultAchievements = [
    { key: 'first_session', name: '初次记录', description: '完成第一次工作或学习记录', icon: '🌱', category: 'milestone',
      condition: JSON.stringify({ type: 'session_count', threshold: 1 }) },
    { key: 'streak_3_days', name: '连续3天', description: '连续3天有记录', icon: '🔥', category: 'streak',
      condition: JSON.stringify({ type: 'streak_days', threshold: 3 }) },
    { key: 'streak_7_days', name: '连续7天', description: '连续7天有记录', icon: '🔥', category: 'streak',
      condition: JSON.stringify({ type: 'streak_days', threshold: 7 }) },
    { key: 'streak_30_days', name: '月度全勤', description: '连续30天有记录', icon: '⭐', category: 'streak',
      condition: JSON.stringify({ type: 'streak_days', threshold: 30 }) },
    { key: 'work_100h', name: '研发100小时', description: '累计研发时长达到100小时', icon: '⚡', category: 'volume',
      condition: JSON.stringify({ type: 'total_work_hours', threshold: 100 }) },
    { key: 'work_500h', name: '研发500小时', description: '累计研发时长达到500小时', icon: '💎', category: 'volume',
      condition: JSON.stringify({ type: 'total_work_hours', threshold: 500 }) },
    { key: 'learning_50h', name: '学习50小时', description: '累计学习时长达到50小时', icon: '📚', category: 'volume',
      condition: JSON.stringify({ type: 'total_learning_hours', threshold: 50 }) },
    { key: 'sessions_10', name: '完成10次记录', description: '完成10次工作或学习 session', icon: '🎯', category: 'milestone',
      condition: JSON.stringify({ type: 'session_count', threshold: 10 }) },
    { key: 'sessions_50', name: '完成50次记录', description: '完成50次工作或学习 session', icon: '🎖️', category: 'milestone',
      condition: JSON.stringify({ type: 'session_count', threshold: 50 }) },
    { key: 'first_project_done', name: '首个项目完成', description: '完成第一个项目', icon: '🏁', category: 'special',
      condition: JSON.stringify({ type: 'project_completed', threshold: 1 }) },
    { key: 'first_report', name: '第一篇周报', description: '生成第一篇周报', icon: '📝', category: 'special',
      condition: JSON.stringify({ type: 'weekly_report_count', threshold: 1 }) },
    { key: 'ai_summaries_10', name: 'AI 总结10次', description: '使用 AI 总结功能10次', icon: '🤖', category: 'special',
      condition: JSON.stringify({ type: 'ai_summary_count', threshold: 10 }) }
  ]

  const insertAchievement = db.prepare(
    `INSERT INTO achievements (id, key, name, description, icon, category, condition_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const ach of defaultAchievements) {
    insertAchievement.run(generateId(), ach.key, ach.name, ach.description, ach.icon, ach.category, ach.condition)
  }

  // 默认应用模式
  db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`).run('app_mode', '"solo"')
}
