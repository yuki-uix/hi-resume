import type { ResumeComposition, Workspace } from '../composition/types'
import { asBulletId, asEntryId, asSectionId } from '../pool/ids'
import type { ItemPool } from '../pool/types'

/**
 * A small but complete workspace, used by every domain test.
 *
 * It is deliberately shaped to exercise the awkward cases rather than the
 * happy path:
 *
 * - `sec_oss` sits in `sectionOrder` but not in `visibleSections`;
 * - `sec_summary` is a text-layout section whose body lives in `Section.text`;
 * - `sec_work` is renamed by the master composition, the other sections are not;
 * - `ent_acme` selects its bullets out of order and drops one, so bullet order
 *   can only come from `bulletSelection`;
 * - `ent_beacon` has neither subtitle nor period;
 * - `sec_work` holds three entries, so a middle one can be removed.
 *
 * Every factory returns a fresh object graph: tests mutate these.
 */

export const SECTION = {
  summary: asSectionId('sec_summary'),
  work: asSectionId('sec_work'),
  project: asSectionId('sec_project'),
  skill: asSectionId('sec_skill'),
  oss: asSectionId('sec_oss'),
} as const

export const ENTRY = {
  acme: asEntryId('ent_acme'),
  globex: asEntryId('ent_globex'),
  initech: asEntryId('ent_initech'),
  atlas: asEntryId('ent_atlas'),
  beacon: asEntryId('ent_beacon'),
  skills: asEntryId('ent_skills'),
  oss: asEntryId('ent_oss'),
} as const

export const BULLET = {
  acme1: asBulletId('bul_acme_1'),
  acme2: asBulletId('bul_acme_2'),
  acme3: asBulletId('bul_acme_3'),
  globex1: asBulletId('bul_globex_1'),
  globex2: asBulletId('bul_globex_2'),
  initech1: asBulletId('bul_initech_1'),
  atlas1: asBulletId('bul_atlas_1'),
  atlas2: asBulletId('bul_atlas_2'),
  beacon1: asBulletId('bul_beacon_1'),
  skills1: asBulletId('bul_skills_1'),
  skills2: asBulletId('bul_skills_2'),
  oss1: asBulletId('bul_oss_1'),
} as const

export function createItemPool(): ItemPool {
  return {
    sections: {
      [SECTION.summary]: {
        id: SECTION.summary,
        kind: 'summary',
        title: '个人简介',
        layout: 'text',
        text: 'Product engineer with eight years building tools people use daily.',
        removable: false,
      },
      [SECTION.work]: {
        id: SECTION.work,
        kind: 'work',
        title: '工作经历',
        layout: 'entries',
        removable: false,
      },
      [SECTION.project]: {
        id: SECTION.project,
        kind: 'project',
        title: '项目经历',
        layout: 'entries',
        removable: false,
      },
      [SECTION.skill]: {
        id: SECTION.skill,
        kind: 'skill',
        title: '技能',
        layout: 'entries',
        removable: false,
      },
      [SECTION.oss]: {
        id: SECTION.oss,
        kind: 'custom',
        title: '开源贡献',
        layout: 'entries',
        removable: true,
      },
    },
    entries: {
      [ENTRY.acme]: {
        id: ENTRY.acme,
        sectionId: SECTION.work,
        title: 'Senior Product Engineer',
        subtitle: 'Acme Corp',
        period: { start: '2022-03' },
        bulletIds: [BULLET.acme1, BULLET.acme2, BULLET.acme3],
      },
      [ENTRY.globex]: {
        id: ENTRY.globex,
        sectionId: SECTION.work,
        title: 'Product Engineer',
        subtitle: 'Globex',
        period: { start: '2019-06', end: '2022-02' },
        bulletIds: [BULLET.globex1, BULLET.globex2],
      },
      [ENTRY.initech]: {
        id: ENTRY.initech,
        sectionId: SECTION.work,
        title: 'Junior Engineer',
        subtitle: 'Initech',
        period: { start: '2017-07', end: '2019-05' },
        bulletIds: [BULLET.initech1],
      },
      [ENTRY.atlas]: {
        id: ENTRY.atlas,
        sectionId: SECTION.project,
        title: 'Atlas',
        subtitle: 'Personal project',
        period: { start: '2023-01', end: '2023-08' },
        bulletIds: [BULLET.atlas1, BULLET.atlas2],
      },
      [ENTRY.beacon]: {
        id: ENTRY.beacon,
        sectionId: SECTION.project,
        title: 'Beacon',
        bulletIds: [BULLET.beacon1],
      },
      [ENTRY.skills]: {
        id: ENTRY.skills,
        sectionId: SECTION.skill,
        title: '技术栈',
        bulletIds: [BULLET.skills1, BULLET.skills2],
      },
      [ENTRY.oss]: {
        id: ENTRY.oss,
        sectionId: SECTION.oss,
        title: 'markdown-lint',
        bulletIds: [BULLET.oss1],
      },
    },
    bullets: {
      [BULLET.acme1]: {
        id: BULLET.acme1,
        text: 'Led the migration of the billing service to event sourcing.',
      },
      [BULLET.acme2]: {
        id: BULLET.acme2,
        text: 'Mentored three engineers through their first on-call rotation.',
      },
      [BULLET.acme3]: {
        id: BULLET.acme3,
        text: 'Cut p99 checkout latency from 1.8s to 420ms.',
      },
      [BULLET.globex1]: {
        id: BULLET.globex1,
        text: 'Built the design system used by six product teams.',
      },
      [BULLET.globex2]: {
        id: BULLET.globex2,
        text: 'Owned the release pipeline for the customer portal.',
      },
      [BULLET.initech1]: {
        id: BULLET.initech1,
        text: 'Shipped the first version of the reporting dashboard.',
      },
      [BULLET.atlas1]: {
        id: BULLET.atlas1,
        text: 'Offline-first note taking app with CRDT sync.',
      },
      [BULLET.atlas2]: {
        id: BULLET.atlas2,
        text: 'Published as an open-source desktop build.',
      },
      [BULLET.beacon1]: {
        id: BULLET.beacon1,
        text: 'Static site generator for conference schedules.',
      },
      [BULLET.skills1]: {
        id: BULLET.skills1,
        text: 'TypeScript, React, Node.js, PostgreSQL',
      },
      [BULLET.skills2]: {
        id: BULLET.skills2,
        text: 'Vitest, Playwright, GitHub Actions',
      },
      [BULLET.oss1]: {
        id: BULLET.oss1,
        text: 'Maintainer of a markdown linter used by 2k repositories.',
      },
    },
    basics: {
      name: 'Ada Chen',
      headline: 'Product Engineer',
      email: 'ada@example.com',
      phone: '+86 138 0000 0000',
      location: 'Shanghai',
      links: [{ label: 'GitHub', url: 'https://github.com/example' }],
    },
  }
}

export function createMasterComposition(): ResumeComposition {
  return {
    sectionOrder: [SECTION.summary, SECTION.work, SECTION.project, SECTION.skill, SECTION.oss],
    // `sec_oss` is ordered but hidden.
    visibleSections: [SECTION.summary, SECTION.work, SECTION.project, SECTION.skill],
    // Only `sec_work` is renamed; the rest keep their pool titles.
    sectionTitles: { [SECTION.work]: '工作经验' },
    entrySelection: {
      [SECTION.work]: [ENTRY.acme, ENTRY.globex, ENTRY.initech],
      [SECTION.project]: [ENTRY.atlas, ENTRY.beacon],
      [SECTION.skill]: [ENTRY.skills],
      [SECTION.oss]: [ENTRY.oss],
    },
    bulletSelection: {
      // Reversed and one bullet short of `ent_acme.bulletIds`.
      [ENTRY.acme]: [BULLET.acme3, BULLET.acme1],
      [ENTRY.globex]: [BULLET.globex1, BULLET.globex2],
      [ENTRY.initech]: [BULLET.initech1],
      [ENTRY.atlas]: [BULLET.atlas1],
      [ENTRY.beacon]: [BULLET.beacon1],
      [ENTRY.skills]: [BULLET.skills1, BULLET.skills2],
      [ENTRY.oss]: [BULLET.oss1],
    },
  }
}

export function createWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    pool: createItemPool(),
    master: createMasterComposition(),
    variants: [],
    settings: { pageSize: 'A4' },
  }
}
