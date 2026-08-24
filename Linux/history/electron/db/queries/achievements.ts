import Database from 'better-sqlite3'
import { generateId } from '../../utils/id'

export function listAchievements(db: Database.Database) {
  return db.prepare(`SELECT * FROM achievements ORDER BY category, key`).all()
}

export function getUserAchievements(db: Database.Database, userId: string) {
  return db.prepare(`
    SELECT a.*, ua.unlocked_at, ua.notified
    FROM achievements a LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
    ORDER BY a.category, a.key
  `).all(userId)
}

export function unlockAchievement(db: Database.Database, userId: string, achievementId: string) {
  const existing = db.prepare(`SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?`).get(userId, achievementId)
  if (existing) return null
  const id = generateId()
  db.prepare(`INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (?, ?, ?)`).run(id, userId, achievementId)
  return db.prepare(`SELECT * FROM achievements WHERE id = ?`).get(achievementId)
}

export function markAchievementNotified(db: Database.Database, userId: string, achievementId: string) {
  db.prepare(`UPDATE user_achievements SET notified = 1 WHERE user_id = ? AND achievement_id = ?`).run(userId, achievementId)
}

export function getUnnotifiedAchievements(db: Database.Database, userId: string) {
  return db.prepare(`
    SELECT a.* FROM achievements a JOIN user_achievements ua ON a.id = ua.achievement_id
    WHERE ua.user_id = ? AND ua.notified = 0
  `).all(userId)
}
