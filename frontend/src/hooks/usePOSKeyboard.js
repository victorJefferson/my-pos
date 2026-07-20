import { useEffect, useCallback } from 'react'

/**
 * usePOSKeyboard — Wires keyboard shortcuts to POS actions.
 *
 * Enter  → confirmItem (focus search or add highlighted product)
 * Space  → openPayment (open the payment modal)
 * Esc    → clearBill (clear the active cart)
 * +      → increment last item qty
 * -      → decrement last item qty
 */
export function usePOSKeyboard({ onEnter, onSpace, onEsc, onPlus, onMinus, enabled = true }) {
  const handleKey = useCallback(
    (e) => {
      if (!enabled) return

      // Don't intercept when typing in inputs/textareas
      const tag = e.target.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable

      switch (e.key) {
        case 'Escape':
          onEsc?.()
          break
        case ' ':
          if (!isInput) {
            e.preventDefault()
            onSpace?.()
          }
          break
        case 'Enter':
          // Only intercept Enter outside of inputs
          if (!isInput) {
            e.preventDefault()
            onEnter?.()
          }
          break
        case '+':
          if (!isInput) onPlus?.()
          break
        case '-':
          if (!isInput) onMinus?.()
          break
        default:
          break
      }
    },
    [enabled, onEnter, onSpace, onEsc, onPlus, onMinus]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])
}
