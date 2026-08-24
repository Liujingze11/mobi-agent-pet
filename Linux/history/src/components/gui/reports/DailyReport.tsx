import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'

export default function DailyReport() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadReport = async () => {
    const existing = await api.reports.getDaily(date)
    if (existing) {
      setReport(JSON.parse(existing.content_json))
    } else {
      setReport(null)
    }
  }

  const generateReport = async () => {
    setLoading(true)
    try {
      const result = await api.reports.generateDaily(date)
      setReport(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [date])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">📄 日报 Daily Pulse</h2>
      </div>

      <div className="flex gap-2 items-center">
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setReport(null) }}
          className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-700" />
        <button onClick={loadReport} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">查看</button>
        <button onClick={generateReport} disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
          {loading ? '生成中...' : '🤖 生成日报'}
        </button>
      </div>

      {report && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="研发" value={`${report.totalWorkMinutes}m`} />
            <Stat label="学习" value={`${report.totalLearningMinutes}m`} />
            <Stat label="Sessions" value={String(report.sessionCount)} />
            <Stat label="连续天数" value={`${report.streakDays} 天`} />
          </div>

          {report.aiSummary && (
            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2">AI 综述</div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap">{report.aiSummary}</div>
            </div>
          )}

          {report.projectBreakdown?.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2">项目详情</div>
              {report.projectBreakdown.map((p: any, i: number) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span>{p.projectName}</span>
                  <span className="text-slate-400">{p.minutes}m</span>
                </div>
              ))}
            </div>
          )}

          {report.learningBreakdown?.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2">学习详情</div>
              {report.learningBreakdown.map((l: any, i: number) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span>{l.categoryName} / {l.topicName}</span>
                  <span className="text-slate-400">{l.minutes}m</span>
                </div>
              ))}
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
