import { useEffect, useState } from 'react'
import { api } from '../../lib/ipc'
import { useI18n } from '../../lib/i18n'

interface Props {
  onStartWork: () => void
  onStartLearning: () => void
  onOpenGui: () => void
  onClose: () => void
}

export default function QuickPanel({ onStartWork, onStartLearning, onOpenGui, onClose }: Props) {
  const { t } = useI18n()
  const [hasKey, setHasKey] = useState(true)
  useEffect(() => { api.hasApiKey().then(setHasKey) }, [])

  return (
    <div className="absolute left-full ml-4 top-0 w-64 bg-slate-800/95 backdrop-blur-lg rounded-xl border border-slate-700 shadow-2xl p-4 animate-fade-in text-white text-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-xs">DevPulse AI</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">{t('pulsecore.quickPanel.close')}</button>
      </div>

      <div className="space-y-2.5">
        {!hasKey && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-[10px] text-amber-300">
            ⚠️ 未配置 AI Key
            <button onClick={onOpenGui} className="ml-2 text-amber-400 underline">去设置 →</button>
          </div>
        )}

        <button onClick={onStartWork}
          className="w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded-lg py-3 text-sm font-medium border border-blue-500/30">
          💼 {t('pulsecore.quickPanel.startWork')}
        </button>
        <button onClick={onStartLearning}
          className="w-full bg-green-600/20 hover:bg-green-600/40 text-green-300 rounded-lg py-3 text-sm font-medium border border-green-500/30">
          📚 {t('pulsecore.quickPanel.startLearning')}
        </button>
        <button onClick={onOpenGui}
          className="w-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-xs">
          📊 {t('pulsecore.quickPanel.openGui')}
        </button>

      </div>
    </div>
  )
}
