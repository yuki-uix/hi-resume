import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import type { ResumeVariant, Workspace } from '../../../domain/composition/types'
import { parseWorkspaceFile, serializeWorkspace } from '../../export/json'
import { applyVariantTextOverrideCommand } from './text-overrides-store'

// The invariant every test here guards: a text override is a whole-value
// replacement stored on `variant.textOverrides` and *only* there — the shared
// pool is never written, and clearing is a `delete`, not an `undefined`
// assignment, so the meaning survives a JSON round trip.

const UPDATED_AT = '2026-08-24T12:00:00.000Z'

function workspaceWithVariants(
  ...partials: Array<{ id: string; textOverrides: ResumeVariant['textOverrides'] }>
): Workspace {
  const ws = createWorkspace()
  ws.variants = partials.map(({ id, textOverrides }) => ({
    id,
    name: `Variant ${id}`,
    composition: {},
    textOverrides,
    application: { status: 'draft', events: [] },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }))
  return ws
}

function textOverridesOf(ws: Workspace, id = 'var_a'): ResumeVariant['textOverrides'] | undefined {
  return ws.variants.find((v) => v.id === id)?.textOverrides
}

describe('applyVariantTextOverrideCommand', () => {
  describe('setTextOverride', () => {
    it('writes only the variant textOverrides and never the pool (AC1)', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })

      const result = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: BULLET.acme1, text: 'Reworded for a design role.' },
        UPDATED_AT,
      )

      expect(result.pool.bullets[BULLET.acme1]?.text).toBe(
        'Led the migration of the billing service to event sourcing.',
      )
      expect(textOverridesOf(result)?.[BULLET.acme1]).toBe('Reworded for a design role.')
      expect(result.variants[0]?.updatedAt).toBe(UPDATED_AT)
    })

    it('overrides an entry title and a text-section body through the same id key', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })

      const result = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: ENTRY.acme, text: 'Staff Product Engineer' },
        UPDATED_AT,
      )
      const second = applyVariantTextOverrideCommand(
        result,
        'var_a',
        { type: 'setTextOverride', id: SECTION.summary, text: 'Backend-leaning engineer.' },
        UPDATED_AT,
      )

      expect(textOverridesOf(second)).toEqual({
        [ENTRY.acme]: 'Staff Product Engineer',
        [SECTION.summary]: 'Backend-leaning engineer.',
      })
      // Neither the entry's pool title nor the section's pool text moved.
      expect(second.pool.entries[ENTRY.acme]?.title).toBe('Senior Product Engineer')
      expect(second.pool.sections[SECTION.summary]?.text).toBe(
        'Product engineer with eight years building tools people use daily.',
      )
    })

    it('stores the empty string as a real override, not "no override" (AC5)', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })

      const result = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: BULLET.acme1, text: '' },
        UPDATED_AT,
      )

      expect(textOverridesOf(result)?.[BULLET.acme1]).toBe('')
      // The key exists with an empty value — `??` renders it as empty rather
      // than falling back to the pool text.
      expect(Object.prototype.hasOwnProperty.call(textOverridesOf(result), BULLET.acme1)).toBe(true)
    })
  })

  describe('clearTextOverride', () => {
    it('deletes the key, leaving no undefined or empty-string residue (AC3)', () => {
      const ws = workspaceWithVariants({
        id: 'var_a',
        textOverrides: { [BULLET.acme1]: 'Reworded.' },
      })

      const result = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'clearTextOverride', id: BULLET.acme1 },
        UPDATED_AT,
      )

      expect(Object.keys(textOverridesOf(result) ?? {})).toEqual([])
      expect(Object.prototype.hasOwnProperty.call(textOverridesOf(result), BULLET.acme1)).toBe(false)
    })

    it('is a no-op clearing a key that is not overridden', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })

      const result = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'clearTextOverride', id: BULLET.acme1 },
        UPDATED_AT,
      )

      expect(textOverridesOf(result)).toEqual({})
    })
  })

  describe('round trip', () => {
    it('keeps a cleared override inherited after export → import (AC3)', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })
      const overridden = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: BULLET.acme1, text: 'Reworded.' },
        UPDATED_AT,
      )
      const cleared = applyVariantTextOverrideCommand(
        overridden,
        'var_a',
        { type: 'clearTextOverride', id: BULLET.acme1 },
        UPDATED_AT,
      )

      const imported = parseWorkspaceFile(serializeWorkspace(cleared))
      if (!imported.ok) throw new Error('expected the exported workspace to parse')

      const textOverrides = imported.workspace.variants[0]?.textOverrides ?? {}
      expect(Object.prototype.hasOwnProperty.call(textOverrides, BULLET.acme1)).toBe(false)
      expect(textOverrides).toEqual({})
    })

    it('keeps an empty-string override empty after export → import, not inherited', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })
      const overridden = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: BULLET.acme1, text: '' },
        UPDATED_AT,
      )

      const imported = parseWorkspaceFile(serializeWorkspace(overridden))
      if (!imported.ok) throw new Error('expected the exported workspace to parse')

      expect(imported.workspace.variants[0]?.textOverrides[BULLET.acme1]).toBe('')
    })
  })

  describe('inheritance', () => {
    it('editing one variant leaves the other variants and the master untouched (AC2)', () => {
      const ws = workspaceWithVariants(
        { id: 'var_a', textOverrides: {} },
        { id: 'var_b', textOverrides: {} },
      )

      const result = applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: BULLET.acme1, text: 'Reworded.' },
        UPDATED_AT,
      )

      expect(textOverridesOf(result, 'var_b')).toEqual({})
      expect(result.master).toBe(ws.master)
      expect(result.pool).toBe(ws.pool)
    })
  })

  describe('edge cases', () => {
    it('is a no-op for an unknown variant id', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })
      const result = applyVariantTextOverrideCommand(
        ws,
        'var_gone',
        { type: 'setTextOverride', id: BULLET.acme1, text: 'Reworded.' },
        UPDATED_AT,
      )
      expect(result).toBe(ws)
    })

    it('does not mutate the input workspace', () => {
      const ws = workspaceWithVariants({ id: 'var_a', textOverrides: {} })
      applyVariantTextOverrideCommand(
        ws,
        'var_a',
        { type: 'setTextOverride', id: BULLET.acme1, text: 'Reworded.' },
        UPDATED_AT,
      )
      expect(ws.variants[0]?.textOverrides).toEqual({})
    })
  })
})
