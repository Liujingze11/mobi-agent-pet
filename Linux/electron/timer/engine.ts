import Database from 'better-sqlite3'
import { TimerStateManager } from './state'
import { saveSnapshot, loadSnapshot, clearSnapshot } from './persistence'
import { TimerState, TickPayload, SessionResult, DailyStats } from './types'
import { getFirstUser } from '../db/queries/users'
import { createWorkSession, completeWorkSession } from '../db/queries/work-sessions'
import { createLearningSession, completeLearningSession } from '../db/queries/learning'
import { addProjectSeconds } from '../db/queries/projects'
import { getTodayDate, isWithin24Hours } from '../utils/time'
import { logger } from '../utils/logger'

type TickHandler = (payload: TickPayload) => void
type StateChangeHandler = (state: TimerState) => void

export class TimerEngine {
  private stateManager = new TimerStateManager()
  private tickHandlers: TickHandler[] = []
  private stateChangeHandlers: StateChangeHandler[] = []
  private intervalId: NodeJS.Timeout | null = null
  private snapshotIntervalId: NodeJS.Timeout | null = null
  private db: Database.Database
  private userId: string | null = null

  constructor(db: Database.Database) {
    this.db = db
    const user = getFirstUser(db) as any
    if (user) this.userId = user.id
  }

  onTick(handler: TickHandler): void { this.tickHandlers.push(handler) }
  onStateChange(handler: StateChangeHandler): void { this.stateChangeHandlers.push(handler) }

  private broadcastTick(): void {
    const state = this.stateManager.getState()
    const effectiveMs = this.stateManager.getElapsedMs()
    const todayStats = this.getTodayStats()
    const payload: TickPayload = {
      status: state.status,
      elapsedMs: state.startTime ? Date.now() - new Date(state.startTime).getTime() : 0,
      effectiveMs,
      todayWorkMinutes: todayStats.workSeconds / 60,
      todayLearningMinutes: todayStats.learningSeconds / 60
    }
    this.tickHandlers.forEach(h => h(payload))
  }

  private broadcastStateChange(): void {
    const state = this.stateManager.getState()
    this.stateChangeHandlers.forEach(h => h(state))
  }

  private startTickLoop(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.broadcastTick(), 1000)
    this.snapshotIntervalId = setInterval(() => this.saveSnapshot(), 5000)
  }

  private stopTickLoop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
    if (this.snapshotIntervalId) { clearInterval(this.snapshotIntervalId); this.snapshotIntervalId = null }
  }

  getState(): TimerState { return this.stateManager.getState() }

  getTodayStats(): DailyStats {
    const today = getTodayDate()
    const workRow = this.db.prepare(
      `SELECT COALESCE(SUM(effective_seconds), 0) as total FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
    ).get(this.userId, today) as any
    const learnRow = this.db.prepare(
      `SELECT COALESCE(SUM(effective_seconds), 0) as total FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
    ).get(this.userId, today) as any
    const countRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM (SELECT id FROM work_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed' UNION ALL SELECT id FROM learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed')`
    ).get(this.userId, today, this.userId, today) as any
    return { workSeconds: workRow.total, learningSeconds: learnRow.total, sessionCount: countRow.count }
  }

  startWork(projectId: string, taskId?: string): TimerState {
    if (!this.userId) throw new Error('No user found')
    const session = createWorkSession(this.db, { userId: this.userId, projectId, taskId }) as any
    const state = this.stateManager.setStart('work', session.id, { projectId, taskId })
    this.startTickLoop()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: start work', { projectId, taskId, sessionId: session.id })
    return state
  }

  startLearning(topicId: string): TimerState {
    if (!this.userId) throw new Error('No user found')
    const session = createLearningSession(this.db, { userId: this.userId, topicId }) as any
    const state = this.stateManager.setStart('learning', session.id, { topicId })
    this.startTickLoop()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: start learning', { topicId, sessionId: session.id })
    return state
  }

  pause(): TimerState {
    const current = this.stateManager.getState()
    if (!this.stateManager.validateTransition(current.status, 'paused')) {
      throw new Error(`Cannot pause from status: ${current.status}`)
    }
    const state = this.stateManager.setPause()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: paused')
    return state
  }

  resume(): TimerState {
    const current = this.stateManager.getState()
    if (!this.stateManager.validateTransition(current.status, current.sessionType === 'learning' ? 'learning' : 'working')) {
      throw new Error(`Cannot resume from status: ${current.status}`)
    }
    const state = this.stateManager.setResume()
    this.broadcastStateChange()
    this.saveSnapshot()
    logger.info('Timer: resumed')
    return state
  }

  stop(): SessionResult {
    const state = this.stateManager.getState()
    const effectiveMs = this.stateManager.getElapsedMs()
    const effectiveSeconds = Math.floor(effectiveMs / 1000)
    const pausedSeconds = Math.floor(state.accumulatedPauseMs / 1000)

    this.stopTickLoop()

    let result: SessionResult
    if (state.sessionType === 'work' && state.currentSessionId) {
      completeWorkSession(this.db, state.currentSessionId, { effectiveSeconds })
      addProjectSeconds(this.db, state.projectId!, effectiveSeconds)
      result = {
        sessionId: state.currentSessionId,
        sessionType: 'work',
        projectId: state.projectId!,
        taskId: state.taskId!,
        startTime: state.startTime!,
        endTime: new Date().toISOString(),
        effectiveSeconds,
        pausedSeconds
      }
    } else if (state.sessionType === 'learning' && state.currentSessionId) {
      completeLearningSession(this.db, state.currentSessionId, { effectiveSeconds })
      result = {
        sessionId: state.currentSessionId,
        sessionType: 'learning',
        topicId: state.topicId!,
        startTime: state.startTime!,
        endTime: new Date().toISOString(),
        effectiveSeconds,
        pausedSeconds
      }
    } else {
      throw new Error('No active session to stop')
    }

    this.stateManager.setIdle()
    this.broadcastStateChange()
    clearSnapshot(this.db)
    logger.info('Timer: stopped', result)
    return result
  }

  saveSnapshot(): void {
    if (!this.userId) return
    const state = this.stateManager.getState()
    if (state.status !== 'idle') {
      saveSnapshot(this.db, this.userId, state)
    }
  }

  async recoverFromSnapshot(): Promise<boolean> {
    const snapshot = loadSnapshot(this.db)
    if (!snapshot || snapshot.state.status === 'idle') return false

    if (!isWithin24Hours(snapshot.state.startTime!)) {
      clearSnapshot(this.db)
      logger.info('Timer: expired snapshot cleared')
      return false
    }

    this.userId = snapshot.userId
    this.stateManager.restore(snapshot.state)
    this.startTickLoop()
    this.broadcastStateChange()
    logger.info('Timer: recovered from snapshot', snapshot.state)
    return true
  }
}
