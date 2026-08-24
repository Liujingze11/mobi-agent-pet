import { Home, FolderKanban, CheckSquare, Library, List, FileText, Calendar, BarChart3, Trophy, Settings } from 'lucide-react'
import { useI18n } from '../../../lib/i18n'

const iconMap: Record<string, any> = {
  workbench: Home, overview: Home, projects: FolderKanban, tasks: CheckSquare, knowledge: Library,
  sessions: List, daily: FileText, weekly: Calendar, monthly: BarChart3,
  achievements: Trophy, settings: Settings
}

const navIds = ['workbench', '__div0__', 'overview', 'projects', 'tasks', 'knowledge', 'sessions', '__div1__', 'daily', 'weekly', 'monthly', '__div2__', 'achievements', 'settings']

export default function Sidebar({ currentPage, onNavigate }: {
  currentPage: string; onNavigate: (p: string) => void
}) {
  const { t } = useI18n()

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col p-3">
      <div className="px-3 py-4 mb-2">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-indigo-400">DevPulse</span>{' '}
          <span className="text-white">AI</span>
        </h1>
      </div>
      <nav className="flex-1 space-y-0.5">
        {navIds.map((id, i) => {
          if (id.startsWith('__div')) return <div key={i} className="border-t border-slate-800 my-3" />
          const Icon = iconMap[id]
          const active = currentPage === id
          const labelKey = `gui.sidebar.${id === 'daily' ? 'dailyPulse' : id === 'weekly' ? 'weeklyPulse' : id === 'monthly' ? 'monthlyPulse' : id}`
          return (
            <button key={id} onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                       : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={16} />
              {t(labelKey)}
            </button>
          )
        })}
      </nav>
      <div className="text-xs text-slate-600 px-3 py-2">{t('app.version')}</div>
    </aside>
  )
}
