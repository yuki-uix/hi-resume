import { describe, expect, it } from 'vitest'

import { ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import { resolveComposition } from '../../../domain/composition/resolve'
import type { ResumeVariant, Workspace } from '../../../domain/composition/types'
import { applyVariantSectionCommand } from './sections-store'

// The invariant every test here guards: the variant write path copy-on-writes at
// the inheritance granularity of each field. `sectionOrder` / `visibleSections`
// are whole-value, `sectionTitles` is per-section — and *only* the field the
// command touched is materialised into the variant's partial. Writing the whole
// resolved composition back would freeze the partial into a master snapshot and
// kill inheritance, so the assertions check `Object.keys(composition)` exactly.

const UPDATED_AT = '2026-08-24T12:00:00.000Z'

function workspaceWithVariant(partial: ResumeVariant['composition'] = {}): Workspace {
  const ws = createWorkspace()
  ws.variants = [
    {
      id: 'var_a',
      name: 'Backend-leaning',
      composition: partial,
      textOverrides: {},
      application: { status: 'draft', events: [] },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ]
  return ws
}

function compositionOf(ws: Workspace, id = 'var_a'): ResumeVariant['composition'] | undefined {
  return ws.variants.find((v) => v.id === id)?.composition
}

describe('applyVariantSectionCommand', () => {
  describe('reorderSections', () => {
    it('writes only sectionOrder into an empty variant (whole-value materialisation)', () => {
      const ws = workspaceWithVariant()
      const order = [SECTION.skill, SECTION.summary, SECTION.work, SECTION.project, SECTION.oss]

      const result = applyVariantSectionCommand(ws, 'var_a', { type: 'reorderSections', order }, UPDATED_AT)

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['sectionOrder'])
      expect(composition?.sectionOrder).toEqual(order)
      expect(result.variants[0]?.updatedAt).toBe(UPDATED_AT)
    })
  })

  describe('setSectionVisible', () => {
    it('materialises only visibleSections and leaves sectionOrder untouched (AC2)', () => {
      const ws = workspaceWithVariant()

      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'setSectionVisible', id: SECTION.skill, visible: false },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['visibleSections'])
      expect(composition?.visibleSections).toEqual([SECTION.summary, SECTION.work, SECTION.project])
      // The whole-value rule: hiding must NOT drag the master's sectionOrder into
      // the partial — sectionOrder stays inherited until the variant reorders it.
      expect(composition?.sectionOrder).toBeUndefined()
    })

    it('resolves the variant base, so a re-shown section returns to its slot', () => {
      const ws = workspaceWithVariant({ visibleSections: [SECTION.summary, SECTION.work] })

      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'setSectionVisible', id: SECTION.skill, visible: true },
        UPDATED_AT,
      )

      expect(compositionOf(result)?.visibleSections).toEqual([
        SECTION.summary,
        SECTION.work,
        SECTION.skill,
      ])
    })
  })

  describe('moveSection', () => {
    it('resolves the move against the variant order and writes only sectionOrder', () => {
      const ws = workspaceWithVariant({
        sectionOrder: [SECTION.summary, SECTION.project, SECTION.work, SECTION.skill, SECTION.oss],
      })

      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'moveSection', id: SECTION.work, direction: 'up' },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['sectionOrder'])
      expect(composition?.sectionOrder).toEqual([
        SECTION.summary,
        SECTION.work,
        SECTION.project,
        SECTION.skill,
        SECTION.oss,
      ])
    })
  })

  describe('renameSection', () => {
    it('writes only the renamed key into sectionTitles', () => {
      const ws = workspaceWithVariant()

      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'renameSection', id: SECTION.project, title: '产品案例' },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['sectionTitles'])
      expect(composition?.sectionTitles).toEqual({ [SECTION.project]: '产品案例' })
    })

    it('drops the override when renamed back to the inherited base', () => {
      const ws = workspaceWithVariant()
      // sec_work inherits '工作经验' from the master's own rename.
      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'renameSection', id: SECTION.work, title: '工作经验' },
        UPDATED_AT,
      )

      // Nothing differs from the inherited title, so nothing is written.
      expect(compositionOf(result)).toEqual({})
    })

    it('leaves other sections inheriting the master title (AC3)', () => {
      const ws = workspaceWithVariant()
      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'renameSection', id: SECTION.project, title: '产品案例' },
        UPDATED_AT,
      )

      const resolved = resolveComposition(result.master, compositionOf(result))
      expect(resolved.sectionTitles[SECTION.work]).toBe('工作经验')
      expect(resolved.sectionTitles[SECTION.project]).toBe('产品案例')
    })
  })

  describe('inheritance', () => {
    it('a reorder does not freeze the other fields (master edits still flow in)', () => {
      const ws = workspaceWithVariant()
      const result = applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'reorderSections', order: [SECTION.summary, SECTION.work, SECTION.project, SECTION.skill, SECTION.oss] },
        UPDATED_AT,
      )

      const resolved = resolveComposition(result.master, compositionOf(result))
      // The selection records were never materialised, so the resolved copy still
      // tracks the master — including any master edit made after this reorder.
      expect(resolved.entrySelection[SECTION.work]).toEqual([ENTRY.acme, ENTRY.globex, ENTRY.initech])
      expect(resolved.bulletSelection[ENTRY.acme]).toEqual(result.master.bulletSelection[ENTRY.acme])
    })
  })

  describe('edge cases', () => {
    it('is a no-op for an unknown variant id', () => {
      const ws = workspaceWithVariant()
      const result = applyVariantSectionCommand(
        ws,
        'var_gone',
        { type: 'setSectionVisible', id: SECTION.skill, visible: false },
        UPDATED_AT,
      )
      expect(result).toBe(ws)
    })

    it('does not mutate the input workspace', () => {
      const ws = workspaceWithVariant()
      applyVariantSectionCommand(
        ws,
        'var_a',
        { type: 'reorderSections', order: [SECTION.skill, SECTION.summary, SECTION.work, SECTION.project, SECTION.oss] },
        UPDATED_AT,
      )
      expect(ws.variants[0]?.composition).toEqual({})
    })
  })
})
