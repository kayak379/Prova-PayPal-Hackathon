'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ dark: boolean; toggle: () => void } | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)

  const apply = useCallback((theme: Theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111c17' : '#f6f2e7')
    setDark(theme === 'dark')
  }, [])

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    let preference: string | null = null
    try { preference = localStorage.getItem('prova-theme') } catch { /* Storage may be disabled. */ }
    apply(document.documentElement.classList.contains('dark') ? 'dark' : 'light')

    const onSystemChange = () => {
      try { preference = localStorage.getItem('prova-theme') } catch { /* Keep the in-memory preference. */ }
      if (preference !== 'light' && preference !== 'dark') apply(system.matches ? 'dark' : 'light')
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'prova-theme' && event.key !== null) return
      preference = event.newValue
      apply(preference === 'light' || preference === 'dark' ? preference : system.matches ? 'dark' : 'light')
    }
    const onPreference = () => { preference = document.documentElement.classList.contains('dark') ? 'dark' : 'light' }
    system.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorage)
    window.addEventListener('prova-theme-change', onPreference)
    return () => {
      system.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('prova-theme-change', onPreference)
    }
  }, [apply])

  const toggle = useCallback(() => {
    const theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    apply(theme)
    try { localStorage.setItem('prova-theme', theme) } catch { /* Still allow toggling without persistence. */ }
    window.dispatchEvent(new Event('prova-theme-change'))
  }, [apply])

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme must be used within ThemeProvider')
  return theme
}
