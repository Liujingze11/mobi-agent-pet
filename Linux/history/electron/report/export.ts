export function exportToMarkdown(data: any, type: string): string {
  let md = ''
  if (type === 'daily') {
    md = `# 📄 DevPulse 日报 — ${data.date}\n\n`
    md += `- ⏱ 研发: ${data.totalWorkMinutes}m | 学习: ${data.totalLearningMinutes}m\n`
    md += `- 📊 Session 数: ${data.sessionCount} | 连续: ${data.streakDays} 天\n\n`
    if (data.aiSummary) md += `## 今日综述\n\n${data.aiSummary}\n\n`
    if (data.projectBreakdown?.length) {
      md += `## 项目详情\n\n`
      for (const p of data.projectBreakdown) {
        md += `- **${p.projectName}**: ${p.minutes}m\n`
      }
    }
  } else if (type === 'weekly') {
    md = `# 📅 DevPulse 周报 — ${data.year} W${data.week}\n\n`
    md += `- 总研发: ${data.totalWorkMinutes}m | 总学习: ${data.totalLearningMinutes}m\n`
    md += `- 活跃天数: ${data.activeDays}\n\n`
    if (data.weekSummary) md += `${data.weekSummary}\n\n`
  } else if (type === 'monthly') {
    md = `# 📈 DevPulse 月报 — ${data.year}/${data.month}\n\n`
    md += `- 总研发: ${data.totalWorkMinutes}m | 总学习: ${data.totalLearningMinutes}m\n\n`
    if (data.monthSummary) md += `${data.monthSummary}\n\n`
  }
  return md
}
