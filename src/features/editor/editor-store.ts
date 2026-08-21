import { create } from 'zustand'

import type { Workspace } from '../../domain/composition/types'
import { newBulletId, newEntryId, newSectionId } from '../../domain/pool/ids'
import type { Basics, BulletId, EntryId, SectionId, SectionLayout } from '../../domain/pool/types'
import { applyEntryCommand } from './entries/entries-store'
import { applySectionCommand } from './sections/sections-store'

/**
 * The single editor store: one workspace plus every section and entry action.
 * There is deliberately no separate "section store" and "entry store" — both
 * touch the same `Workspace` (a section removal also removes its entries), so
 * splitting them would give two stores that must agree on one object.
 *
 * Each action wraps one command through a pure reducer (`applySectionCommand`
 * or `applyEntryCommand`). Add actions mint the id here and return it, so the
 * reducer itself stays pure and testable without randomness.
 */
export type EditorState = {
  workspace: Workspace

  // whole-workspace replacement (JSON import)
  replaceWorkspace: (workspace: Workspace) => void

  // sections
  reorderSections: (order: SectionId[]) => void
  moveSection: (id: SectionId, direction: 'up' | 'down') => void
  setSectionVisible: (id: SectionId, visible: boolean) => void
  renameSection: (id: SectionId, title: string) => void
  addCustomSection: (title: string, layout: SectionLayout) => SectionId
  removeCustomSection: (id: SectionId) => void

  // entries & bullets
  addEntry: (sectionId: SectionId) => EntryId
  removeEntry: (id: EntryId) => void
  reorderEntries: (sectionId: SectionId, order: EntryId[]) => void
  setEntryTitle: (id: EntryId, title: string) => void
  setEntrySubtitle: (id: EntryId, subtitle: string) => void
  setEntryPeriod: (id: EntryId, period: { start: string; end?: string } | null) => void
  addBullet: (entryId: EntryId) => BulletId
  removeBullet: (entryId: EntryId, id: BulletId) => void
  reorderBullets: (entryId: EntryId, order: BulletId[]) => void
  setBulletText: (id: BulletId, text: string) => void

  // basics & text-section body
  setBasics: (basics: Basics) => void
  setSectionText: (sectionId: SectionId, text: string) => void
}

/**
 * A per-editor store, not a module singleton: the editor page seeds it from the
 * `?fixture=` query param, and every component under one editor shares the same
 * instance through context. Keeping the store instance local means the fixture
 * can change without a re-init action racing the first render.
 */
export function createEditorStore(initial: Workspace) {
  return create<EditorState>()((set) => ({
    workspace: initial,

    // The one action that does not go through a pure command reducer: JSON import
    // has already produced a fully validated `Workspace`, so the store only swaps
    // it in. The caller must have persisted it first (see `WorkspaceBackup`).
    replaceWorkspace: (workspace) => set({ workspace }),

    reorderSections: (order) =>
      set((state) => ({ workspace: applySectionCommand(state.workspace, { type: 'reorderSections', order }) })),
    moveSection: (id, direction) =>
      set((state) => ({ workspace: applySectionCommand(state.workspace, { type: 'moveSection', id, direction }) })),
    setSectionVisible: (id, visible) =>
      set((state) => ({ workspace: applySectionCommand(state.workspace, { type: 'setSectionVisible', id, visible }) })),
    renameSection: (id, title) =>
      set((state) => ({ workspace: applySectionCommand(state.workspace, { type: 'renameSection', id, title }) })),
    addCustomSection: (title, layout) => {
      const id = newSectionId()
      set((state) => ({
        workspace: applySectionCommand(state.workspace, { type: 'addCustomSection', id, title, layout }),
      }))
      return id
    },
    removeCustomSection: (id) =>
      set((state) => ({ workspace: applySectionCommand(state.workspace, { type: 'removeCustomSection', id }) })),

    addEntry: (sectionId) => {
      const id = newEntryId()
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'addEntry', sectionId, id }) }))
      return id
    },
    removeEntry: (id) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'removeEntry', id }) })),
    reorderEntries: (sectionId, order) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'reorderEntries', sectionId, order }) })),
    setEntryTitle: (id, title) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setEntryTitle', id, title }) })),
    setEntrySubtitle: (id, subtitle) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setEntrySubtitle', id, subtitle }) })),
    setEntryPeriod: (id, period) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setEntryPeriod', id, period }) })),
    addBullet: (entryId) => {
      const id = newBulletId()
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'addBullet', entryId, id }) }))
      return id
    },
    removeBullet: (entryId, id) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'removeBullet', entryId, id }) })),
    reorderBullets: (entryId, order) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'reorderBullets', entryId, order }) })),
    setBulletText: (id, text) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setBulletText', id, text }) })),

    setBasics: (basics) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setBasics', basics }) })),
    setSectionText: (sectionId, text) =>
      set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setSectionText', sectionId, text }) })),
  }))
}

export type EditorStore = ReturnType<typeof createEditorStore>
