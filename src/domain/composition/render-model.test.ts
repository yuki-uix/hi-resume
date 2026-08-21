import { describe, expect, it } from 'vitest'

import {
  BULLET,
  ENTRY,
  SECTION,
  createItemPool,
  createMasterComposition,
} from '../__fixtures__/workspace'
import { asBulletId, asEntryId, asSectionId } from '../pool/ids'
import { buildRenderModel } from './render-model'

// Every expected value below is written out by hand. Nothing in this file calls
// `buildRenderModel` or `resolveComposition` to work out what the result should be.

describe('buildRenderModel', () => {
  it('projects the master resume into the exact structure a template consumes', () => {
    const model = buildRenderModel(createItemPool(), createMasterComposition())

    expect(model).toStrictEqual({
      basics: {
        name: 'Ada Chen',
        headline: 'Product Engineer',
        email: 'ada@example.com',
        phone: '+86 138 0000 0000',
        location: 'Shanghai',
        links: [{ label: 'GitHub', url: 'https://github.com/example' }],
      },
      sections: [
        {
          id: 'sec_summary',
          kind: 'summary',
          title: '个人简介',
          layout: 'text',
          entries: [],
          text: 'Product engineer with eight years building tools people use daily.',
        },
        {
          id: 'sec_work',
          kind: 'work',
          title: '工作经验',
          layout: 'entries',
          entries: [
            {
              id: 'ent_acme',
              title: 'Senior Product Engineer',
              subtitle: 'Acme Corp',
              period: { start: '2022-03' },
              bullets: [
                { id: 'bul_acme_3', text: 'Cut p99 checkout latency from 1.8s to 420ms.' },
                {
                  id: 'bul_acme_1',
                  text: 'Led the migration of the billing service to event sourcing.',
                },
              ],
            },
            {
              id: 'ent_globex',
              title: 'Product Engineer',
              subtitle: 'Globex',
              period: { start: '2019-06', end: '2022-02' },
              bullets: [
                { id: 'bul_globex_1', text: 'Built the design system used by six product teams.' },
                {
                  id: 'bul_globex_2',
                  text: 'Owned the release pipeline for the customer portal.',
                },
              ],
            },
            {
              id: 'ent_initech',
              title: 'Junior Engineer',
              subtitle: 'Initech',
              period: { start: '2017-07', end: '2019-05' },
              bullets: [
                {
                  id: 'bul_initech_1',
                  text: 'Shipped the first version of the reporting dashboard.',
                },
              ],
            },
          ],
        },
        {
          id: 'sec_project',
          kind: 'project',
          title: '项目经历',
          layout: 'entries',
          entries: [
            {
              id: 'ent_atlas',
              title: 'Atlas',
              subtitle: 'Personal project',
              period: { start: '2023-01', end: '2023-08' },
              bullets: [
                { id: 'bul_atlas_1', text: 'Offline-first note taking app with CRDT sync.' },
              ],
            },
            {
              id: 'ent_beacon',
              title: 'Beacon',
              bullets: [
                { id: 'bul_beacon_1', text: 'Static site generator for conference schedules.' },
              ],
            },
          ],
        },
        {
          id: 'sec_skill',
          kind: 'skill',
          title: '技能',
          layout: 'entries',
          entries: [
            {
              id: 'ent_skills',
              title: '技术栈',
              bullets: [
                { id: 'bul_skills_1', text: 'TypeScript, React, Node.js, PostgreSQL' },
                { id: 'bul_skills_2', text: 'Vitest, Playwright, GitHub Actions' },
              ],
            },
          ],
        },
      ],
    })
  })

  describe('visibility', () => {
    it('leaves out sections that are ordered but not visible', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition())

      expect(model.sections.map((section) => section.id)).toEqual([
        'sec_summary',
        'sec_work',
        'sec_project',
        'sec_skill',
      ])
    })

    it('leaves out a section that is visible but missing from sectionOrder', () => {
      const composition = createMasterComposition()
      composition.sectionOrder = [SECTION.work, SECTION.project]

      const model = buildRenderModel(createItemPool(), composition)

      expect(model.sections.map((section) => section.id)).toEqual(['sec_work', 'sec_project'])
    })

    it('follows sectionOrder, not the insertion order of the pool', () => {
      const composition = createMasterComposition()
      composition.sectionOrder = [SECTION.skill, SECTION.summary, SECTION.work, SECTION.project]

      const model = buildRenderModel(createItemPool(), composition)

      expect(model.sections.map((section) => section.id)).toEqual([
        'sec_skill',
        'sec_summary',
        'sec_work',
        'sec_project',
      ])
    })
  })

  describe('section titles', () => {
    it('uses the sectionTitles override where there is one and the pool title otherwise', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition())

      expect(model.sections.map((section) => section.title)).toEqual([
        '个人简介', // pool default
        '工作经验', // renamed by the composition, pool says 工作经历
        '项目经历', // pool default
        '技能', // pool default
      ])
    })
  })

  describe('text sections', () => {
    it('gives a text-layout section its body and no entries, and leaves entries sections without text', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition())

      const summary = model.sections[0]
      expect(summary?.layout).toBe('text')
      expect(summary?.text).toBe(
        'Product engineer with eight years building tools people use daily.',
      )
      expect(summary?.entries).toEqual([])

      const work = model.sections[1]
      expect(work?.layout).toBe('entries')
      expect(work?.text).toBeUndefined()
      expect(work?.entries.length).toBeGreaterThan(0)
    })

    it('renders the fixture summary body into the output', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition())

      const summary = model.sections.find((section) => section.kind === 'summary')
      expect(summary?.title).toBe('个人简介')
      expect(summary?.text).toBe(
        'Product engineer with eight years building tools people use daily.',
      )
    })
  })

  describe('bullet order', () => {
    it('orders bullets by bulletSelection, not by Entry.bulletIds', () => {
      const pool = createItemPool()
      // Guard the fixture itself: the two orders must actually differ, or this
      // test would pass for the wrong reason.
      expect(pool.entries[ENTRY.acme]?.bulletIds).toEqual([
        'bul_acme_1',
        'bul_acme_2',
        'bul_acme_3',
      ])
      expect(createMasterComposition().bulletSelection[ENTRY.acme]).toEqual([
        'bul_acme_3',
        'bul_acme_1',
      ])

      const model = buildRenderModel(pool, createMasterComposition())
      const acme = model.sections[1]?.entries[0]

      expect(acme?.id).toBe('ent_acme')
      expect(acme?.bullets).toEqual([
        { id: 'bul_acme_3', text: 'Cut p99 checkout latency from 1.8s to 420ms.' },
        { id: 'bul_acme_1', text: 'Led the migration of the billing service to event sourcing.' },
      ])
    })

    it('renders no bullets for an entry with no bulletSelection key', () => {
      const composition = createMasterComposition()
      delete composition.bulletSelection[ENTRY.beacon]

      const model = buildRenderModel(createItemPool(), composition)
      const beacon = model.sections[2]?.entries[1]

      expect(beacon?.id).toBe('ent_beacon')
      expect(beacon?.bullets).toEqual([])
    })
  })

  describe('textOverrides', () => {
    it('replaces the entries and bullets it names and leaves the rest at pool values', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition(), {
        [ENTRY.acme]: 'Staff Product Engineer',
        [BULLET.acme1]: 'Rebuilt billing on an event-sourced ledger.',
      })

      expect(model.sections[1]?.entries[0]).toEqual({
        id: 'ent_acme',
        title: 'Staff Product Engineer',
        subtitle: 'Acme Corp',
        period: { start: '2022-03' },
        bullets: [
          // Not overridden: still the pool text.
          { id: 'bul_acme_3', text: 'Cut p99 checkout latency from 1.8s to 420ms.' },
          { id: 'bul_acme_1', text: 'Rebuilt billing on an event-sourced ledger.' },
        ],
      })

      // A sibling entry the override did not name is untouched.
      expect(model.sections[1]?.entries[1]).toEqual({
        id: 'ent_globex',
        title: 'Product Engineer',
        subtitle: 'Globex',
        period: { start: '2019-06', end: '2022-02' },
        bullets: [
          { id: 'bul_globex_1', text: 'Built the design system used by six product teams.' },
          { id: 'bul_globex_2', text: 'Owned the release pipeline for the customer portal.' },
        ],
      })
    })

    it('overrides a text section body without touching its title', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition(), {
        [SECTION.summary]: 'Backend-leaning engineer focused on payments.',
      })

      // `textOverrides` overrides the body text, never the title — the title
      // is `sectionTitles`' job.
      expect(model.sections[0]?.title).toBe('个人简介')
      expect(model.sections[0]?.text).toBe('Backend-leaning engineer focused on payments.')
    })

    it('does not rename sections — that is what sectionTitles is for', () => {
      const model = buildRenderModel(createItemPool(), createMasterComposition(), {
        [SECTION.work]: 'Should be ignored as a title',
      })

      // `sec_work` is an entries section, so a text override keyed by its id
      // neither renames it nor gives it a body.
      expect(model.sections[1]?.title).toBe('工作经验')
      expect(model.sections[1]?.text).toBeUndefined()
    })
  })

  describe('stale ids', () => {
    it('skips selected ids that no longer resolve, keeping the rest', () => {
      const composition = createMasterComposition()
      composition.sectionOrder = [...composition.sectionOrder, asSectionId('sec_gone')]
      composition.visibleSections = [...composition.visibleSections, asSectionId('sec_gone')]
      composition.entrySelection[SECTION.project] = [
        ENTRY.atlas,
        asEntryId('ent_gone'),
        ENTRY.beacon,
      ]
      composition.bulletSelection[ENTRY.globex] = [
        BULLET.globex1,
        asBulletId('bul_gone'),
        BULLET.globex2,
      ]

      const model = buildRenderModel(createItemPool(), composition)

      expect(model.sections.map((section) => section.id)).toEqual([
        'sec_summary',
        'sec_work',
        'sec_project',
        'sec_skill',
      ])
      expect(model.sections[2]?.entries.map((entry) => entry.id)).toEqual([
        'ent_atlas',
        'ent_beacon',
      ])
      expect(model.sections[1]?.entries[1]?.bullets.map((bullet) => bullet.id)).toEqual([
        'bul_globex_1',
        'bul_globex_2',
      ])
    })

    it('renders no entries for a section with no entrySelection key', () => {
      const composition = createMasterComposition()
      delete composition.entrySelection[SECTION.skill]

      const model = buildRenderModel(createItemPool(), composition)

      expect(model.sections[3]?.id).toBe('sec_skill')
      expect(model.sections[3]?.entries).toEqual([])
    })
  })

  describe('removing an entry from the middle of a section', () => {
    const remainingWorkEntries = [
      {
        id: 'ent_acme',
        title: 'Senior Product Engineer',
        subtitle: 'Acme Corp',
        period: { start: '2022-03' },
        bullets: [
          { id: 'bul_acme_3', text: 'Cut p99 checkout latency from 1.8s to 420ms.' },
          { id: 'bul_acme_1', text: 'Led the migration of the billing service to event sourcing.' },
        ],
      },
      {
        id: 'ent_initech',
        title: 'Junior Engineer',
        subtitle: 'Initech',
        period: { start: '2017-07', end: '2019-05' },
        bullets: [
          { id: 'bul_initech_1', text: 'Shipped the first version of the reporting dashboard.' },
        ],
      },
    ]

    it('leaves the surrounding entries untouched when it is deselected', () => {
      const composition = createMasterComposition()
      // Drop ent_globex, the middle of [acme, globex, initech].
      composition.entrySelection[SECTION.work] = [ENTRY.acme, ENTRY.initech]

      const model = buildRenderModel(createItemPool(), composition)

      expect(model.sections[1]?.entries).toStrictEqual(remainingWorkEntries)
    })

    it('leaves the surrounding entries untouched when it is deleted from the pool', () => {
      const pool = createItemPool()
      delete pool.entries[ENTRY.globex]

      const model = buildRenderModel(pool, createMasterComposition())

      expect(model.sections[1]?.entries).toStrictEqual(remainingWorkEntries)
    })
  })

  it('does not share basics with the pool', () => {
    const pool = createItemPool()
    const model = buildRenderModel(pool, createMasterComposition())

    model.basics.name = 'mutated'
    model.basics.links?.push({ label: 'Blog', url: 'https://example.com' })

    expect(pool.basics.name).toBe('Ada Chen')
    expect(pool.basics.links).toEqual([{ label: 'GitHub', url: 'https://github.com/example' }])
  })
})
