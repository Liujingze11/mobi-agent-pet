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
import WorkbenchPage from '../components/gui/workbench/WorkbenchPage'
import { I18nProvider, OnboardingGate } from '../lib/i18n'
import type { Language } from '../lib/i18n'
import { api } from '../lib/ipc'

type Page = 'workbench' | 'overview' | 'projects' | 'tasks' | 'knowledge' | 'sessions' | 'daily' | 'weekly' | 'monthly' | 'achievements' | 'settings'

function AppContent() {
  const [page, setPage] = useState<Page>('overview')

  const renderPage = () => {
    switch (page) {
      case 'workbench': return <WorkbenchPage />
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

export default function App() {
  const [language, setLanguage] = useState<Language | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([api.settings.get('language'), api.app.getMode()]).then(([lang, mode]) => {
      if (lang === 'zh-CN' || lang === 'en-US') {
        setLanguage(lang as Language)
        if (mode && mode !== '""') setReady(true)
      }
      // 否则 language 保持 null，触发 OnboardingGate
    })
  }, [])

  const handleOnboardingDone = async (lang: Language, mode: string) => {
    await api.settings.set('language', lang)
    await api.app.setMode(mode)
    // 通知主进程：引导完成，可以显示 PulseCore 了
    await api.app.onboardingComplete()
    setLanguage(lang)
    setReady(true)
  }

  if (!language || !ready) {
    return <OnboardingGate onDone={handleOnboardingDone} />
  }

  return (
    <I18nProvider language={language}>
      <AppContent />
    </I18nProvider>
  )
}
