import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import { asSectionId } from '../../../domain/pool/ids'
import { applySectionCommand } from './sections-store'

// The one invariant every test here guards: section state lives in exactly one
// place — `ResumeComposition.sectionOrder` / `visibleSections` / `sectionTitles`
// (and, for add/remove, the pool + the selection records the section owns).
// There is no second "ordered section list" to fall out of sync with it.

describe('applySectionCommand', () => {
  describe('reorderSections', () => {
    it('replaces sectionOrder and leaves the rest of the composition alone', () => {
      const ws = createWorkspace()
      const before = ws.master

      const result = applySectionCommand(ws, {
        type: 'reorderSections',
        order: [SECTION.skill, SECTION.summary, SECTION.work, SECTION.project, SECTION.oss],
      })

      expect(result.master.sectionOrder).toEqual([
        SECTION.skill,
        SECTION.summary,
        SECTION.work,
        SECTION.project,
        SECTION.oss,
      ])
      expect(result.master.visibleSections).toEqual(before.visibleSections)
      expect(result.master.sectionTitles).toEqual(before.sectionTitles)
      expect(result.master.entrySelection).toEqual(before.entrySelection)
      expect(result.master.sectionOrder).not.toBe(ws.master.sectionOrder)
    })
  })

  describe('moveSection', () => {
    it('moves a visible section up relative to its visible neighbour', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'moveSection', id: SECTION.work, direction: 'up' })

      expect(result.master.sectionOrder).toEqual([
        SECTION.work,
        SECTION.summary,
        SECTION.project,
        SECTION.skill,
        SECTION.oss,
      ])
      // The move is expressed purely as a sectionOrder rewrite.
      expect(result.master.visibleSections).toEqual(ws.master.visibleSections)
    })

    it('moves a visible section down relative to its visible neighbour', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'moveSection', id: SECTION.project, direction: 'down' })

      expect(result.master.sectionOrder).toEqual([
        SECTION.summary,
        SECTION.work,
        SECTION.skill,
        SECTION.project,
        SECTION.oss,
      ])
    })

    it('skips hidden sections so a move always changes the visible order', () => {
      const ws = createWorkspace()
      // [summary, work, project, skill, oss(hidden), custom] — moving `custom`
      // up must jump past the hidden `oss`, not swap with it (a no-op visually).
      const custom = asSectionId('sec_custom')
      ws.master.sectionOrder = [SECTION.summary, SECTION.work, SECTION.project, SECTION.skill, SECTION.oss, custom]
      ws.master.visibleSections = [SECTION.summary, SECTION.work, SECTION.project, SECTION.skill, custom]

      const result = applySectionCommand(ws, { type: 'moveSection', id: custom, direction: 'up' })

      expect(result.master.sectionOrder).toEqual([
        SECTION.summary,
        SECTION.work,
        SECTION.project,
        custom,
        SECTION.skill,
        SECTION.oss,
      ])
    })

    it('is a no-op for the first and last visible section', () => {
      const ws = createWorkspace()
      const up = applySectionCommand(ws, { type: 'moveSection', id: SECTION.summary, direction: 'up' })
      expect(up.master.sectionOrder).toEqual(ws.master.sectionOrder)

      const down = applySectionCommand(ws, { type: 'moveSection', id: SECTION.skill, direction: 'down' })
      expect(down.master.sectionOrder).toEqual(ws.master.sectionOrder)
    })

    it('does not mutate the input workspace', () => {
      const ws = createWorkspace()
      const original = [...ws.master.sectionOrder]
      applySectionCommand(ws, { type: 'moveSection', id: SECTION.work, direction: 'up' })
      expect(ws.master.sectionOrder).toEqual(original)
    })
  })

  describe('setSectionVisible', () => {
    it('removes a section from visibleSections without touching sectionOrder', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'setSectionVisible', id: SECTION.skill, visible: false })

      expect(result.master.visibleSections).toEqual([
        SECTION.summary,
        SECTION.work,
        SECTION.project,
      ])
      // Order is preserved, so re-showing restores the original position.
      expect(result.master.sectionOrder).toEqual(ws.master.sectionOrder)
    })

    it('re-shows a section at the end of visibleSections (set semantics)', () => {
      const ws = createWorkspace()
      const hidden = applySectionCommand(ws, { type: 'setSectionVisible', id: SECTION.skill, visible: false })
      const shown = applySectionCommand(hidden, { type: 'setSectionVisible', id: SECTION.skill, visible: true })

      expect(shown.master.visibleSections).toEqual([
        SECTION.summary,
        SECTION.work,
        SECTION.project,
        SECTION.skill,
      ])
      // Render order comes from sectionOrder, so the visible sequence is unchanged.
      expect(shown.master.sectionOrder).toEqual(ws.master.sectionOrder)
    })

    it('is idempotent', () => {
      const ws = createWorkspace()
      const once = applySectionCommand(ws, { type: 'setSectionVisible', id: SECTION.skill, visible: false })
      const twice = applySectionCommand(once, { type: 'setSectionVisible', id: SECTION.skill, visible: false })
      expect(twice.master.visibleSections).toEqual(once.master.visibleSections)
    })
  })

  describe('renameSection', () => {
    it('writes the new title to sectionTitles and nothing else', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'renameSection', id: SECTION.project, title: '产品案例' })

      expect(result.master.sectionTitles).toEqual({ [SECTION.work]: '工作经验', [SECTION.project]: '产品案例' })
      expect(result.master.sectionOrder).toEqual(ws.master.sectionOrder)
      expect(result.master.visibleSections).toEqual(ws.master.visibleSections)
    })

    it('drops the override when renamed back to the pool default', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'renameSection', id: SECTION.work, title: '工作经历' })

      expect(result.master.sectionTitles).toEqual({})
    })

    it('renaming a text section never touches textOverrides', () => {
      // The master has no textOverrides; the point is that a section rename is
      // only ever recorded in sectionTitles, never alongside body prose.
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'renameSection', id: SECTION.summary, title: '关于我' })

      expect(result.master.sectionTitles[SECTION.summary]).toBe('关于我')
      expect('textOverrides' in result.master).toBe(false)
    })
  })

  describe('addCustomSection', () => {
    it('adds the section to the pool, order, visibility and an empty selection', () => {
      const ws = createWorkspace()
      const id = asSectionId('sec_award')
      const result = applySectionCommand(ws, { type: 'addCustomSection', id, title: '获奖', layout: 'entries' })

      expect(result.pool.sections[id]).toEqual({
        id,
        kind: 'custom',
        title: '获奖',
        layout: 'entries',
        removable: true,
      })
      expect(result.master.sectionOrder.at(-1)).toBe(id)
      expect(result.master.visibleSections.at(-1)).toBe(id)
      expect(result.master.entrySelection[id]).toEqual([])
    })

    it('creates a text-layout section when asked', () => {
      const ws = createWorkspace()
      const id = asSectionId('sec_notes')
      const result = applySectionCommand(ws, { type: 'addCustomSection', id, title: '备注', layout: 'text' })

      expect(result.pool.sections[id]?.layout).toBe('text')
    })
  })

  describe('removeCustomSection', () => {
    it('removes the section, its entries and bullets, and every composition reference', () => {
      const ws = createWorkspace()
      // sec_oss is the one removable, custom section; it owns ent_oss + bul_oss_1.
      const result = applySectionCommand(ws, { type: 'removeCustomSection', id: SECTION.oss })

      expect(result.pool.sections[SECTION.oss]).toBeUndefined()
      expect(result.pool.entries[ENTRY.oss]).toBeUndefined()
      expect(result.pool.bullets[BULLET.oss1]).toBeUndefined()

      expect(result.master.sectionOrder).not.toContain(SECTION.oss)
      expect(result.master.visibleSections).not.toContain(SECTION.oss)
      expect(result.master.entrySelection[SECTION.oss]).toBeUndefined()
      expect(result.master.bulletSelection[ENTRY.oss]).toBeUndefined()
      expect(result.master.sectionTitles[SECTION.oss]).toBeUndefined()
    })

    it('refuses to remove a built-in section', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'removeCustomSection', id: SECTION.work })

      expect(result).toBe(ws)
      expect(ws.pool.sections[SECTION.work]).toBeDefined()
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      const result = applySectionCommand(ws, { type: 'removeCustomSection', id: asSectionId('sec_gone') })

      expect(result).toBe(ws)
    })
  })
})
