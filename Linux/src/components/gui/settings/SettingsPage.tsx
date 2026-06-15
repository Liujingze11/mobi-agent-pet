import { useState, useEffect } from 'react'
import { api } from '../../../lib/ipc'

export default function SettingsPage() {
  const [aiSettings, setAiSettings] = useState({ provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
  const [testResult, setTestResult] = useState<string>('')

  useEffect(() => {
    api.ai.getSettings().then(setAiSettings)
  }, [])

  const handleSave = async () => {
    await api.ai.saveSettings(aiSettings)
    setTestResult('已保存')
    setTimeout(() => setTestResult(''), 2000)
  }

  const handleTest = async () => {
    setTestResult('测试中...')
    const result = await api.ai.validateConnection()
    setTestResult(result.ok ? '✅ 连接成功' : `❌ 连接失败: ${result.error}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-semibold">⚙️ 设置</h2>

      {/* AI 设置 */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-4">
        <h3 className="font-medium text-sm">🤖 AI 设置</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Provider</label>
            <select value={aiSettings.provider} onChange={e => setAiSettings(p => ({ ...p, provider: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">API Key</label>
            <input type="password" value={aiSettings.apiKey} onChange={e => setAiSettings(p => ({ ...p, apiKey: e.target.value }))}
              placeholder="sk-..." className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Base URL</label>
            <input value={aiSettings.baseUrl} onChange={e => setAiSettings(p => ({ ...p, baseUrl: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600" />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Model</label>
            <select value={aiSettings.model} onChange={e => setAiSettings(p => ({ ...p, model: e.target.value }))}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600">
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-coder">deepseek-coder</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium">保存</button>
            <button onClick={handleTest} className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-4 py-2 text-sm">测试连接</button>
          </div>

          {testResult && <div className="text-xs text-slate-400">{testResult}</div>}
        </div>
      </section>

      {/* 通用设置 */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <h3 className="font-medium text-sm">💡 通用</h3>
        <p className="text-xs text-slate-400">更多设置将在后续版本中添加。</p>
        <p className="text-xs text-slate-500">数据存储位置：用户目录下的 .config/devpulse-ai/data/devpulse.db</p>
      </section>
    </div>
  )
}
