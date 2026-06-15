import { useState } from 'react'
import { api } from '../../../lib/ipc'

function getCurrentWeek() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = start.getUTCDay() || 7
  start.setUTCDate(start.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((start.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: start.getUTCFullYear(), week }
}

export default function WeeklyReport() {
  const { year: cy, week: cw } = getCurrentWeek()
  const [year, setYear] = useState(cy)
  const [week, setWeek] = useState(cw)
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadReport = async () => {
    const existing = await api.reports.getWeekly(year, week)
    if (existing) setReport(JSON.parse(existing.content_json))
    else setReport(null)
  }

  const generateReport = async () => {
    setLoading(true)
    try {
      const result = await api.reports.generateWeekly(year, week)
      setReport(result)
    } finally { setLoading(false) }
  }

  useState(() => { loadReport() })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">📅 周报 Weekly Pulse</h2>
      <div className="flex gap-2 items-center">
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700 w-24" placeholder="年" />
        <span className="text-slate-400">年第</span>
        <input type="number" value={week} onChange={e => setWeek(Number(e.target.value))}
          className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700 w-20" placeholder="周" />
        <span className="text-slate-400">周</span>
        <button onClick={loadReport} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">查看</button>
        <button onClick={generateReport} disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
          {loading ? '生成中...' : '🤖 生成周报'}
        </button>
      </div>

      {report && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="研发" value={`${report.totalWorkMinutes}m`} />
            <Stat label="学习" value={`${report.totalLearningMinutes}m`} />
            <Stat label="活跃天数" value={`${report.activeDays}`} />
            <Stat label="日均研发" value={`${report.avgWorkPerDay}m`} />
          </div>
          {report.weekSummary && (
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2">AI 综述</div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap">{report.weekSummary}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
