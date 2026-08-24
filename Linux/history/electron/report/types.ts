export interface DailyReportData {
  date: string
  totalWorkMinutes: number
  totalLearningMinutes: number
  sessionCount: number
  streakDays: number
  projectBreakdown: { projectId: string; projectName: string; minutes: number; tasks: { taskName: string; minutes: number }[]; completedItems: string[] }[]
  learningBreakdown: { categoryName: string; topicName: string; minutes: number; gains: string[]; questions: string[] }[]
  aiSummary: string
  highlights: string[]
  problemsBlockers: string[]
  tomorrowPlan: string[]
  timeline: { time: string; type: string; description: string }[]
  createdAt: string
}

export interface WeeklyReportData {
  year: number; week: number
  totalWorkMinutes: number; totalLearningMinutes: number
  activeDays: number; avgWorkPerDay: number; avgLearningPerDay: number
  dailyTrend: { date: string; workMinutes: number; learningMinutes: number }[]
  projectDistribution: { projectName: string; minutes: number; percentage: number; completedTasks: number; totalTasks: number; progress: string }[]
  learningDistribution: { categoryName: string; minutes: number; percentage: number; topicsCount: number }[]
  weekSummary: string; keyAchievements: string[]; blockers: string[]
  knowledgeDeposited: string[]; nextWeekPlan: string[]
  createdAt: string
}

export interface MonthlyReportData {
  year: number; month: number
  totalWorkMinutes: number; totalLearningMinutes: number
  activeDays: number; avgWorkPerDay: number; avgLearningPerDay: number
  weeklyTrend: { week: number; workMinutes: number; learningMinutes: number }[]
  projectDistribution: { projectName: string; minutes: number; percentage: number; progress: string; milestones: string[] }[]
  learningDistribution: { categoryName: string; minutes: number; percentage: number }[]
  monthSummary: string; achievements: string[]; growthAreas: string[]
  reflections: string; nextMonthPlan: string
  heatmap: { date: string; workMinutes: number; learningMinutes: number }[]
  createdAt: string
}
