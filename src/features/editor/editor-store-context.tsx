import { createContext, useContext } from 'react'

import type { EditorStore } from './editor-store'

/**
 * The store is created per editor instance (seeded from the `?fixture=` query
 * param) and handed down here, so every component under one editor shares the
 * same state without a module-level singleton.
 */
export const EditorStoreContext = createContext<EditorStore | null>(null)

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error('useEditorStore must be used inside <SectionsEditor>')
  return store
}
