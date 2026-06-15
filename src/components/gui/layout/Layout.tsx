import Sidebar from './Sidebar'
import PulseBar from './PulseBar'

export default function Layout({ children, currentPage, onNavigate }: {
  children: React.ReactNode
  currentPage: string
  onNavigate: (p: any) => void
}) {
  return (
    <div className="h-screen flex bg-surface-dark text-white">
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <PulseBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
