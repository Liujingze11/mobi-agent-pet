import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'
import { formatSeconds } from '../../../lib/ipc'
import { useI18n } from '../../../lib/i18n'

export default function KnowledgePage() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [showTopicForm, setShowTopicForm] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', icon: '📚', color: '#22c55e' })
  const [topicForm, setTopicForm] = useState({ name: '', description: '' })

  useEffect(() => { api.learning.listCategories().then(setCategories) }, [])
  useEffect(() => { api.learning.listTopics(selectedCategory || undefined).then(setTopics) }, [selectedCategory])

  const handleCreateCategory = async () => {
    await api.learning.createCategory(catForm)
    setCatForm({ name: '', icon: '📚', color: '#22c55e' }); setShowCatForm(false)
    api.learning.listCategories().then(setCategories)
  }
  const handleCreateTopic = async () => {
    if (!selectedCategory) return
    await api.learning.createTopic({ categoryId: selectedCategory, ...topicForm })
    setTopicForm({ name: '', description: '' }); setShowTopicForm(false)
    api.learning.listTopics(selectedCategory).then(setTopics)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t('gui.knowledge.title')}</h2>
      <div className="flex gap-4">
        <div className="w-64 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">{t('gui.knowledge.categoryLabel')}</span>
            <button onClick={() => setShowCatForm(!showCatForm)} className="text-indigo-400 text-xs hover:text-indigo-300">{t('gui.knowledge.newCategory')}</button>
          </div>
          {showCatForm && (
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 space-y-2">
              <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                placeholder={t('gui.projects.projectName')} className="w-full bg-slate-700 text-white rounded px-2 py-1 text-xs border border-slate-600" />
              <button onClick={handleCreateCategory} disabled={!catForm.name}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded px-2 py-1 text-xs">{t('gui.projects.create')}</button>
            </div>
          )}
          <div className="space-y-0.5">
            <button onClick={() => setSelectedCategory('')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${!selectedCategory ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'}`}>
              {t('gui.knowledge.allTopics')}
            </button>
            {categories.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedCategory(c.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${selectedCategory === c.id ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'}`}>
                <span>{c.icon}</span> {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">{t('gui.knowledge.topicLabel')}</span>
            {selectedCategory && (
              <button onClick={() => setShowTopicForm(!showTopicForm)} className="text-indigo-400 text-xs hover:text-indigo-300">{t('gui.knowledge.newTopic')}</button>
            )}
          </div>
          {showTopicForm && selectedCategory && (
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 space-y-2">
              <input value={topicForm.name} onChange={e => setTopicForm(p => ({ ...p, name: e.target.value }))}
                placeholder={t('gui.tasks.taskName')} className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600" />
              <button onClick={handleCreateTopic} disabled={!topicForm.name}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded px-3 py-1 text-sm">{t('gui.projects.create')}</button>
            </div>
          )}
          <div className="space-y-2">
            {topics.map((t: any) => (
              <div key={t.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {t.category_name} · {formatSeconds(t.total_seconds)}
                  {t.description && ` · ${t.description}`}
                </div>
              </div>
            ))}
            {topics.length === 0 && <p className="text-slate-500 text-sm text-center py-8">{t('gui.knowledge.noData')}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
