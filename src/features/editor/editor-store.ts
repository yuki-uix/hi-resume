import { create } from 'zustand'

import type { RenderTarget, VariantId, Workspace } from '../../domain/composition/types'
import { newBulletId, newEntryId, newSectionId, newVariantId } from '../../domain/pool/ids'
import type { Basics, BulletId, EntryId, SectionId, SectionLayout } from '../../domain/pool/types'
import { applyEntryCommand, applyVariantEntryCommand, type BothEntryCommand } from './entries/entries-store'
import { applySectionCommand, applyVariantSectionCommand, type BothSectionCommand } from './sections/sections-store'
import { applyVariantCommand } from './variants/variants-store'

/**
 * The single editor store: one workspace plus every section and entry action.
 * There is deliberately no separate "section store" and "entry store" — both
 * touch the same `Workspace` (a section removal also removes its entries), so
 * splitting them would give two stores that must agree on one object.
 *
 * Each action wraps one command through a pure reducer. The *both-target*
 * actions (reorder / visibility / rename / check-uncheck) know which composition
 * they are writing because `target` lives in the store: on a variant they route
 * through the variant reducer and copy-on-write at the inheritance granularity,
 * on the master through the plain master reducer. The *master-only* actions
 * (content and pool mutation) always write the master — there is no variant
 * reducer that accepts them, which is what keeps them off a variant at the type
 * level rather than through a runtime guard.
 *
 * Add actions mint the id here and return it, so the reducers stay pure and
 * testable without randomness.
 */
export type EditorState = {
  workspace: Workspace

  /** Which resume is currently being edited; editor-local view state, not persisted. */
  target: RenderTarget
  setTarget: (target: RenderTarget) => void

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
  setEntrySelected: (sectionId: SectionId, id: EntryId, selected: boolean) => void
  setEntryTitle: (id: EntryId, title: string) => void
  setEntrySubtitle: (id: EntryId, subtitle: string) => void
  setEntryPeriod: (id: EntryId, period: { start: string; end?: string } | null) => void
  addBullet: (entryId: EntryId) => BulletId
  removeBullet: (entryId: EntryId, id: BulletId) => void
  reorderBullets: (entryId: EntryId, order: BulletId[]) => void
  setBulletSelected: (entryId: EntryId, id: BulletId, selected: boolean) => void
  setBulletText: (id: BulletId, text: string) => void

  // basics & text-section body
  setBasics: (basics: Basics) => void
  setSectionText: (sectionId: SectionId, text: string) => void

  // variants
  createVariant: (name: string) => VariantId
  duplicateVariant: (sourceId: VariantId, name: string) => VariantId
  renameVariant: (id: VariantId, name: string) => void
  deleteVariant: (id: VariantId) => void
}

/**
 * A per-editor store, not a module singleton: the editor page seeds it from the
 * `?fixture=` query param, and every component under one editor shares the same
 * instance through context. Keeping the store instance local means the fixture
 * can change without a re-init action racing the first render.
 */
export function createEditorStore(initial: Workspace) {
  return create<EditorState>()((set) => {
    // A both-target section command lands on whichever composition the editor is
    // currently writing. The timestamp is minted here so the variant reducer
    // stays pure.
    const sectionWrite = (state: EditorState, command: BothSectionCommand): Workspace =>
      state.target.kind === 'variant'
        ? applyVariantSectionCommand(state.workspace, state.target.id, command, new Date().toISOString())
        : applySectionCommand(state.workspace, command)

    const entryWrite = (state: EditorState, command: BothEntryCommand): Workspace =>
      state.target.kind === 'variant'
        ? applyVariantEntryCommand(state.workspace, state.target.id, command, new Date().toISOString())
        : applyEntryCommand(state.workspace, command)

    return {
      workspace: initial,
      target: { kind: 'master' },

      setTarget: (target) => set({ target }),

      // The one action that does not go through a pure command reducer: JSON import
      // has already produced a fully validated `Workspace`, so the store only swaps
      // it in. The caller must have persisted it first (see `WorkspaceBackup`).
      replaceWorkspace: (workspace) => set({ workspace }),

      reorderSections: (order) =>
        set((state) => ({ workspace: sectionWrite(state, { type: 'reorderSections', order }) })),
      moveSection: (id, direction) =>
        set((state) => ({ workspace: sectionWrite(state, { type: 'moveSection', id, direction }) })),
      setSectionVisible: (id, visible) =>
        set((state) => ({ workspace: sectionWrite(state, { type: 'setSectionVisible', id, visible }) })),
      renameSection: (id, title) =>
        set((state) => ({ workspace: sectionWrite(state, { type: 'renameSection', id, title }) })),
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
        set((state) => ({ workspace: entryWrite(state, { type: 'reorderEntries', sectionId, order }) })),
      setEntrySelected: (sectionId, id, selected) =>
        set((state) => ({ workspace: entryWrite(state, { type: 'setEntrySelected', sectionId, id, selected }) })),
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
        set((state) => ({ workspace: entryWrite(state, { type: 'reorderBullets', entryId, order }) })),
      setBulletSelected: (entryId, id, selected) =>
        set((state) => ({ workspace: entryWrite(state, { type: 'setBulletSelected', entryId, id, selected }) })),
      setBulletText: (id, text) =>
        set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setBulletText', id, text }) })),

      setBasics: (basics) =>
        set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setBasics', basics }) })),
      setSectionText: (sectionId, text) =>
        set((state) => ({ workspace: applyEntryCommand(state.workspace, { type: 'setSectionText', sectionId, text }) })),

      createVariant: (name) => {
        const id = newVariantId()
        const createdAt = new Date().toISOString()
        set((state) => ({
          workspace: applyVariantCommand(state.workspace, { type: 'createVariant', id, name, createdAt }),
        }))
        return id
      },
      duplicateVariant: (sourceId, name) => {
        const id = newVariantId()
        const createdAt = new Date().toISOString()
        set((state) => ({
          workspace: applyVariantCommand(state.workspace, {
            type: 'duplicateVariant',
            id,
            name,
            sourceId,
            createdAt,
          }),
        }))
        return id
      },
      renameVariant: (id, name) => {
        const updatedAt = new Date().toISOString()
        set((state) => ({
          workspace: applyVariantCommand(state.workspace, { type: 'renameVariant', id, name, updatedAt }),
        }))
      },
      deleteVariant: (id) =>
        set((state) => ({ workspace: applyVariantCommand(state.workspace, { type: 'deleteVariant', id }) })),
    }
  })
}

export type EditorStore = ReturnType<typeof createEditorStore>
