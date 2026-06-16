import type { TranslationMap } from './types'

export const enUS: TranslationMap = {
  app: { name: 'DevPulse AI', version: 'v0.1.0 MVP' },
  languageGate: { title: 'Welcome to DevPulse AI', subtitle: 'Choose your language / 选择语言' },
  pulsecore: {
    status: { idle: 'Idle', working: '● Working', learning: '● Learning', deepFocus: '◉ Deep Focus', paused: '◌ Paused' },
    statusDot: { idle: 'Idle', working: 'Working', learning: 'Learning', deepFocus: 'Deep Focus', paused: 'Paused' },
    forms: { energyCore: 'Energy Core', pulseRing: 'Pulse Ring', hexCrystal: 'Hex Crystal', dataStream: 'Data Stream' },
    quickPanel: {
      startWork: '💼 Start Work', startLearning: '📚 Start Learning', openGui: '📊 Dashboard',
      pause: '⏸ Pause', resume: '▶ Resume', stop: '⏹ Stop',
      selectProject: 'Select project...', selectTask: 'Select task (optional)...', selectTopic: 'Select topic...',
      back: 'Back', start: 'Start', formsLabel: 'PulseCore Style', close: '✕',
    },
    review: {
      workTitle: '📝 Work Review', learningTitle: '📝 Learning Review', duration: 'Duration',
      completed: 'What did you accomplish?', problems: 'Any problems encountered?',
      solutions: 'What did you solve?', nextSteps: "What's next?",
      learningContent: 'What did you learn?', gains: 'Key takeaways', questions: 'Questions',
      skip: 'Skip', aiSave: '🤖 AI Summarize & Save', aiSummarizing: 'AI summarizing...', inputPlaceholder: 'Type...',
    },
  },
  gui: {
    sidebar: {
      workbench: 'Workbench',
      overview: 'Overview', projects: 'Projects', tasks: 'Tasks',
      knowledge: 'Knowledge', sessions: 'Sessions',
      dailyPulse: 'Daily Pulse', weeklyPulse: 'Weekly Pulse', monthlyPulse: 'Monthly Pulse',
      achievements: 'Achievements', settings: 'Settings',
    },
    overview: {
      greeting: { night: '🌙 Good Night', morning: '🌅 Good Morning', forenoon: '☀️ Good Morning', noon: '👋 Good Afternoon', afternoon: '☀️ Good Afternoon', evening: '🌆 Good Evening' },
      todayWork: "Today's Work", todayLearning: "Today's Learning", sessionCount: 'Sessions',
      todayCompleted: 'Completed Today', weeklyTrend: '📊 Weekly Trend',
      noData: 'No data yet. Start tracking to see trends here.',
    },
    projects: {
      title: '📁 Projects', newProject: '+ New Project', importFolder: 'Import Folder',
      selectFolder: 'Select Folder', aiScan: 'AI Auto-fill', aiScanning: 'AI analyzing...',
      aiScanDone: '✅ AI analysis complete! Tech: ', aiScanFailed: '❌ AI failed, please fill manually',
      projectName: 'Project Name', description: 'Description', create: 'Create', cancel: 'Cancel',
      noProjects: 'No projects yet. Click + New to create.', active: 'Active', completed: 'Completed', archived: 'Archived',
      archive: 'Archive', noDescription: 'No description',
    },
    tasks: { title: '✅ Tasks', newTask: '+ New Task', taskName: 'Task Name', priority: 'Priority', noTasks: 'No tasks yet' },
    knowledge: { title: '📚 Knowledge Base', allTopics: 'All Topics', categoryLabel: 'Categories', topicLabel: 'Topics', newCategory: '+ New Category', newTopic: '+ New Topic', noData: 'No data' },
    sessions: {
      title: '📝 Sessions', workTab: 'Work', learningTab: 'Learning',
      date: 'Date', project: 'Project', topic: 'Topic', start: 'Start', end: 'End', duration: 'Duration', status: 'Status',
      statusCompleted: 'Completed', statusPaused: 'Paused', statusActive: 'Active', noData: 'No sessions yet',
    },
    reports: {
      dailyTitle: '📄 Daily Pulse', weeklyTitle: '📅 Weekly Pulse', monthlyTitle: '📈 Monthly Pulse',
      view: 'View', generateDaily: '🤖 Generate', generateWeekly: '🤖 Generate', generateMonthly: '🤖 Generate',
      generating: 'Generating...', workLabel: 'Work', learningLabel: 'Learning',
      sessions: 'Sessions', streakDays: 'Streak', activeDays: 'Active Days', avgWorkPerDay: 'Avg Work/Day',
      aiSummary: 'AI Summary', projectDetails: 'Project Details', learningDetails: 'Learning Details',
      year: 'Year', week: 'Week', month: 'Month', weekPrefix: 'W', weekSuffix: '',
    },
    achievements: { title: '🏆 Achievements', unlocked: 'Unlocked', locked: 'Locked', noData: 'No achievements yet' },
    settings: {
      title: '⚙️ Settings', aiSettings: '🤖 AI Settings',
      provider: 'Provider', apiKey: 'API Key', baseUrl: 'Base URL', model: 'Model',
      save: 'Save', testConnection: 'Test Connection', testing: 'Testing...', saved: 'Saved',
      connectionSuccess: '✅ Connected', connectionFailed: '❌ Connection failed',
      language: '🌐 Language', languageLabel: 'Interface Language',
      general: '💡 General', generalPlaceholder: 'More settings coming in future versions.',
      dataPath: 'Data location: .config/devpulse-ai/data/devpulse.db',
    },
    pulseBar: {
      idle: 'Idle', working: 'Working', learning: 'Learning', deepFocus: 'Deep Focus', paused: 'Paused',
      workLabel: 'Work', learningLabel: 'Learning',
      startWork: 'Start Work', startLearning: 'Start Learning',
      selectProject: 'Select project...', selectTask: 'Select task (optional)...', selectTopic: 'Select topic...',
      pause: 'Pause', resume: 'Resume', stop: 'Stop', start: 'Start',
    },
  },
  tray: {
    startWork: '💼 Start Work', startLearning: '📚 Start Learning',
    openGui: '📊 Dashboard', quit: '❌ Quit DevPulse AI',
    tooltip: 'DevPulse AI — PulseCore',
  },
  contextMenu: {
    startWork: '💼 Start Work', startLearning: '📚 Start Learning',
    openGui: '📊 Dashboard', quit: '❌ Quit DevPulse AI',
  },
  seed: {
    defaultUser: 'Default User', defaultCompany: 'Personal Projects', defaultCompanyDesc: 'Personal dev projects',
    categories: [
      { name: 'AI', description: 'Artificial Intelligence' },
      { name: 'Frontend', description: 'Frontend Development' },
      { name: 'Backend', description: 'Backend Development' },
      { name: 'Database', description: 'Database Systems' },
      { name: 'Linux', description: 'Linux System' },
      { name: 'Claude Code', description: 'Claude Code Tips' },
      { name: 'DeepSeek', description: 'DeepSeek' },
      { name: 'Paper Reading', description: 'Academic Paper Reading' },
      { name: 'Business', description: 'Business Knowledge' },
      { name: 'Architecture', description: 'System Architecture' },
    ],
    achievements: [
      { name: 'First Record', description: 'Complete your first work or learning session' },
      { name: '3-Day Streak', description: '3 consecutive days with activity' },
      { name: '7-Day Streak', description: '7 consecutive days with activity' },
      { name: 'Monthly Perfect', description: '30 consecutive days with activity' },
      { name: 'Work 100h', description: 'Reach 100 hours of total work time' },
      { name: 'Work 500h', description: 'Reach 500 hours of total work time' },
      { name: 'Learn 50h', description: 'Reach 50 hours of total learning time' },
      { name: '10 Sessions', description: 'Complete 10 work or learning sessions' },
      { name: '50 Sessions', description: 'Complete 50 work or learning sessions' },
      { name: 'First Milestone', description: 'First project reaches 1 hour of work' },
      { name: 'First Weekly Report', description: 'Generate your first weekly report' },
      { name: '10 AI Summaries', description: 'Use AI summarization 10 times' },
    ],
  },
  ai: {
    workSummarySystem: `You are a professional work summary assistant. Extract structured information from the user's review notes.

Output JSON schema:
{
  "completed_work": ["item 1", "item 2"],
  "problems": ["problems encountered"],
  "solutions": ["solutions applied"],
  "knowledge_gained": ["knowledge gained"],
  "next_steps": ["next steps"],
  "tags": ["tag1", "tag2"],
  "summary": "A brief summary paragraph",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
    workSummaryUser: 'Please summarize the following dev session:\n\nProject: {projectName}\nTask: {taskName}\nDuration: {durationMinutes} min\n\nReview notes:\n{rawNotes}\n\nCompleted: {completed}\nProblems: {problems}\nSolutions: {solutions}\nNext steps: {nextSteps}\n\nGenerate a structured JSON summary.',
    learningSummarySystem: `You are a professional learning summary assistant. Extract structured information from the user's review notes.

Output JSON schema:
{
  "completed_work": ["item 1"],
  "problems": [],
  "solutions": [],
  "knowledge_gained": ["knowledge point 1", "knowledge point 2"],
  "next_steps": [],
  "tags": ["tag1"],
  "summary": "A brief summary paragraph",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
    learningSummaryUser: 'Please summarize the following learning session:\n\nTopic: {topicName}\nDuration: {durationMinutes} min\n\nReview notes:\n{rawNotes}\n\nGains: {gains}\nQuestions: {questions}\n\nGenerate a structured JSON summary.',
    reportDailySystem: `You are a professional daily report generator. Generate a well-structured daily report.

Output JSON schema:
{
  "title": "Report title",
  "sections": [
    { "heading": "Section heading", "body": "Markdown content" }
  ]
}

Be concise, highlight achievements and key issues. Use Markdown.`,
    reportDailyUser: 'Generate a daily dev report:\n\n- Work time: {workHours}h {workMins}m\n- Learning time: {learnHours}h {learnMins}m\n- Projects: {projectBreakdown}\n- Learning: {topicBreakdown}\n- Completed: {completedItems}\n- Problems: {problems}\n- Solutions: {solutions}',
    reportWeeklySystem: `You are a professional weekly report generator. Generate a well-structured weekly report.

Output JSON schema:
{
  "title": "Report title",
  "sections": [
    { "heading": "Section heading", "body": "Markdown content" }
  ]
}

Be concise, highlight achievements and key issues. Use Markdown.`,
    reportWeeklyUser: 'Generate a weekly dev report:\n\n- Work time: {workHours}h {workMins}m\n- Learning time: {learnHours}h {learnMins}m\n- Projects: {projectBreakdown}\n- Learning: {topicBreakdown}\n- Completed: {completedItems}\n- Problems: {problems}\n- Solutions: {solutions}\n{previousReport}',
    reportMonthlySystem: `You are a professional monthly report generator. Generate a well-structured monthly report.

Output JSON schema:
{
  "title": "Report title",
  "sections": [
    { "heading": "Section heading", "body": "Markdown content" }
  ]
}

Be concise, highlight achievements and key issues. Use Markdown.`,
    reportMonthlyUser: 'Generate a monthly dev report:\n\n- Work time: {workHours}h {workMins}m\n- Learning time: {learnHours}h {learnMins}m\n- Projects: {projectBreakdown}\n- Learning: {topicBreakdown}\n- Completed: {completedItems}\n- Problems: {problems}\n- Solutions: {solutions}',
    scanProjectUser: `Analyze the following project files and generate a project description and tech stack summary.

Folder: {folderName}
{packageName}
{packageDescription}
Files: {files}

README.md:
{readme}

package.json:
{packageJson}

Output JSON:
{
  "completed_work": ["project name suggestion"],
  "problems": [],
  "solutions": [],
  "knowledge_gained": ["tech stack"],
  "next_steps": [],
  "tags": ["tags"],
  "summary": "brief project description",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
  },
}
