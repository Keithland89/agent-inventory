import { createContext } from 'react'

/** The slot in the sticky filter dock that a view's own filters render into. */
export const FilterSlot = createContext<HTMLElement | null>(null)

/** The line under the page title that a view's own intro replaces. */
export const IntroSlot = createContext<HTMLElement | null>(null)

