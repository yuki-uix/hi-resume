import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../../../domain/__fixtures__/workspace'
import { asBulletId, asEntryId, asSectionId } from '../../../domain/pool/ids'
import { applyEntryCommand } from './entries-store'

// The invariant every test guards: entry and bullet state lives in the pool plus
// the composition fields that own entry/bullet shape — `entrySelection` and
// `bulletSelection`. There is no parallel "entry list" or "bullet list" array
// anywhere, and selection/order reference IDs, never indices.

describe('applyEntryCommand', () => {
  describe('addEntry', () => {
    it('adds a blank entry to the pool and appends it to the section selection', () => {
      const ws = createWorkspace()
      const id = asEntryId('ent_new')
      const result = applyEntryCommand(ws, { type: 'addEntry', sectionId: SECTION.work, id })

      expect(result.pool.entries[id]).toEqual({
        id,
        sectionId: SECTION.work,
        title: '',
        bulletIds: [],
      })
      expect(result.master.entrySelection[SECTION.work]?.at(-1)).toBe(id)
      expect(result.master.bulletSelection[id]).toEqual([])
    })

    it('does not mutate the input workspace', () => {
      const ws = createWorkspace()
      const original = [...ws.master.entrySelection[SECTION.work] ?? []]
      applyEntryCommand(ws, { type: 'addEntry', sectionId: SECTION.work, id: asEntryId('ent_new') })
      expect(ws.master.entrySelection[SECTION.work]).toEqual(original)
      expect(ws.pool.entries[asEntryId('ent_new')]).toBeUndefined()
    })
  })

  describe('removeEntry', () => {
    it('removes the entry, its bullets and every composition reference', () => {
      const ws = createWorkspace()
      // ent_initech owns exactly bul_initech_1, selected in full.
      const result = applyEntryCommand(ws, { type: 'removeEntry', id: ENTRY.initech })

      expect(result.pool.entries[ENTRY.initech]).toBeUndefined()
      expect(result.pool.bullets[BULLET.initech1]).toBeUndefined()
      expect(result.master.entrySelection[SECTION.work]).toEqual([ENTRY.acme, ENTRY.globex])
      expect(result.master.bulletSelection[ENTRY.initech]).toBeUndefined()
    })

    it('removes bullets that were never selected too', () => {
      const ws = createWorkspace()
      // ent_acme owns three bullets but only selects two; both must go.
      const result = applyEntryCommand(ws, { type: 'removeEntry', id: ENTRY.acme })

      expect(result.pool.bullets[BULLET.acme1]).toBeUndefined()
      expect(result.pool.bullets[BULLET.acme2]).toBeUndefined()
      expect(result.pool.bullets[BULLET.acme3]).toBeUndefined()
    })

    it('leaves other sections untouched', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'removeEntry', id: ENTRY.initech })

      expect(result.master.entrySelection[SECTION.project]).toEqual([ENTRY.atlas, ENTRY.beacon])
      expect(result.pool.entries[ENTRY.atlas]).toBeDefined()
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'removeEntry', id: asEntryId('ent_gone') })
      expect(result).toBe(ws)
    })
  })

  describe('reorderEntries', () => {
    it('replaces the section selection order and nothing else', () => {
      const ws = createWorkspace()
      const before = ws.master.entrySelection[SECTION.project]
      const result = applyEntryCommand(ws, {
        type: 'reorderEntries',
        sectionId: SECTION.work,
        order: [ENTRY.initech, ENTRY.acme, ENTRY.globex],
      })

      expect(result.master.entrySelection[SECTION.work]).toEqual([
        ENTRY.initech,
        ENTRY.acme,
        ENTRY.globex,
      ])
      expect(result.master.entrySelection[SECTION.project]).toEqual(before)
      expect(result.pool.entries).toBe(ws.pool.entries)
    })
  })

  describe('setEntryTitle', () => {
    it('updates the title and leaves the rest of the entry alone', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setEntryTitle', id: ENTRY.acme, title: 'Staff Engineer' })

      expect(result.pool.entries[ENTRY.acme]?.title).toBe('Staff Engineer')
      expect(result.pool.entries[ENTRY.acme]?.subtitle).toBe('Acme Corp')
      expect(result.pool.entries[ENTRY.acme]?.bulletIds).toEqual(ws.pool.entries[ENTRY.acme]?.bulletIds)
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setEntryTitle', id: asEntryId('ent_gone'), title: 'x' })
      expect(result).toBe(ws)
    })
  })

  describe('setEntrySubtitle', () => {
    it('sets the subtitle', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setEntrySubtitle', id: ENTRY.beacon, subtitle: 'ACME' })
      expect(result.pool.entries[ENTRY.beacon]?.subtitle).toBe('ACME')
    })

    it('clears the subtitle on an empty string (no subtitle, not an empty line)', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setEntrySubtitle', id: ENTRY.acme, subtitle: '' })
      expect(result.pool.entries[ENTRY.acme]?.subtitle).toBeUndefined()
    })
  })

  describe('setEntryPeriod', () => {
    it('sets a full period', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, {
        type: 'setEntryPeriod',
        id: ENTRY.acme,
        period: { start: '2022-03', end: '2024-01' },
      })
      expect(result.pool.entries[ENTRY.acme]?.period).toEqual({ start: '2022-03', end: '2024-01' })
    })

    it('clears the period on null', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setEntryPeriod', id: ENTRY.globex, period: null })
      expect(result.pool.entries[ENTRY.globex]?.period).toBeUndefined()
    })
  })

  describe('addBullet', () => {
    it('appends a blank bullet to the pool, the entry and its selection', () => {
      const ws = createWorkspace()
      const id = asBulletId('bul_new')
      const result = applyEntryCommand(ws, { type: 'addBullet', entryId: ENTRY.acme, id })

      expect(result.pool.bullets[id]).toEqual({ id, text: '' })
      expect(result.pool.entries[ENTRY.acme]?.bulletIds.at(-1)).toBe(id)
      expect(result.master.bulletSelection[ENTRY.acme]?.at(-1)).toBe(id)
    })

    it('is a no-op for an unknown entry', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'addBullet', entryId: asEntryId('ent_gone'), id: asBulletId('bul_new') })
      expect(result).toBe(ws)
    })
  })

  describe('removeBullet', () => {
    it('removes the bullet from the pool, the entry and the selection', () => {
      const ws = createWorkspace()
      // ent_acme selects [acme3, acme1] and owns all three.
      const result = applyEntryCommand(ws, { type: 'removeBullet', entryId: ENTRY.acme, id: BULLET.acme1 })

      expect(result.pool.bullets[BULLET.acme1]).toBeUndefined()
      expect(result.pool.entries[ENTRY.acme]?.bulletIds).toEqual([BULLET.acme2, BULLET.acme3])
      expect(result.master.bulletSelection[ENTRY.acme]).toEqual([BULLET.acme3])
    })

    it('removes a bullet that was never selected', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'removeBullet', entryId: ENTRY.acme, id: BULLET.acme2 })

      expect(result.pool.bullets[BULLET.acme2]).toBeUndefined()
      expect(result.master.bulletSelection[ENTRY.acme]).toEqual([BULLET.acme3, BULLET.acme1])
    })

    it('is a no-op when the bullet belongs to a different entry', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'removeBullet', entryId: ENTRY.globex, id: BULLET.acme1 })
      expect(result).toBe(ws)
      expect(ws.pool.bullets[BULLET.acme1]).toBeDefined()
    })
  })

  describe('reorderBullets', () => {
    it('replaces the bullet selection order and nothing else', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, {
        type: 'reorderBullets',
        entryId: ENTRY.acme,
        order: [BULLET.acme1, BULLET.acme3],
      })

      expect(result.master.bulletSelection[ENTRY.acme]).toEqual([BULLET.acme1, BULLET.acme3])
      expect(result.pool.entries[ENTRY.acme]?.bulletIds).toEqual(ws.pool.entries[ENTRY.acme]?.bulletIds)
    })
  })

  describe('setBulletText', () => {
    it('updates the bullet text', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setBulletText', id: BULLET.acme1, text: 'New text' })
      expect(result.pool.bullets[BULLET.acme1]?.text).toBe('New text')
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, { type: 'setBulletText', id: asBulletId('bul_gone'), text: 'x' })
      expect(result).toBe(ws)
    })
  })

  describe('setBasics', () => {
    it('replaces basics and shallow-copies links', () => {
      const ws = createWorkspace()
      const next = {
        name: 'Ada Chen',
        headline: 'Staff Engineer',
        links: [{ label: 'GitHub', url: 'https://github.com/example' }],
      }
      const result = applyEntryCommand(ws, { type: 'setBasics', basics: next })

      expect(result.pool.basics).toEqual(next)
      expect(result.pool.basics.links).not.toBe(next.links)
      expect(result.pool.basics.links?.[0]).not.toBe(next.links[0])
    })

    it('does not mutate the input workspace', () => {
      const ws = createWorkspace()
      applyEntryCommand(ws, {
        type: 'setBasics',
        basics: { name: 'Ada Chen', headline: 'Staff Engineer' },
      })
      expect(ws.pool.basics.headline).toBe('Product Engineer')
    })
  })

  describe('setSectionText', () => {
    it('writes the body text of a text-layout section', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, {
        type: 'setSectionText',
        sectionId: SECTION.summary,
        text: 'New summary.',
      })
      expect(result.pool.sections[SECTION.summary]?.text).toBe('New summary.')
    })

    it('is a no-op for an unknown id', () => {
      const ws = createWorkspace()
      const result = applyEntryCommand(ws, {
        type: 'setSectionText',
        sectionId: asSectionId('sec_gone'),
        text: 'x',
      })
      expect(result).toBe(ws)
    })
  })
})
