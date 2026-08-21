import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createMasterComposition } from '../__fixtures__/workspace'
import { asBulletId, asEntryId, asSectionId } from '../pool/ids'
import { resolveComposition } from './resolve'
import type { ResumeComposition } from './types'

// Every expected value below is written out by hand. Nothing in this file calls
// `resolveComposition` to work out what `resolveComposition` should return.

describe('resolveComposition', () => {
  describe('with no variant', () => {
    it('returns a composition deep-equal to the master', () => {
      const result = resolveComposition(createMasterComposition(), undefined)

      expect(result).toStrictEqual(createMasterComposition())
    })

    it('shares no arrays or records with the master', () => {
      const master = createMasterComposition()
      const result = resolveComposition(master)

      result.sectionOrder.push(asSectionId('sec_award'))
      result.visibleSections.push(asSectionId('sec_award'))
      result.sectionTitles[SECTION.project] = 'mutated'
      result.entrySelection[SECTION.work]?.push(asEntryId('ent_new'))
      result.bulletSelection[ENTRY.acme]?.push(asBulletId('bul_new'))

      expect(master.sectionOrder).toEqual([
        'sec_summary',
        'sec_work',
        'sec_project',
        'sec_skill',
        'sec_oss',
      ])
      expect(master.visibleSections).toEqual([
        'sec_summary',
        'sec_work',
        'sec_project',
        'sec_skill',
      ])
      expect(master.sectionTitles).toEqual({ sec_work: '工作经验' })
      expect(master.entrySelection[SECTION.work]).toEqual([
        'ent_acme',
        'ent_globex',
        'ent_initech',
      ])
      expect(master.bulletSelection[ENTRY.acme]).toEqual(['bul_acme_3', 'bul_acme_1'])
    })
  })

  describe('entrySelection: per-SectionId fallback', () => {
    it('takes the variant value for the section it changed and the master value for the rest', () => {
      const result = resolveComposition(createMasterComposition(), {
        entrySelection: { [SECTION.work]: [ENTRY.initech, ENTRY.acme] },
      })

      expect(result.entrySelection).toEqual({
        sec_work: ['ent_initech', 'ent_acme'],
        sec_project: ['ent_atlas', 'ent_beacon'],
        sec_skill: ['ent_skills'],
        sec_oss: ['ent_oss'],
      })
    })

    it('keeps an empty selection from the variant instead of falling back', () => {
      const result = resolveComposition(createMasterComposition(), {
        entrySelection: { [SECTION.project]: [] },
      })

      expect(result.entrySelection).toEqual({
        sec_work: ['ent_acme', 'ent_globex', 'ent_initech'],
        sec_project: [],
        sec_skill: ['ent_skills'],
        sec_oss: ['ent_oss'],
      })
    })

    it('adds a section the master never selected entries for', () => {
      const result = resolveComposition(createMasterComposition(), {
        entrySelection: { [asSectionId('sec_award')]: [asEntryId('ent_award')] },
      })

      expect(result.entrySelection).toEqual({
        sec_work: ['ent_acme', 'ent_globex', 'ent_initech'],
        sec_project: ['ent_atlas', 'ent_beacon'],
        sec_skill: ['ent_skills'],
        sec_oss: ['ent_oss'],
        sec_award: ['ent_award'],
      })
    })
  })

  describe('bulletSelection: per-EntryId fallback', () => {
    it('takes the variant value for the entry it changed and the master value for the rest', () => {
      const result = resolveComposition(createMasterComposition(), {
        bulletSelection: { [ENTRY.acme]: [BULLET.acme2] },
      })

      expect(result.bulletSelection).toEqual({
        ent_acme: ['bul_acme_2'],
        ent_globex: ['bul_globex_1', 'bul_globex_2'],
        ent_initech: ['bul_initech_1'],
        ent_atlas: ['bul_atlas_1'],
        ent_beacon: ['bul_beacon_1'],
        ent_skills: ['bul_skills_1', 'bul_skills_2'],
        ent_oss: ['bul_oss_1'],
      })
    })
  })

  describe('sectionTitles: per-SectionId fallback', () => {
    it('keeps the master title for sections the variant did not rename', () => {
      const master = createMasterComposition()
      master.sectionTitles = {
        [SECTION.work]: '工作经验',
        [SECTION.project]: '项目经历（精选）',
      }

      const result = resolveComposition(master, {
        sectionTitles: { [SECTION.work]: 'Relevant Experience' },
      })

      expect(result.sectionTitles).toEqual({
        sec_work: 'Relevant Experience',
        sec_project: '项目经历（精选）',
      })
    })
  })

  describe('sectionOrder and visibleSections: whole-value replacement', () => {
    it('drops sections the master added after the variant set its own order', () => {
      const master = createMasterComposition()
      // The master gains a section after the variant already reordered.
      master.sectionOrder = [...master.sectionOrder, asSectionId('sec_award')]
      master.visibleSections = [...master.visibleSections, asSectionId('sec_award')]

      const result = resolveComposition(master, {
        sectionOrder: [SECTION.work, SECTION.project, SECTION.summary],
      })

      expect(result.sectionOrder).toEqual(['sec_work', 'sec_project', 'sec_summary'])
    })

    it('replaces visibleSections wholesale', () => {
      const result = resolveComposition(createMasterComposition(), {
        visibleSections: [SECTION.work, SECTION.oss],
      })

      expect(result.visibleSections).toEqual(['sec_work', 'sec_oss'])
      // Untouched: this variant did not set its own order.
      expect(result.sectionOrder).toEqual([
        'sec_summary',
        'sec_work',
        'sec_project',
        'sec_skill',
        'sec_oss',
      ])
    })
  })

  describe('summary', () => {
    it('takes the variant summary when it has one', () => {
      const result = resolveComposition(createMasterComposition(), {
        summary: 'Backend-leaning engineer focused on payments.',
      })

      expect(result.summary).toBe('Backend-leaning engineer focused on payments.')
    })

    it('falls back to the master summary', () => {
      const result = resolveComposition(createMasterComposition(), { sectionTitles: {} })

      expect(result.summary).toBe(
        'Product engineer with eight years building tools people use daily.',
      )
    })

    it('omits the key entirely when neither side has a summary', () => {
      const master = createMasterComposition()
      delete master.summary

      const result = resolveComposition(master, {})

      expect('summary' in result).toBe(false)
    })
  })

  describe('an explicit undefined counts as "not overridden"', () => {
    it('keeps master values when variant keys are present but undefined', () => {
      // Hand-edited or round-tripped JSON can carry undefined values that the
      // `Partial<ResumeComposition>` type does not admit, hence the cast.
      const variant = {
        sectionOrder: undefined,
        sectionTitles: { [SECTION.work]: undefined },
        entrySelection: { [SECTION.work]: undefined },
        summary: undefined,
      } as unknown as Partial<ResumeComposition>

      const result = resolveComposition(createMasterComposition(), variant)

      expect(result.sectionOrder).toEqual([
        'sec_summary',
        'sec_work',
        'sec_project',
        'sec_skill',
        'sec_oss',
      ])
      expect(result.sectionTitles).toEqual({ sec_work: '工作经验' })
      expect(result.entrySelection[SECTION.work]).toEqual([
        'ent_acme',
        'ent_globex',
        'ent_initech',
      ])
      expect(result.summary).toBe(
        'Product engineer with eight years building tools people use daily.',
      )
    })
  })
})
