import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../domain/__fixtures__/workspace'
import { createEditorStore } from './editor-store'

describe('createEditorStore', () => {
  it('holds the workspace and every action, with no second copy of any order', () => {
    const store = createEditorStore(createWorkspace())
    const state = store.getState()

    expect(Object.keys(state).sort()).toEqual([
      'addBullet',
      'addCustomSection',
      'addEntry',
      'moveSection',
      'removeBullet',
      'removeCustomSection',
      'removeEntry',
      'renameSection',
      'reorderBullets',
      'reorderEntries',
      'reorderSections',
      'replaceWorkspace',
      'setBasics',
      'setBulletText',
      'setEntryPeriod',
      'setEntrySubtitle',
      'setEntryTitle',
      'setSectionText',
      'setSectionVisible',
      'workspace',
    ])

    // The single source of truth: the workspace's composition, not flat lists.
    expect(state.workspace.master.sectionOrder).toEqual([
      SECTION.summary,
      SECTION.work,
      SECTION.project,
      SECTION.skill,
      SECTION.oss,
    ])
  })

  it('dispatches section commands through the section reducer', () => {
    const store = createEditorStore(createWorkspace())
    store.getState().setSectionVisible(SECTION.skill, false)

    expect(store.getState().workspace.master.visibleSections).toEqual([
      SECTION.summary,
      SECTION.work,
      SECTION.project,
    ])
  })

  it('dispatches entry commands through the entry reducer and mints unique ids', () => {
    const store = createEditorStore(createWorkspace())
    const entryId = store.getState().addEntry(SECTION.work)
    const bulletId = store.getState().addBullet(entryId)

    expect(entryId.startsWith('ent_')).toBe(true)
    expect(bulletId.startsWith('bul_')).toBe(true)
    expect(store.getState().workspace.pool.entries[entryId]?.title).toBe('')
    expect(store.getState().workspace.pool.bullets[bulletId]?.text).toBe('')

    store.getState().setEntryTitle(entryId, 'Engineer')
    store.getState().setBulletText(bulletId, 'First bullet')
    expect(store.getState().workspace.pool.entries[entryId]?.title).toBe('Engineer')
    expect(store.getState().workspace.pool.bullets[bulletId]?.text).toBe('First bullet')
  })

  it('keeps a section removal and its entry removal consistent on one workspace', () => {
    const store = createEditorStore(createWorkspace())
    // Adding an entry to a section, then removing that section, drops the entry too.
    const entryId = store.getState().addEntry(SECTION.project)
    expect(store.getState().workspace.pool.entries[entryId]).toBeDefined()

    store.getState().removeCustomSection(SECTION.project)
    // sec_project is a built-in section, so it refuses — the entry stays.
    expect(store.getState().workspace.pool.entries[entryId]).toBeDefined()

    // The removable custom section owns its entries, so this one disappears.
    const ossEntry = store.getState().addEntry(SECTION.oss)
    expect(store.getState().workspace.pool.entries[ossEntry]).toBeDefined()
    store.getState().removeCustomSection(SECTION.oss)
    expect(store.getState().workspace.pool.entries[ossEntry]).toBeUndefined()
  })

  it('setSectionText edits a text section body through the entry reducer', () => {
    const store = createEditorStore(createWorkspace())
    store.getState().setSectionText(SECTION.summary, 'New summary.')
    expect(store.getState().workspace.pool.sections[SECTION.summary]?.text).toBe('New summary.')
  })

  it('setBasics replaces the basics block', () => {
    const store = createEditorStore(createWorkspace())
    store.getState().setBasics({ name: 'Ada Chen', headline: 'Staff Engineer' })
    expect(store.getState().workspace.pool.basics).toEqual({
      name: 'Ada Chen',
      headline: 'Staff Engineer',
    })
  })

  it('removeEntry and removeBullet stay consistent with the fixture pool', () => {
    const store = createEditorStore(createWorkspace())
    store.getState().removeBullet(ENTRY.acme, BULLET.acme1)
    expect(store.getState().workspace.pool.entries[ENTRY.acme]?.bulletIds).toEqual([BULLET.acme2, BULLET.acme3])
  })
})
