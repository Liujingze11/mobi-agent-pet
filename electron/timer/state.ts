import { TimerState, TimerStatus, SessionType } from './types'

const initialState: TimerState = {
  status: 'idle',
  sessionType: null,
  currentSessionId: null,
  projectId: null,
  taskId: null,
  topicId: null,
  startTime: null,
  pausedAt: null,
  accumulatedPauseMs: 0
}

export class TimerStateManager {
  private state: TimerState = { ...initialState }

  getState(): TimerState {
    return { ...this.state }
  }

  transition(status: TimerStatus, extra?: Partial<TimerState>): TimerState {
    this.state = { ...this.state, ...extra, status }
    return this.getState()
  }

  setIdle(): TimerState {
    this.state = { ...initialState }
    return this.getState()
  }

  setStart(sessionType: SessionType, sessionId: string, extra: {
    projectId?: string; taskId?: string; topicId?: string
  }): TimerState {
    this.state = {
      ...initialState,
      status: sessionType === 'work' ? 'working' : 'learning',
      sessionType,
      currentSessionId: sessionId,
      projectId: extra.projectId || null,
      taskId: extra.taskId || null,
      topicId: extra.topicId || null,
      startTime: new Date().toISOString(),
      pausedAt: null,
      accumulatedPauseMs: 0
    }
    return this.getState()
  }

  setPause(): TimerState {
    return this.transition('paused', { pausedAt: new Date().toISOString() })
  }

  setResume(): TimerState {
    if (this.state.pausedAt) {
      const pauseMs = Date.now() - new Date(this.state.pausedAt).getTime()
      this.state.accumulatedPauseMs += pauseMs
    }
    this.state.pausedAt = null
    const prevStatus: TimerStatus = this.state.sessionType === 'learning' ? 'learning' : 'working'
    return this.transition(prevStatus)
  }

  setDeepFocus(): TimerState {
    return this.transition('deep_focus')
  }

  exitDeepFocus(): TimerState {
    const prevStatus: TimerStatus = this.state.sessionType === 'learning' ? 'learning' : 'working'
    return this.transition(prevStatus)
  }

  restore(state: TimerState): void {
    this.state = { ...state }
  }

  getElapsedMs(): number {
    if (!this.state.startTime) return 0
    const now = Date.now()
    const startMs = new Date(this.state.startTime).getTime()
    return now - startMs - this.state.accumulatedPauseMs
  }

  validateTransition(from: TimerStatus, to: string): boolean {
    const allowed: Record<TimerStatus, string[]> = {
      idle: ['working', 'learning'],
      working: ['paused', 'deep_focus', 'idle'],
      learning: ['paused', 'idle'],
      deep_focus: ['working', 'paused', 'idle'],
      paused: ['working', 'learning', 'idle']
    }
    return allowed[from]?.includes(to) ?? false
  }
}
