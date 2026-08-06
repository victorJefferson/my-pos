import { useEffect } from 'react'
import { THEME_LIQUID_GLASS, LG_MIRROR_SELECTORS } from '../theme/constants'

function clearMirrors(root = document) {
  root.querySelectorAll('.lg-mirror').forEach((el) => el.remove())
}

function enhanceButton(btn) {
  if (!(btn instanceof HTMLElement)) return
  if (btn.matches('input, textarea, select')) return
  if (!btn.matches(LG_MIRROR_SELECTORS)) return
  if (btn.querySelector(':scope > .lg-mirror')) return

  const mirror = document.createElement('span')
  mirror.className = 'lg-mirror'
  mirror.setAttribute('aria-hidden', 'true')

  Array.from(btn.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('lg-mirror')) return
    mirror.appendChild(node.cloneNode(true))
  })

  if (!mirror.childNodes.length && btn.textContent?.trim()) {
    mirror.textContent = btn.textContent
  }

  if (!mirror.childNodes.length) return
  btn.appendChild(mirror)
}

function pruneIfStale(host) {
  if (!(host instanceof HTMLElement)) return
  const mirror = host.querySelector(':scope > .lg-mirror')
  if (!mirror) return
  if (!host.matches(LG_MIRROR_SELECTORS)) mirror.remove()
}

/**
 * Lazily injects internal mirror layers on pointer/focus.
 * Avoids a document-wide MutationObserver — that was starving React of
 * main-thread time and left POS stuck on skeletons despite 200 API responses.
 */
export default function LiquidGlassMirrorBoost({ theme }) {
  useEffect(() => {
    if (theme !== THEME_LIQUID_GLASS) {
      clearMirrors()
      return undefined
    }

    const ensure = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const host = target.closest(LG_MIRROR_SELECTORS)
      if (host instanceof HTMLElement) {
        enhanceButton(host)
        return
      }

      // Drop orphan mirrors on hosts that lost hoverable/active eligibility
      const maybeHost = target.closest('a, button, [role="button"], .category-tab')
      pruneIfStale(maybeHost)
    }

    document.addEventListener('pointerover', ensure, true)
    document.addEventListener('focusin', ensure, true)

    return () => {
      document.removeEventListener('pointerover', ensure, true)
      document.removeEventListener('focusin', ensure, true)
      clearMirrors()
    }
  }, [theme])

  return null
}
