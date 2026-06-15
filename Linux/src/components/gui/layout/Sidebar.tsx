import { Home, FolderKanban, CheckSquare, Library, List, FileText, Calendar, BarChart3, Trophy, Settings } from 'lucide-react'

const navItems = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'knowledge', label: 'Knowledge', icon: Library },
  { id: 'sessions', label: 'Sessions', icon: List },
  { type: 'divider' },
  { id: 'daily', label: 'Daily Pulse', icon: FileText },
  { id: 'weekly', label: 'Weekly Pulse', icon: Calendar },
  { id: 'monthly', label: 'Monthly Pulse', icon: BarChart3 },
  { type: 'divider' },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export default function Sidebar({ currentPage, onNavigate }: {
  currentPage: string
  onNavigate: (p: string) => void
}) {
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col p-3">
      <div className="px-3 py-4 mb-2">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-indigo-400">DevPulse</span>{' '}
          <span className="text-white">AI</span>
        </h1>
      </div>
      <nav className="flex-1 space-y-0.5">
        {navItems.map((item: any, i) => {
          if (item.type === 'divider') {
            return <div key={i} className="border-t border-slate-800 my-3" />
          }
          const Icon = item.icon
          const active = currentPage === item.id
          return (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                       : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="text-xs text-slate-600 px-3 py-2">v0.1.0 MVP</div>
    </aside>
  )
}
