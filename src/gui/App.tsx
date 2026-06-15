import { useState, useEffect } from 'react'
import Layout from '../components/gui/layout/Layout'
import OverviewPage from '../components/gui/overview/OverviewPage'
import ProjectList from '../components/gui/projects/ProjectList'
import TaskList from '../components/gui/tasks/TaskList'
import KnowledgePage from '../components/gui/knowledge/KnowledgePage'
import SessionTable from '../components/gui/sessions/SessionTable'
import DailyReport from '../components/gui/reports/DailyReport'
import WeeklyReport from '../components/gui/reports/WeeklyReport'
import MonthlyReport from '../components/gui/reports/MonthlyReport'
import AchievementWall from '../components/gui/achievements/AchievementWall'
import SettingsPage from '../components/gui/settings/SettingsPage'
import { api } from '../lib/ipc'

type Page = 'overview' | 'projects' | 'tasks' | 'knowledge' | 'sessions' | 'daily' | 'weekly' | 'monthly' | 'achievements' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [mode, setMode] = useState<string>('solo')
  const [showModeSelect, setShowModeSelect] = useState(false)

  useEffect(() => {
    api.app.getMode().then(m => {
      if (!m || m === '""') setShowModeSelect(true)
      else setMode(m)
    })
  }, [])

  const handleModeSelect = async (m: string) => {
    await api.app.setMode(m)
    setMode(m)
    setShowModeSelect(false)
  }

  if (showModeSelect) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-dark">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-bold text-white">欢迎使用 DevPulse AI</h1>
          <p className="text-slate-400">请选择您的使用模式</p>
          <div className="flex gap-4">
            <button onClick={() => handleModeSelect('solo')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-8 py-4 text-lg font-medium">
              🧑‍💻 独立开发者
            </button>
            <button onClick={() => handleModeSelect('team')}
              className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl px-8 py-4 text-lg font-medium">
              👥 团队开发
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPage = () => {
    switch (page) {
      case 'overview': return <OverviewPage />
      case 'projects': return <ProjectList />
      case 'tasks': return <TaskList />
      case 'knowledge': return <KnowledgePage />
      case 'sessions': return <SessionTable />
      case 'daily': return <DailyReport />
      case 'weekly': return <WeeklyReport />
      case 'monthly': return <MonthlyReport />
      case 'achievements': return <AchievementWall />
      case 'settings': return <SettingsPage />
    }
  }

  return <Layout currentPage={page} onNavigate={setPage}>{renderPage()}</Layout>
}
