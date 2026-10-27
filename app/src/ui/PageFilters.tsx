import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FilterSlot, IntroSlot } from './filterSlot'

/** A view's own intro. It takes the place of the section intro under the page title, so it costs no extra row. */
export function PageIntro({ children }: { children: ReactNode }) {
  const slot = useContext(IntroSlot)
  const text = <p className="view-intro">{children}</p>
  return slot ? createPortal(text, slot) : text
}

/** A view's own filters. They render in the sticky filter dock beside the tab's filters, so they stay in reach while the page scrolls. */
export function PageFilters({ label, children }: { label: string; children: ReactNode }) {
  const slot = useContext(FilterSlot)
  const group = (
    <div className="filters page-filters" role="group" aria-label={label}>
      {children}
    </div>
  )
  return slot ? createPortal(group, slot) : group
}
