import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import type { ResumeVariant } from '../../../domain/composition/types'
import { applyVariantCommand } from './variants-store'

// The invariant every test guards: variant CRUD touches `workspace.variants` and
// nothing else. The pool and the master composition must be untouched by every
// command — variants inherit from the master, they never own content.

function variantWith(patch: Partial<ResumeVariant> & { id: ResumeVariant['id'] }): ResumeVariant {
  return {
    name: 'Backend-leaning',
    composition: {},
    textOverrides: {},
    application: { status: 'draft', events: [] },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...patch,
  }
}

describe('applyVariantCommand', () => {
  describe('createVariant', () => {
    it('creates a variant with an empty partial, empty overrides and a draft application', () => {
      const ws = createWorkspace()
      const result = applyVariantCommand(ws, {
        type: 'createVariant',
        id: 'var_new',
        name: 'New',
        createdAt: '2026-08-24T10:00:00.000Z',
      })

      expect(result.variants).toHaveLength(1)
      expect(result.variants[0]).toEqual({
        id: 'var_new',
        name: 'New',
        // AC1: the partial is empty — NOT a copy of the master composition. If
        // this were `{ ...master }`, master edits would stop flowing into the
        // variant and inheritance would be dead on arrival.
        composition: {},
        textOverrides: {},
        application: { status: 'draft', events: [] },
        createdAt: '2026-08-24T10:00:00.000Z',
        updatedAt: '2026-08-24T10:00:00.000Z',
      })
    })

    it('leaves the pool and master untouched', () => {
      const ws = createWorkspace()
      const result = applyVariantCommand(ws, {
        type: 'createVariant',
        id: 'var_new',
        name: 'New',
        createdAt: '2026-08-24T10:00:00.000Z',
      })

      expect(result.pool).toBe(ws.pool)
      expect(result.master).toBe(ws.master)
      expect(ws.variants).toHaveLength(0)
    })
  })

  describe('duplicateVariant', () => {
    it('deep-copies the source partial and text overrides, and starts a fresh application', () => {
      const ws = createWorkspace()
      ws.variants = [
        variantWith({
          id: 'var_src',
          name: 'Source',
          composition: {
            visibleSections: [SECTION.summary, SECTION.work, SECTION.skill],
            sectionTitles: { [SECTION.work]: '工程经历' },
            entrySelection: { [SECTION.work]: [ENTRY.acme, ENTRY.globex] },
            bulletSelection: { [ENTRY.acme]: [BULLET.acme1] },
          },
          textOverrides: { [ENTRY.acme]: 'Staff Engineer' },
        }),
      ]

      const result = applyVariantCommand(ws, {
        type: 'duplicateVariant',
        id: 'var_copy',
        name: 'Copy',
        sourceId: 'var_src',
        createdAt: '2026-08-24T11:00:00.000Z',
      })

      const copy = result.variants.find((v) => v.id === 'var_copy')
      const source = result.variants.find((v) => v.id === 'var_src')
      expect(copy).toBeDefined()
      expect(source).toBeDefined()

      // Equal in value to the source…
      expect(copy?.composition).toEqual(source?.composition)
      expect(copy?.textOverrides).toEqual(source?.textOverrides)

      // …but no reference is shared, so later edits to one never write through.
      expect(copy?.composition).not.toBe(source?.composition)
      expect(copy?.composition?.visibleSections).not.toBe(source?.composition?.visibleSections)
      expect(copy?.composition?.entrySelection).not.toBe(source?.composition?.entrySelection)
      expect(copy?.composition?.entrySelection?.[SECTION.work]).not.toBe(
        source?.composition?.entrySelection?.[SECTION.work],
      )
      expect(copy?.textOverrides).not.toBe(source?.textOverrides)

      // A duplicate is a new application, not a copy of the source's.
      expect(copy?.application).toEqual({ status: 'draft', events: [] })
      expect(copy?.createdAt).toBe('2026-08-24T11:00:00.000Z')
      expect(copy?.updatedAt).toBe('2026-08-24T11:00:00.000Z')
    })

    it('mutating the copy does not affect the source (AC3)', () => {
      const ws = createWorkspace()
      ws.variants = [
        variantWith({
          id: 'var_src',
          name: 'Source',
          composition: {
            entrySelection: { [SECTION.work]: [ENTRY.acme, ENTRY.globex] },
            bulletSelection: { [ENTRY.acme]: [BULLET.acme1] },
          },
          textOverrides: { [ENTRY.acme]: 'Original' },
        }),
      ]

      const result = applyVariantCommand(ws, {
        type: 'duplicateVariant',
        id: 'var_copy',
        name: 'Copy',
        sourceId: 'var_src',
        createdAt: '2026-08-24T11:00:00.000Z',
      })
      const copy = result.variants.find((v) => v.id === 'var_copy')
      const source = result.variants.find((v) => v.id === 'var_src')

      // Simulate the #31 write path on the copy: change a selection and an override.
      copy?.composition?.entrySelection?.[SECTION.work]?.pop()
      if (copy?.textOverrides) copy.textOverrides[ENTRY.acme] = 'Changed'

      expect(source?.composition?.entrySelection?.[SECTION.work]).toEqual([ENTRY.acme, ENTRY.globex])
      expect(source?.textOverrides?.[ENTRY.acme]).toBe('Original')
    })

    it('is a no-op for an unknown source id', () => {
      const ws = createWorkspace()
      const result = applyVariantCommand(ws, {
        type: 'duplicateVariant',
        id: 'var_copy',
        name: 'Copy',
        sourceId: 'var_gone',
        createdAt: '2026-08-24T11:00:00.000Z',
      })
      expect(result).toBe(ws)
    })
  })

  describe('renameVariant', () => {
    it('renames the variant and bumps its updatedAt, leaving others alone', () => {
      const ws = createWorkspace()
      ws.variants = [
        variantWith({ id: 'var_a', name: 'A', updatedAt: '2026-08-01T00:00:00.000Z' }),
        variantWith({ id: 'var_b', name: 'B' }),
      ]

      const result = applyVariantCommand(ws, {
        type: 'renameVariant',
        id: 'var_a',
        name: 'Renamed',
        updatedAt: '2026-08-24T12:00:00.000Z',
      })

      expect(result.variants.find((v) => v.id === 'var_a')?.name).toBe('Renamed')
      expect(result.variants.find((v) => v.id === 'var_a')?.updatedAt).toBe('2026-08-24T12:00:00.000Z')
      expect(result.variants.find((v) => v.id === 'var_b')).toEqual(ws.variants[1])
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      ws.variants = [variantWith({ id: 'var_a', name: 'A' })]
      const result = applyVariantCommand(ws, {
        type: 'renameVariant',
        id: 'var_gone',
        name: 'X',
        updatedAt: '2026-08-24T12:00:00.000Z',
      })
      expect(result.variants).toEqual(ws.variants)
    })
  })

  describe('deleteVariant', () => {
    it('removes only the named variant, leaving the pool and master byte-identical (AC4)', () => {
      const ws = createWorkspace()
      ws.variants = [
        variantWith({ id: 'var_a', name: 'A' }),
        variantWith({ id: 'var_b', name: 'B' }),
      ]

      const result = applyVariantCommand(ws, { type: 'deleteVariant', id: 'var_a' })

      expect(result.variants.map((v) => v.id)).toEqual(['var_b'])
      // Reference equality is the byte-identical guarantee: neither the pool nor
      // the master object is even recreated.
      expect(result.pool).toBe(ws.pool)
      expect(result.master).toBe(ws.master)
      expect(result.variants[0]).toBe(ws.variants[1])
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      ws.variants = [variantWith({ id: 'var_a', name: 'A' })]
      const result = applyVariantCommand(ws, { type: 'deleteVariant', id: 'var_gone' })
      expect(result.variants).toEqual(ws.variants)
    })
  })
})
