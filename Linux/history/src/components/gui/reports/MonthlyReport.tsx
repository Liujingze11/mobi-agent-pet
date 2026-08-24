import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'

export default function MonthlyReport() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadReport = async () => {
    const existing = await api.reports.getMonthly(year, month)
    if (existing) setReport(JSON.parse(existing.content_json))
    else setReport(null)
  }

  const generateReport = async () => {
    setLoading(true)
    try {
      const result = await api.reports.generateMonthly(year, month)
      setReport(result)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadReport() }, [year, month])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">📈 月报 Monthly Pulse</h2>
      <div className="flex gap-2 items-center">
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700 w-24" />
        <span className="text-slate-400">年</span>
        <input type="number" value={month} onChange={e => setMonth(Number(e.target.value))} min={1} max={12}
          className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700 w-20" />
        <span className="text-slate-400">月</span>
        <button onClick={loadReport} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">查看</button>
        <button onClick={generateReport} disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
          {loading ? '生成中...' : '🤖 生成月报'}
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
          {report.monthSummary && (
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2">AI 综述</div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap">{report.monthSummary}</div>
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
