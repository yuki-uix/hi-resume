import { createContext, useContext } from 'react'

import type { SectionsStore } from './sections-store'

/**
 * The store is created per editor instance (seeded from the `?fixture=` query
 * param) and handed down here, so every component under one editor shares the
 * same state without a module-level singleton.
 */
export const SectionsStoreContext = createContext<SectionsStore | null>(null)

export function useSectionsStore(): SectionsStore {
  const store = useContext(SectionsStoreContext)
  if (!store) throw new Error('useSectionsStore must be used inside <SectionsEditor>')
  return store
}
