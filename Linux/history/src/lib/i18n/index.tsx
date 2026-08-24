import React, { createContext, useContext, useState, useCallback } from 'react'
import type { TranslationMap } from './types'
import { zhCN } from './zh-CN'
import { enUS } from './en-US'
import { api } from '../ipc'

export type Language = 'zh-CN' | 'en-US'

const translations: Record<Language, TranslationMap> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

function getNested(obj: any, path: string): any {
  let cur = obj
  for (const k of path.split('.')) {
    if (cur == null) return undefined
    cur = cur[k]
  }
  return cur
}

interface I18nCtx {
  language: Language
  setLanguage: (l: Language) => void
  t: (key: string) => string
  tData: <T>(key: string) => T
}

const I18nContext = createContext<I18nCtx>({
  language: 'zh-CN', setLanguage: () => {},
  t: (k: string) => k, tData: <T,>(_k: string) => ({} as T),
})

export function I18nProvider({ children, language, onLanguageChange }: {
  children: React.ReactNode; language: Language; onLanguageChange?: (l: Language) => void
}) {
  const [lang, setLang] = useState<Language>(language)

  const setLanguage = useCallback((l: Language) => {
    setLang(l)
    api.settings.set('language', l)
    onLanguageChange?.(l)
  }, [onLanguageChange])

  const t = useCallback((key: string): string => {
    const v = getNested(translations[lang], key)
    return typeof v === 'string' ? v : key
  }, [lang])

  const tData = useCallback(<T,>(key: string): T => {
    return getNested(translations[lang], key) as T
  }, [lang])

  return (
    <I18nContext.Provider value={{ language: lang, setLanguage, t, tData }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() { return useContext(I18nContext) }

// ---- 首次启动: 语言 + 模式 选择 ----
export function OnboardingGate({ onDone }: { onDone: (lang: Language, mode: string) => void }) {
  const [step, setStep] = useState<'language' | 'mode'>('language')
  const [language, setLanguage] = useState<Language>('zh-CN')

  if (step === 'language') {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-dark">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-indigo-400">DevPulse</span>{' '}
            <span className="text-white">AI</span>
          </h1>
          <p className="text-slate-400">请选择语言 / Choose your language</p>
          <div className="flex gap-4">
            <button onClick={() => { setLanguage('zh-CN'); setStep('mode') }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-8 py-4 text-lg font-medium">
              🇨🇳 中文
            </button>
            <button onClick={() => { setLanguage('en-US'); setStep('mode') }}
              className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl px-8 py-4 text-lg font-medium">
              🇺🇸 English
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex items-center justify-center bg-surface-dark">
      <div className="text-center space-y-6">
        <h1 className="text-2xl font-bold text-white">
          {language === 'zh-CN' ? '欢迎使用 DevPulse AI' : 'Welcome to DevPulse AI'}
        </h1>
        <p className="text-slate-400">
          {language === 'zh-CN' ? '请选择您的使用模式' : 'Choose your mode'}
        </p>
        <div className="flex gap-4">
          <button onClick={() => onDone(language, 'solo')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-8 py-4 text-lg font-medium">
            🧑‍💻 {language === 'zh-CN' ? '独立开发者' : 'Solo Developer'}
          </button>
          <button onClick={() => onDone(language, 'team')}
            className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl px-8 py-4 text-lg font-medium">
            👥 {language === 'zh-CN' ? '团队开发' : 'Team'}
          </button>
        </div>
      </div>
    </div>
  )
}
