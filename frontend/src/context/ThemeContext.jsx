import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import LiquidGlassFilters from '../components/LiquidGlassFilters'
import LiquidGlassMirrorBoost from '../components/LiquidGlassMirrorBoost'
import {
  THEME_LIGHT,
  THEME_DARK,
  THEME_LIQUID_GLASS,
  THEME_STORAGE_KEY,
  isValidTheme,
  nextTheme,
  liquidGlassCssVars,
} from '../theme/constants'

const ThemeContext = createContext()

const LG_VAR_KEYS = [
  '--lg-fill',
  '--lg-blur',
  '--lg-saturate',
  '--lg-refract',
  '--lg-reflect-opacity',
  '--lg-opacity',
]

function readStoredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return isValidTheme(stored) ? stored : THEME_LIGHT
}

function applyLiquidGlassVars(root) {
  const vars = liquidGlassCssVars()
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

function clearLiquidGlassVars(root) {
  for (const key of LG_VAR_KEYS) {
    root.style.removeProperty(key)
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    const isDark = theme === THEME_DARK
    const isLg = theme === THEME_LIQUID_GLASS

    // Liquid Glass is light-derived — never pair with .dark
    root.classList.toggle('dark', isDark)
    root.classList.toggle('liquid-glass', isLg)

    if (isLg) {
      applyLiquidGlassVars(root)
    } else {
      clearLiquidGlassVars(root)
    }

    localStorage.setItem(THEME_STORAGE_KEY, theme)
    // Drop legacy slider preference if present
    localStorage.removeItem('rc_lg_opacity')
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => nextTheme(isValidTheme(prev) ? prev : THEME_LIGHT))
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
      }}
    >
      <LiquidGlassFilters theme={theme} />
      <LiquidGlassMirrorBoost theme={theme} />
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
