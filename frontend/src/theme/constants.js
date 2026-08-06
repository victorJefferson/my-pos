/** Theme + Liquid Glass constants */

export const THEME_LIGHT = 'light'
export const THEME_DARK = 'dark'
export const THEME_LIQUID_GLASS = 'liquid-glass'

export const THEME_STORAGE_KEY = 'rc_theme'

/** Fixed mid glass intensity (formerly slider default at 50). */
export const LG_OPACITY_DEFAULT = 50

export const THEME_CYCLE = [THEME_LIGHT, THEME_DARK, THEME_LIQUID_GLASS]

export const THEME_TITLES = {
  [THEME_LIGHT]: 'Switch to Dark Mode',
  [THEME_DARK]: 'Switch to Liquid Glass',
  [THEME_LIQUID_GLASS]: 'Switch to Light Mode',
}

export const THEME_ARIA_LABELS = {
  [THEME_LIGHT]: 'Current theme: Light',
  [THEME_DARK]: 'Current theme: Dark',
  [THEME_LIQUID_GLASS]: 'Current theme: Liquid Glass',
}

export const LG_FILTER_ID = 'rc-lg-refract'
export const LG_FILTER_CHROMA_ID = 'rc-lg-chroma'
/** Marker class for liquid-glass hover + internal refraction */
export const LG_HOVERABLE_CLASS = 'lg-hoverable'

/** Selectors that receive internal mirror refraction under liquid-glass */
export const LG_MIRROR_SELECTORS = [
  '.btn-glow',
  '.btn-ghost',
  '.category-tab:not(.active)',
  '.lg-hoverable',
  'aside.lg-shell a',
  'aside.lg-shell .lg-theme-btn',
].join(', ')


/** Apple system font stack — applied via CSS under .liquid-glass */
export const LG_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", system-ui, sans-serif'

export function isValidTheme(value) {
  return THEME_CYCLE.includes(value)
}

export function nextTheme(current) {
  const idx = THEME_CYCLE.indexOf(current)
  if (idx < 0) return THEME_LIGHT
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
}

/** Fixed mid-intensity liquid-glass CSS custom properties. */
export function liquidGlassCssVars() {
  const t = LG_OPACITY_DEFAULT / 100
  const fillAlpha = 0.28 + t * 0.42
  const blurPx = Math.round(20 + (1 - t) * 24)
  const saturate = (1.45 + (1 - t) * 0.65).toFixed(2)
  const refract = (10 + (1 - t) * 16).toFixed(1)
  const reflect = (0.35 + t * 0.35).toFixed(2)
  return {
    '--lg-fill': `rgba(255, 255, 255, ${fillAlpha.toFixed(3)})`,
    '--lg-blur': `${blurPx}px`,
    '--lg-saturate': saturate,
    '--lg-refract': refract,
    '--lg-reflect-opacity': reflect,
    '--lg-opacity': String(t),
  }
}
