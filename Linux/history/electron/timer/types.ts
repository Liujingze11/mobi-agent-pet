export type TimerStatus = 'idle' | 'working' | 'learning' | 'deep_focus' | 'paused'
export type SessionType = 'work' | 'learning'

export interface TimerState {
  status: TimerStatus
  sessionType: SessionType | null
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

export interface SessionResult {
  sessionId: string
  sessionType: SessionType
  projectId?: string
  taskId?: string
  topicId?: string
  startTime: string
  endTime: string
  effectiveSeconds: number
  pausedSeconds: number
}

export interface DailyStats {
  workSeconds: number
  learningSeconds: number
  sessionCount: number
}
