import { useEffect } from 'react'

/** Brings a filtered list into view when a linked number sets its filter. */
export function useScrollOnParam(id: string, param: string) {
  useEffect(() => {
    if (!param) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [id, param])
}
