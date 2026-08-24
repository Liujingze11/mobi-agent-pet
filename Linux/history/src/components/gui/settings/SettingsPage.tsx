import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'
import { useI18n } from '../../../lib/i18n'
import type { Language } from '../../../lib/i18n'
import type { PetFormId } from '../../pulsecore/PulseCore'
import PetSelector from './PetSelector'

export default function SettingsPage() {
  const { t, language, setLanguage } = useI18n()
  const [aiSettings, setAiSettings] = useState({ provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
  const [testResult, setTestResult] = useState<string>('')
  const [petForm, setPetForm] = useState<PetFormId>('heartbeat')
  const [petVisible, setPetVisible] = useState(true)

  useEffect(() => {
    api.ai.getSettings().then(setAiSettings)
    api.settings.get('pet_form').then(v => {
      if (v) { try { const f = JSON.parse(v); if (typeof f === 'string') setPetForm(f) } catch {} }
    })
    api.window.isPulseCoreVisible().then(setPetVisible)
  }, [])

  const handlePetChange = async (id: PetFormId) => {
    setPetForm(id)
    await api.settings.set('pet_form', JSON.stringify(id))
    await api.app.notifyPetChanged(id)  // 通知 PulseCore 窗口同步切换
  }

  const handleSave = async () => {
    await api.ai.saveSettings(aiSettings)
    setTestResult(t('gui.settings.saved'))
    setTimeout(() => setTestResult(''), 2000)
  }

  const handleTest = async () => {
    setTestResult(t('gui.settings.testing'))
    const result = await api.ai.validateConnection()
    setTestResult(result.ok ? t('gui.settings.connectionSuccess') : `${t('gui.settings.connectionFailed')}: ${result.error}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-semibold">{t('gui.settings.title')}</h2>

      {/* AI 设置 */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-4">
        <h3 className="font-medium text-sm">{t('gui.settings.aiSettings')}</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('gui.settings.provider')}</label>
            <select value={aiSettings.provider} onChange={e => setAiSettings(p => ({ ...p, provider: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('gui.settings.apiKey')}</label>
            <input type="password" value={aiSettings.apiKey} onChange={e => setAiSettings(p => ({ ...p, apiKey: e.target.value }))}
              placeholder="sk-..." className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('gui.settings.baseUrl')}</label>
            <input value={aiSettings.baseUrl} onChange={e => setAiSettings(p => ({ ...p, baseUrl: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('gui.settings.model')}</label>
            <select value={aiSettings.model} onChange={e => setAiSettings(p => ({ ...p, model: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-coder">deepseek-coder</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium">{t('gui.settings.save')}</button>
            <button onClick={handleTest} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">{t('gui.settings.testConnection')}</button>
          </div>

          {testResult && <div className="text-xs text-slate-400">{testResult}</div>}
        </div>
      </section>

      {/* 语言设置 */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <h3 className="font-medium text-sm">{t('gui.settings.language')}</h3>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">{t('gui.settings.languageLabel')}</label>
          <select value={language} onChange={e => setLanguage(e.target.value as Language)}
            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
            <option value="zh-CN">🇨🇳 中文</option>
            <option value="en-US">🇺🇸 English</option>
          </select>
        </div>
      </section>

      {/* 桌面宠物 */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">🔮 桌面宠物</h3>
          <button
            onClick={async () => {
              const v = await api.window.togglePulseCore()
              setPetVisible(v)
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              petVisible ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-slate-600/20 text-slate-400 border border-slate-500/30'
            }`}>
            {petVisible ? '👁 显示中' : '🙈 已隐藏'}
          </button>
        </div>
        <PetSelector current={petForm} onChange={handlePetChange} />
      </section>

      {/* 通用设置 */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <h3 className="font-medium text-sm">{t('gui.settings.general')}</h3>
        <p className="text-xs text-slate-400">{t('gui.settings.generalPlaceholder')}</p>
        <p className="text-xs text-slate-500">{t('gui.settings.dataPath')}</p>
      </section>
    </div>
  )
}
