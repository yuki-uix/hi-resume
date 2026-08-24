import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import { resolveComposition } from '../../../domain/composition/resolve'
import type { ResumeVariant, Workspace } from '../../../domain/composition/types'
import { applyVariantEntryCommand } from './entries-store'

// The invariant every test here guards: the variant write path copy-on-writes at
// the inheritance granularity of each field. `entrySelection` is per-`SectionId`,
// `bulletSelection` is per-`EntryId` — and only the touched list is materialised
// into the partial. Writing the whole resolved composition back would freeze the
// partial into a master snapshot and kill inheritance, so `Object.keys` is
// asserted exactly.

const UPDATED_AT = '2026-08-24T12:00:00.000Z'

function workspaceWithVariants(...partials: Array<{ id: string; composition: ResumeVariant['composition'] }>): Workspace {
  const ws = createWorkspace()
  ws.variants = partials.map(({ id, composition }) => ({
    id,
    name: `Variant ${id}`,
    composition,
    textOverrides: {},
    application: { status: 'draft', events: [] },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }))
  return ws
}

function compositionOf(ws: Workspace, id = 'var_a'): ResumeVariant['composition'] | undefined {
  return ws.variants.find((v) => v.id === id)?.composition
}

describe('applyVariantEntryCommand', () => {
  describe('reorderEntries', () => {
    it('AC1: an empty variant + reorderEntries writes exactly [entrySelection] and exactly [S]', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const order = [ENTRY.initech, ENTRY.acme, ENTRY.globex]

      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'reorderEntries', sectionId: SECTION.work, order },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['entrySelection'])
      expect(Object.keys(composition?.entrySelection ?? {}).sort()).toEqual([SECTION.work])
      expect(composition?.entrySelection?.[SECTION.work]).toEqual(order)
      expect(result.variants[0]?.updatedAt).toBe(UPDATED_AT)
    })
  })

  describe('setEntrySelected', () => {
    it('resolves the master list, toggles, and writes only that section', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })

      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'setEntrySelected', sectionId: SECTION.work, id: ENTRY.globex, selected: false },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['entrySelection'])
      expect(Object.keys(composition?.entrySelection ?? {}).sort()).toEqual([SECTION.work])
      expect(composition?.entrySelection?.[SECTION.work]).toEqual([ENTRY.acme, ENTRY.initech])
    })

    it('re-selecting an entry writes it back into the variant list', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const deselected = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'setEntrySelected', sectionId: SECTION.work, id: ENTRY.globex, selected: false },
        UPDATED_AT,
      )
      const reselected = applyVariantEntryCommand(
        deselected,
        'var_a',
        { type: 'setEntrySelected', sectionId: SECTION.work, id: ENTRY.globex, selected: true },
        UPDATED_AT,
      )

      expect(compositionOf(reselected)?.entrySelection?.[SECTION.work]).toEqual([
        ENTRY.acme,
        ENTRY.initech,
        ENTRY.globex,
      ])
    })

    it('is a no-op when the state already matches', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'setEntrySelected', sectionId: SECTION.work, id: ENTRY.acme, selected: true },
        UPDATED_AT,
      )
      expect(result).toBe(ws)
    })

    it('refuses to place an entry in a section it does not belong to', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'setEntrySelected', sectionId: SECTION.project, id: ENTRY.acme, selected: false },
        UPDATED_AT,
      )
      expect(result).toBe(ws)
    })
  })

  describe('reorderBullets', () => {
    it('writes only bulletSelection and only that entry', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const order = [BULLET.acme1, BULLET.acme3]

      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'reorderBullets', entryId: ENTRY.acme, order },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['bulletSelection'])
      expect(Object.keys(composition?.bulletSelection ?? {}).sort()).toEqual([ENTRY.acme])
      expect(composition?.bulletSelection?.[ENTRY.acme]).toEqual(order)
    })
  })

  describe('setBulletSelected', () => {
    it('resolves the master list, toggles, and writes only that entry', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })

      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'setBulletSelected', entryId: ENTRY.acme, id: BULLET.acme1, selected: false },
        UPDATED_AT,
      )

      const composition = compositionOf(result)
      expect(Object.keys(composition ?? {}).sort()).toEqual(['bulletSelection'])
      expect(Object.keys(composition?.bulletSelection ?? {}).sort()).toEqual([ENTRY.acme])
      expect(composition?.bulletSelection?.[ENTRY.acme]).toEqual([BULLET.acme3])
    })

    it('refuses to place a bullet in an entry that does not own it', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'setBulletSelected', entryId: ENTRY.globex, id: BULLET.acme1, selected: false },
        UPDATED_AT,
      )
      expect(result).toBe(ws)
    })
  })

  describe('inheritance', () => {
    it('sections the variant never touched still inherit the master selection (AC3)', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'reorderEntries', sectionId: SECTION.work, order: [ENTRY.initech, ENTRY.acme, ENTRY.globex] },
        UPDATED_AT,
      )

      const resolved = resolveComposition(result.master, compositionOf(result))
      expect(resolved.entrySelection[SECTION.project]).toEqual([ENTRY.atlas, ENTRY.beacon])
      expect(resolved.entrySelection[SECTION.skill]).toEqual([ENTRY.skills])
      // The touched list reflects the override, the rest stays master-faithful.
      expect(resolved.entrySelection[SECTION.work]).toEqual([ENTRY.initech, ENTRY.acme, ENTRY.globex])
    })

    it('two variants stay independent — editing one writes only that one (AC5)', () => {
      const ws = workspaceWithVariants(
        { id: 'var_a', composition: {} },
        { id: 'var_b', composition: {} },
      )

      const result = applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'reorderEntries', sectionId: SECTION.work, order: [ENTRY.globex, ENTRY.acme, ENTRY.initech] },
        UPDATED_AT,
      )

      expect(compositionOf(result, 'var_b')).toEqual({})
      expect(compositionOf(result, 'var_a')?.entrySelection?.[SECTION.work]).toEqual([
        ENTRY.globex,
        ENTRY.acme,
        ENTRY.initech,
      ])
      expect(result.master).toBe(ws.master)
    })
  })

  describe('edge cases', () => {
    it('is a no-op for an unknown variant id', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      const result = applyVariantEntryCommand(
        ws,
        'var_gone',
        { type: 'reorderEntries', sectionId: SECTION.work, order: [ENTRY.acme] },
        UPDATED_AT,
      )
      expect(result).toBe(ws)
    })

    it('does not mutate the input workspace', () => {
      const ws = workspaceWithVariants({ id: 'var_a', composition: {} })
      applyVariantEntryCommand(
        ws,
        'var_a',
        { type: 'reorderEntries', sectionId: SECTION.work, order: [ENTRY.globex, ENTRY.acme, ENTRY.initech] },
        UPDATED_AT,
      )
      expect(ws.variants[0]?.composition).toEqual({})
    })
  })
})
