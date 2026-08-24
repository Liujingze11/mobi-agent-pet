import type { TranslationMap } from './types'

export const zhCN: TranslationMap = {
  app: { name: 'DevPulse AI', version: 'v0.1.0 MVP' },
  languageGate: { title: '欢迎使用 DevPulse AI', subtitle: '请选择语言 / Choose your language' },
  pulsecore: {
    status: { idle: '空闲', working: '● 工作中', learning: '● 学习中', deepFocus: '◉ 深度专注', paused: '◌ 已暂停' },
    statusDot: { idle: '空闲', working: '工作中', learning: '学习中', deepFocus: '深度专注', paused: '已暂停' },
    forms: { heartbeat: '心跳', energyCore: '能量核心', pulseRing: '脉冲光环', hexCrystal: '六棱晶核', dataStream: '数据流' },
    quickPanel: {
      startWork: '💼 开始工作', startLearning: '📚 开始学习', openGui: '📊 打开管理面板',
      pause: '⏸ 暂停', resume: '▶ 继续', stop: '⏹ 结束',
      selectProject: '选择项目...', selectTask: '选择任务（可选）...', selectTopic: '选择知识主题...',
      back: '返回', start: '开始', formsLabel: 'PulseCore 形态', close: '✕',
    },
    review: {
      workTitle: '📝 本次工作复盘', learningTitle: '📝 本次学习复盘', duration: '时长',
      completed: '这段时间完成了什么？', problems: '遇到了什么问题？',
      solutions: '解决了什么？', nextSteps: '下一步准备做什么？',
      learningContent: '学习了什么内容？', gains: '学习收获', questions: '遇到的疑问',
      skip: '跳过', aiSave: '🤖 AI 总结并保存', aiSummarizing: 'AI 总结中...', inputPlaceholder: '输入...',
    },
  },
  gui: {
    sidebar: {
      workbench: '工作台',
      overview: '概览', projects: '项目', tasks: '任务',
      knowledge: '知识库', sessions: '记录',
      dailyPulse: '日报', weeklyPulse: '周报', monthlyPulse: '月报',
      achievements: '成就', settings: '设置',
    },
    overview: {
      greeting: { night: '🌙 夜深了', morning: '🌅 早上好', forenoon: '☀️ 上午好', noon: '👋 中午好', afternoon: '☀️ 下午好', evening: '🌆 晚上好' },
      todayWork: '今日研发', todayLearning: '今日学习', sessionCount: '会话数',
      todayCompleted: '今日完成', weeklyTrend: '📊 本周趋势',
      noData: '暂无数据，开始记录后这里会显示趋势图',
    },
    projects: {
      title: '📁 项目管理', newProject: '+ 新建项目', importFolder: '导入项目文件夹',
      selectFolder: '选择文件夹', aiScan: 'AI 自动填写', aiScanning: 'AI 解析中...',
      aiScanDone: '✅ AI 解析完成！技术栈: ', aiScanFailed: '❌ AI 解析失败，请手动填写',
      projectName: '项目名称', description: '项目描述', create: '创建', cancel: '取消',
      noProjects: '暂无项目，点击上方按钮创建', active: '活跃', completed: '已完成', archived: '已归档',
      archive: '归档', noDescription: '无描述',
    },
    tasks: { title: '✅ 任务管理', newTask: '+ 新建任务', taskName: '任务名称', priority: '优先级', noTasks: '暂无任务' },
    knowledge: { title: '📚 知识库', allTopics: '全部主题', categoryLabel: '分类', topicLabel: '知识主题', newCategory: '+ 新建分类', newTopic: '+ 新建主题', noData: '暂无数据' },
    sessions: {
      title: '📝 记录查看', workTab: '工作记录', learningTab: '学习记录',
      date: '日期', project: '项目', topic: '主题', start: '开始', end: '结束', duration: '时长', status: '状态',
      statusCompleted: '已完成', statusPaused: '已暂停', statusActive: '进行中', noData: '暂无记录',
    },
    reports: {
      dailyTitle: '📄 日报', weeklyTitle: '📅 周报', monthlyTitle: '📈 月报',
      view: '查看', generateDaily: '🤖 生成日报', generateWeekly: '🤖 生成周报', generateMonthly: '🤖 生成月报',
      generating: '生成中...', workLabel: '研发', learningLabel: '学习',
      sessions: '会话数', streakDays: '连续天数', activeDays: '活跃天数', avgWorkPerDay: '日均研发',
      aiSummary: 'AI 综述', projectDetails: '项目详情', learningDetails: '学习详情',
      year: '年', week: '周', month: '月', weekPrefix: '年第', weekSuffix: '周',
    },
    achievements: { title: '🏆 成就墙', unlocked: '已解锁', locked: '未解锁', noData: '暂无成就' },
    settings: {
      title: '⚙️ 设置', aiSettings: '🤖 AI 设置',
      provider: '服务商', apiKey: 'API 密钥', baseUrl: '接口地址', model: '模型',
      save: '保存', testConnection: '测试连接', testing: '测试中...', saved: '已保存',
      connectionSuccess: '✅ 连接成功', connectionFailed: '❌ 连接失败',
      language: '🌐 语言', languageLabel: '界面语言',
      general: '💡 通用', generalPlaceholder: '更多设置将在后续版本中添加。',
      dataPath: '数据存储位置：用户目录下的 .config/devpulse-ai/data/devpulse.db',
    },
    pulseBar: {
      idle: '空闲', working: '工作中', learning: '学习中', deepFocus: '深度专注', paused: '已暂停',
      workLabel: '研发', learningLabel: '学习',
      startWork: '开始工作', startLearning: '开始学习',
      selectProject: '选择项目...', selectTask: '选择任务（可选）...', selectTopic: '选择知识主题...',
      pause: '暂停', resume: '继续', stop: '结束', start: '开始',
    },
  },
  tray: {
    startWork: '💼 开始工作', startLearning: '📚 开始学习',
    openGui: '📊 打开管理面板', quit: '❌ 退出 DevPulse AI',
    tooltip: 'DevPulse AI — PulseCore 脉核',
  },
  contextMenu: {
    startWork: '💼 开始工作', startLearning: '📚 开始学习',
    openGui: '📊 打开管理面板', quit: '❌ 退出 DevPulse AI',
  },
  seed: {
    defaultUser: '默认用户', defaultCompany: '个人项目', defaultCompanyDesc: '个人研发项目',
    categories: [
      { name: 'AI', description: '人工智能相关学习' },
      { name: '前端', description: '前端开发技术' },
      { name: '后端', description: '后端开发技术' },
      { name: '数据库', description: '数据库相关学习' },
      { name: 'Linux', description: 'Linux 系统学习' },
      { name: 'Claude Code', description: 'Claude Code 使用技巧' },
      { name: 'DeepSeek', description: 'DeepSeek 相关学习' },
      { name: '论文阅读', description: '学术论文阅读' },
      { name: '公司业务', description: '公司业务知识' },
      { name: '架构设计', description: '系统架构设计' },
    ],
    achievements: [
      { name: '初次记录', description: '完成第一次工作或学习记录' },
      { name: '连续3天', description: '连续3天有记录' },
      { name: '连续7天', description: '连续7天有记录' },
      { name: '月度全勤', description: '连续30天有记录' },
      { name: '研发100小时', description: '累计研发时长达到100小时' },
      { name: '研发500小时', description: '累计研发时长达到500小时' },
      { name: '学习50小时', description: '累计学习时长达到50小时' },
      { name: '完成10次记录', description: '完成10次工作或学习 session' },
      { name: '完成50次记录', description: '完成50次工作或学习 session' },
      { name: '首个项目达成', description: '第一个项目累计工作时长超过1小时' },
      { name: '第一篇周报', description: '生成第一篇周报' },
      { name: 'AI 总结10次', description: '使用 AI 总结功能10次' },
    ],
  },
  ai: {
    workSummarySystem: `你是一个专业的工作总结助手。用户完成了一段工作，现在需要你帮助总结。
请根据用户的复盘内容，提取结构化信息，输出 JSON 格式。

输出 JSON schema:
{
  "completed_work": ["完成内容1", "完成内容2"],
  "problems": ["遇到的问题"],
  "solutions": ["解决方案"],
  "knowledge_gained": ["学到的知识点"],
  "next_steps": ["下一步计划"],
  "tags": ["标签1", "标签2"],
  "summary": "一段话总结",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
    workSummaryUser: '请总结以下研发记录：\n\n项目: {projectName}\n任务: {taskName}\n时长: {durationMinutes} 分钟\n\n用户复盘内容:\n{rawNotes}\n\n完成内容: {completed}\n遇到的问题: {problems}\n解决方案: {solutions}\n下一步计划: {nextSteps}\n\n请根据以上内容生成结构化的总结 JSON。',
    learningSummarySystem: `你是一个专业的学习总结助手。用户完成了一段学习，现在需要你帮助总结。
请根据用户的复盘内容，提取结构化信息，输出 JSON 格式。

输出 JSON schema:
{
  "completed_work": ["完成内容1"],
  "problems": [],
  "solutions": [],
  "knowledge_gained": ["学到的知识点1", "知识点2"],
  "next_steps": [],
  "tags": ["标签1"],
  "summary": "一段话总结",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
    learningSummaryUser: '请总结以下学习记录：\n\n知识主题: {topicName}\n时长: {durationMinutes} 分钟\n\n用户复盘内容:\n{rawNotes}\n\n学习收获: {gains}\n疑问: {questions}\n\n请根据以上内容生成结构化的总结 JSON。',
    reportDailySystem: `你是一个专业的日报生成助手。请根据提供的统计数据生成一份结构清晰的日报。

输出 JSON schema:
{
  "title": "报告标题",
  "sections": [
    { "heading": "章节标题", "body": "Markdown 内容" }
  ]
}

要求：内容简洁务实，突出成果和关键问题，用 Markdown 格式。`,
    reportDailyUser: '请生成今日研发报告：\n\n- 今日研发总时长: {workHours}h {workMins}m\n- 今日学习总时长: {learnHours}h {learnMins}m\n- 项目分布: {projectBreakdown}\n- 学习分布: {topicBreakdown}\n- 完成内容: {completedItems}\n- 遇到的问题: {problems}\n- 解决方案: {solutions}',
    reportWeeklySystem: `你是一个专业的周报生成助手。请根据提供的统计数据生成一份结构清晰的周报。

输出 JSON schema:
{
  "title": "报告标题",
  "sections": [
    { "heading": "章节标题", "body": "Markdown 内容" }
  ]
}

要求：内容简洁务实，突出成果和关键问题，用 Markdown 格式。`,
    reportWeeklyUser: '请生成本周研发报告：\n\n- 本周研发总时长: {workHours}h {workMins}m\n- 本周学习总时长: {learnHours}h {learnMins}m\n- 项目分布: {projectBreakdown}\n- 学习分布: {topicBreakdown}\n- 完成内容: {completedItems}\n- 遇到的问题: {problems}\n- 解决方案: {solutions}\n{previousReport}',
    reportMonthlySystem: `你是一个专业的月报生成助手。请根据提供的统计数据生成一份结构清晰的月报。

输出 JSON schema:
{
  "title": "报告标题",
  "sections": [
    { "heading": "章节标题", "body": "Markdown 内容" }
  ]
}

要求：内容简洁务实，突出成果和关键问题，用 Markdown 格式。`,
    reportMonthlyUser: '请生成本月研发报告：\n\n- 本月研发总时长: {workHours}h {workMins}m\n- 本月学习总时长: {learnHours}h {learnMins}m\n- 项目分布: {projectBreakdown}\n- 学习分布: {topicBreakdown}\n- 完成内容: {completedItems}\n- 遇到的问题: {problems}\n- 解决方案: {solutions}',
    scanProjectUser: `请分析以下项目文件，生成项目描述和技术栈摘要。

文件夹名: {folderName}
{packageName}
{packageDescription}
包含文件: {files}

README.md 摘要:
{readme}

package.json:
{packageJson}

请输出JSON:
{
  "completed_work": ["项目名建议"],
  "problems": [],
  "solutions": [],
  "knowledge_gained": ["技术栈"],
  "next_steps": [],
  "tags": ["标签"],
  "summary": "一段话项目描述",
  "is_milestone": false,
  "can_generate_achievement": false
}`,
  },
}
