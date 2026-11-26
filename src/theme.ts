import { useState } from 'react'

export type Theme = 'light' | 'dark'
const storageKey = 'hq-finops-theme'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const changeTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(storageKey, next) } catch { /* Storage can be unavailable in private browsing. */ }
    setTheme(next)
  }
  return { theme, changeTheme }
}
