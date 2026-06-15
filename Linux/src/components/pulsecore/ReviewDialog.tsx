import { useState } from 'react'
import { api } from '../../lib/ipc'

interface Props {
  sessionResult: any
  onComplete: () => void
}

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function ReviewDialog({ sessionResult, onComplete }: Props) {
  const isWork = sessionResult.sessionType === 'work'
  const [answers, setAnswers] = useState({
    completed: '', problems: '', solutions: '', nextSteps: '',
    learningContent: '', gains: '', questions: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async (useAI: boolean) => {
    setSaving(true)
    try {
      const rawNotes = Object.values(answers).join('\n')
      if (useAI) {
        const summary = await api.ai.summarize({
          type: sessionResult.sessionType,
          durationMinutes: Math.round(sessionResult.effectiveSeconds / 60),
          rawNotes,
          userAnswers: answers
        })
        await api.sessions.saveReview(sessionResult.sessionId, sessionResult.sessionType, {
          effectiveSeconds: sessionResult.effectiveSeconds,
          rawNotes,
          completedWork: summary.completedWork?.join('; '),
          problems: summary.problems?.join('; '),
          solutions: summary.solutions?.join('; '),
          nextSteps: summary.nextSteps?.join('; '),
          learningContent: summary.knowledgeGained?.join('; '),
          gains: summary.summary,
          questions: ''
        })
      } else {
        await api.sessions.saveReview(sessionResult.sessionId, sessionResult.sessionType, {
          effectiveSeconds: sessionResult.effectiveSeconds,
          rawNotes,
          completedWork: answers.completed,
          problems: answers.problems,
          solutions: answers.solutions,
          nextSteps: answers.nextSteps,
          learningContent: answers.learningContent,
          gains: answers.gains,
          questions: answers.questions
        })
      }
    } finally {
      setSaving(false)
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">
          📝 {isWork ? '本次工作复盘' : '本次学习复盘'}
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          时长: {formatTimer(sessionResult.effectiveSeconds * 1000)}
        </p>

        <div className="space-y-3">
          {isWork ? (
            <>
              <Field label="这段时间完成了什么？" value={answers.completed}
                onChange={v => setAnswers(p => ({ ...p, completed: v }))} />
              <Field label="遇到了什么问题？" value={answers.problems}
                onChange={v => setAnswers(p => ({ ...p, problems: v }))} />
              <Field label="解决了什么？" value={answers.solutions}
                onChange={v => setAnswers(p => ({ ...p, solutions: v }))} />
              <Field label="下一步准备做什么？" value={answers.nextSteps}
                onChange={v => setAnswers(p => ({ ...p, nextSteps: v }))} />
            </>
          ) : (
            <>
              <Field label="学习了什么内容？" value={answers.learningContent}
                onChange={v => setAnswers(p => ({ ...p, learningContent: v }))} />
              <Field label="学习收获" value={answers.gains}
                onChange={v => setAnswers(p => ({ ...p, gains: v }))} />
              <Field label="遇到的疑问" value={answers.questions}
                onChange={v => setAnswers(p => ({ ...p, questions: v }))} />
            </>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => handleSave(false)} disabled={saving}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
            跳过
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
            {saving ? 'AI 总结中...' : '🤖 AI 总结并保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
        className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:border-indigo-500 focus:outline-none resize-none"
        placeholder="输入..." />
    </div>
  )
}
