import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import type { ResumeVariant, Workspace } from '../../../domain/composition/types'
import { applyEntryCommand } from '../entries/entries-store'
import { applySectionCommand } from '../sections/sections-store'
import {
  affectedVariantsByBullet,
  affectedVariantsByEntry,
  affectedVariantsBySection,
  removalIds,
} from './removal'

/**
 * Issue #26 — master-side deletion crosses every resume. The cleanup must strip
 * the removed ids from each variant's partial, and the impact must be computed
 * through the *render result* (`resolveComposition` + `buildRenderModel`), not by
 * reading a variant's raw `composition` partial.
 */

function makeVariant(overrides: Partial<ResumeVariant> = {}): ResumeVariant {
  return {
    id: 'var_a',
    name: '变体 A',
    composition: {},
    textOverrides: {},
    application: { status: 'draft', events: [] },
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  }
}

function withVariants(ws: Workspace, variants: ResumeVariant[]): Workspace {
  ws.variants = variants
  return ws
}

describe('removeEntry cleans variants', () => {
  it('filters the materialised selection, drops the bullet key, and clears text overrides', () => {
    const ws = withVariants(createWorkspace(), [
      makeVariant({
        id: 'var_mat',
        name: '已具化',
        composition: {
          entrySelection: { [SECTION.work]: [ENTRY.acme, ENTRY.globex] },
          bulletSelection: { [ENTRY.acme]: [BULLET.acme1, BULLET.acme3] },
        },
        textOverrides: { [ENTRY.acme]: 'Reworded title', [BULLET.acme1]: 'Reworded bullet' },
      }),
    ])

    const result = applyEntryCommand(ws, { type: 'removeEntry', id: ENTRY.acme })
    const variant = result.variants.find((v) => v.id === 'var_mat')!

    // The section's selection keeps the entries it still names, and the entry's
    // whole bullet-selection key is gone (the entry no longer exists).
    expect(variant.composition.entrySelection?.[SECTION.work]).toEqual([ENTRY.globex])
    expect(variant.composition.bulletSelection?.[ENTRY.acme]).toBeUndefined()
    // Text overrides for both the entry and its bullets are cleared.
    expect(variant.textOverrides[ENTRY.acme]).toBeUndefined()
    expect(variant.textOverrides[BULLET.acme1]).toBeUndefined()
  })

  it('leaves an inheriting variant untouched (nothing materialised to clean)', () => {
    const ws = withVariants(createWorkspace(), [makeVariant({ id: 'var_inherit', name: '继承中' })])

    const result = applyEntryCommand(ws, { type: 'removeEntry', id: ENTRY.acme })
    const variant = result.variants.find((v) => v.id === 'var_inherit')!

    expect(variant.composition).toEqual({})
    expect(variant.textOverrides).toEqual({})
  })
})

describe('removeBullet cleans variants', () => {
  it('filters the bullet out of the materialised selection and clears its override', () => {
    const ws = withVariants(createWorkspace(), [
      makeVariant({
        id: 'var_mat',
        name: '已具化',
        composition: { bulletSelection: { [ENTRY.acme]: [BULLET.acme1, BULLET.acme3] } },
        textOverrides: { [BULLET.acme1]: 'Reworded bullet' },
      }),
    ])

    const result = applyEntryCommand(ws, { type: 'removeBullet', entryId: ENTRY.acme, id: BULLET.acme1 })
    const variant = result.variants.find((v) => v.id === 'var_mat')!

    expect(variant.composition.bulletSelection?.[ENTRY.acme]).toEqual([BULLET.acme3])
    expect(variant.textOverrides[BULLET.acme1]).toBeUndefined()
  })
})

describe('removeCustomSection cleans variants', () => {
  it('drops the section from order/visibility/titles/selection and clears overrides', () => {
    const ws = withVariants(createWorkspace(), [
      makeVariant({
        id: 'var_mat',
        name: '已具化',
        composition: {
          sectionOrder: [SECTION.summary, SECTION.work, SECTION.oss],
          visibleSections: [SECTION.summary, SECTION.work, SECTION.oss],
          sectionTitles: { [SECTION.oss]: '开源' },
          entrySelection: { [SECTION.oss]: [ENTRY.oss] },
          bulletSelection: { [ENTRY.oss]: [BULLET.oss1] },
        },
        textOverrides: {
          [SECTION.oss]: 'section body override',
          [ENTRY.oss]: 'entry override',
          [BULLET.oss1]: 'bullet override',
        },
      }),
    ])

    const result = applySectionCommand(ws, { type: 'removeCustomSection', id: SECTION.oss })
    const variant = result.variants.find((v) => v.id === 'var_mat')!

    expect(variant.composition.sectionOrder).not.toContain(SECTION.oss)
    expect(variant.composition.visibleSections).not.toContain(SECTION.oss)
    expect(variant.composition.sectionTitles?.[SECTION.oss]).toBeUndefined()
    expect(variant.composition.entrySelection?.[SECTION.oss]).toBeUndefined()
    expect(variant.composition.bulletSelection?.[ENTRY.oss]).toBeUndefined()
    expect(variant.textOverrides[SECTION.oss]).toBeUndefined()
    expect(variant.textOverrides[ENTRY.oss]).toBeUndefined()
    expect(variant.textOverrides[BULLET.oss1]).toBeUndefined()
  })
})

describe('affectedVariantsByEntry (impact via render result)', () => {
  it('counts an inheriting variant — no entrySelection key — through the render result', () => {
    // This is the AC4 guard: a variant whose partial has no `entrySelection` key
    // still renders the master's selection, so it must be counted. Reading
    // `variant.composition.entrySelection` directly would miss it.
    const ws = withVariants(createWorkspace(), [
      makeVariant({ id: 'var_inherit', name: '继承中' }),
      makeVariant({
        id: 'var_mat',
        name: '已具化',
        composition: { entrySelection: { [SECTION.work]: [ENTRY.acme, ENTRY.globex] } },
      }),
      makeVariant({
        id: 'var_dropped',
        name: '已取消',
        composition: { entrySelection: { [SECTION.work]: [ENTRY.globex, ENTRY.initech] } },
      }),
    ])

    expect(affectedVariantsByEntry(ws, ENTRY.acme)).toEqual(['继承中', '已具化'])
  })

  it('returns an empty list when no variant renders the entry (AC2)', () => {
    const ws = withVariants(createWorkspace(), [
      makeVariant({ id: 'var_dropped', name: '已取消', composition: { entrySelection: { [SECTION.work]: [ENTRY.globex] } } }),
    ])

    expect(affectedVariantsByEntry(ws, ENTRY.acme)).toEqual([])
  })
})

describe('affectedVariantsByBullet', () => {
  it('counts the inheriting variant but not one that dropped the bullet', () => {
    const ws = withVariants(createWorkspace(), [
      makeVariant({ id: 'var_inherit', name: '继承中' }),
      makeVariant({
        id: 'var_dropped',
        name: '已取消',
        composition: { bulletSelection: { [ENTRY.acme]: [BULLET.acme3] } },
      }),
    ])

    expect(affectedVariantsByBullet(ws, BULLET.acme1)).toEqual(['继承中'])
  })
})

describe('affectedVariantsBySection', () => {
  it('counts only the variant whose render shows the section', () => {
    // sec_oss is hidden in the master; the inheriting variant stays hidden while
    // the re-shown one renders it.
    const ws = createWorkspace()
    ws.variants = [
      makeVariant({
        id: 'var_shows',
        name: '显示',
        composition: { visibleSections: [...ws.master.visibleSections, SECTION.oss] },
      }),
      makeVariant({ id: 'var_inherit', name: '继承中' }),
    ]

    expect(affectedVariantsBySection(ws, SECTION.oss)).toEqual(['显示'])
  })
})

describe('removalIds registry (AC6)', () => {
  it('has a handler for exactly the three pool-removal commands', () => {
    // The real guarantee is the mapped type on `removalIds` in removal.ts: the
    // key set is `PoolRemovalCommand['type']`, so a fourth removal command
    // without a handler fails to compile. This assertion pins the current
    // surface and would also flag a growth at runtime.
    expect(Object.keys(removalIds).sort()).toEqual(['removeBullet', 'removeCustomSection', 'removeEntry'])
  })

  it('removeEntry reports the entry and every bullet it owns', () => {
    const ws = createWorkspace()
    expect(removalIds.removeEntry(ws, { type: 'removeEntry', id: ENTRY.acme })).toEqual({
      entries: new Set([ENTRY.acme]),
      bullets: new Set([BULLET.acme1, BULLET.acme2, BULLET.acme3]),
      sections: new Set(),
    })
  })

  it('removeBullet reports just the bullet', () => {
    const ws = createWorkspace()
    expect(removalIds.removeBullet(ws, { type: 'removeBullet', entryId: ENTRY.acme, id: BULLET.acme1 })).toEqual({
      entries: new Set(),
      bullets: new Set([BULLET.acme1]),
      sections: new Set(),
    })
  })

  it('removeCustomSection reports the section, its entries and their bullets', () => {
    const ws = createWorkspace()
    expect(removalIds.removeCustomSection(ws, { type: 'removeCustomSection', id: SECTION.oss })).toEqual({
      entries: new Set([ENTRY.oss]),
      bullets: new Set([BULLET.oss1]),
      sections: new Set([SECTION.oss]),
    })
  })
})
