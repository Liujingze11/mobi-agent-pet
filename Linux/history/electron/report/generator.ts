import Database from 'better-sqlite3'
import { AIProviderRegistry } from '../ai/registry'
import { generateDailyReport } from './daily'
import { generateWeeklyReport } from './weekly'
import { generateMonthlyReport } from './monthly'
import { getTodayDate, getISOWeek } from '../utils/time'
import { getFirstUser } from '../db/queries/users'

export class ReportGenerator {
  private db: Database.Database
  private aiRegistry: AIProviderRegistry

  constructor(db: Database.Database, aiRegistry: AIProviderRegistry) {
    this.db = db
    this.aiRegistry = aiRegistry
  }

  getUserId(): string {
    const user = getFirstUser(this.db) as any
    if (!user) throw new Error('No user found')
    return user.id
  }

  async generateDaily(date?: string) {
    return generateDailyReport(this.db, this.aiRegistry, this.getUserId(), date || getTodayDate())
  }

  async generateWeekly(year?: number, week?: number) {
    const now = getISOWeek(new Date())
    return generateWeeklyReport(this.db, this.aiRegistry, this.getUserId(), year || now.year, week || now.week)
  }

  async generateMonthly(year?: number, month?: number) {
    const now = new Date()
    return generateMonthlyReport(this.db, this.aiRegistry, this.getUserId(), year || now.getFullYear(), month || (now.getMonth() + 1))
  }

  async updateDailyStats(date: string) {
    return generateDailyReport(this.db, this.aiRegistry, this.getUserId(), date, true)
  }
}
