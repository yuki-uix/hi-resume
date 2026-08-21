import {
  ENTRY,
  SECTION,
  createWorkspace,
} from '../../domain/__fixtures__/workspace'
import { asBulletId, asEntryId } from '../../domain/pool/ids'
import type { SectionId } from '../../domain/pool/types'
import type { Workspace } from '../../domain/composition/types'

/**
 * Pagination fixtures, built on top of `createWorkspace` and its stable ids.
 * Each factory returns a fresh object graph (the base factory already does), so
 * tests and the dev page can mutate freely.
 *
 * The four "shaped" fixtures (long, straddle, orphan, size-diff) are tuned so
 * the scenario they exercise actually happens — the exact page boundaries are
 * asserted in Playwright, not computed here.
 */

type AddedEntry = {
  id: string
  title: string
  subtitle?: string
  period?: { start: string; end?: string }
  /** Bullet texts; ids are minted from the entry id. */
  bullets: string[]
}

/** Append an entry (and its bullets) to a section and select it in the master. */
function addEntryTo(ws: Workspace, sectionId: SectionId, spec: AddedEntry): void {
  const entryId = asEntryId(spec.id)
  const bulletIds = spec.bullets.map((_, index) => asBulletId(`${spec.id}_${index + 1}`))

  ws.pool.entries[entryId] = {
    id: entryId,
    sectionId,
    title: spec.title,
    ...(spec.subtitle !== undefined ? { subtitle: spec.subtitle } : {}),
    ...(spec.period !== undefined ? { period: spec.period } : {}),
    bulletIds,
  }
  spec.bullets.forEach((text, index) => {
    const bulletId = bulletIds[index]
    if (bulletId) ws.pool.bullets[bulletId] = { id: bulletId, text }
  })
  ws.master.entrySelection[sectionId] = [
    ...(ws.master.entrySelection[sectionId] ?? []),
    entryId,
  ]
  ws.master.bulletSelection[entryId] = bulletIds
}

const IMPROVEMENTS = ['latency', 'reliability', 'delivery speed', 'onboarding'] as const
const TEAMS = ['payments', 'platform', 'data', 'mobile'] as const

/** Short, realistic work bullets for filler entries. */
function fillerBullet(seed: string, index: number): string {
  return `${seed} — improved ${IMPROVEMENTS[index % 4] ?? 'latency'} across the ${TEAMS[index % 4] ?? 'platform'} team.`
}

// ---------------------------------------------------------------------------
// A — short: the untouched base fixture. One page, and already mixes a
// text-layout section (summary) with entries-layout sections.
// ---------------------------------------------------------------------------

export function fixtureA(): Workspace {
  return createWorkspace()
}

// ---------------------------------------------------------------------------
// B — long: base plus several more work entries, so it spills to a second page.
// ---------------------------------------------------------------------------

export function fixtureB(): Workspace {
  const ws = createWorkspace()
  const extra: AddedEntry[] = [
    {
      id: 'ent_b_1',
      title: 'Platform Engineer',
      subtitle: 'Northwind Labs',
      period: { start: '2015-01', end: '2017-06' },
      bullets: [fillerBullet('Rebuilt the API gateway', 0), fillerBullet('Led the migration', 1)],
    },
    {
      id: 'ent_b_2',
      title: 'Backend Engineer',
      subtitle: 'Umbrella Software',
      period: { start: '2013-07', end: '2014-12' },
      bullets: [fillerBullet('Shipped the inventory service', 2), fillerBullet('Drove the SLO program', 3)],
    },
    {
      id: 'ent_b_3',
      title: 'Software Engineer',
      subtitle: 'Acme Labs',
      period: { start: '2011-09', end: '2013-06' },
      bullets: [fillerBullet('Built the reporting pipeline', 0), fillerBullet('Mentored two interns', 1)],
    },
    {
      id: 'ent_b_4',
      title: 'Frontend Engineer',
      subtitle: 'Globex Media',
      period: { start: '2009-03', end: '2011-08' },
      bullets: [fillerBullet('Owned the design system', 2), fillerBullet('Cut bundle size by half', 3)],
    },
    {
      id: 'ent_b_5',
      title: 'Release Engineer',
      subtitle: 'Initech',
      period: { start: '2007-01', end: '2009-02' },
      bullets: [fillerBullet('Automated the deploy pipeline', 0)],
    },
    {
      id: 'ent_b_6',
      title: 'Support Engineer',
      subtitle: 'Hooli',
      period: { start: '2005-06', end: '2006-12' },
      bullets: [fillerBullet('Triaged customer escalations', 1), fillerBullet('Wrote the runbooks', 2)],
    },
  ]
  for (const entry of extra) addEntryTo(ws, SECTION.work, entry)
  return ws
}

// ---------------------------------------------------------------------------
// C — straddle: a tall entry follows enough content that a naive renderer
// would split it across a page boundary. The tall entry's id is exported so the
// test can pin it.
// ---------------------------------------------------------------------------

export const STRADDLE_ENTRY_ID = 'ent_c_tall'

export function fixtureC(): Workspace {
  const ws = createWorkspace()
  ws.master.sectionOrder = [SECTION.summary, SECTION.work]
  ws.master.visibleSections = [SECTION.summary, SECTION.work]

  for (let i = 0; i < 4; i += 1) {
    addEntryTo(ws, SECTION.work, {
      id: `ent_c_fill_${i + 1}`,
      title: `Filler Role ${i + 1}`,
      subtitle: 'Filler Corp',
      period: { start: `${2020 - i}-01`, end: `${2021 - i}-01` },
      bullets: [fillerBullet('Drove the roadmap', i), fillerBullet('Shipped the platform', i + 1)],
    })
  }

  addEntryTo(ws, SECTION.work, {
    id: STRADDLE_ENTRY_ID,
    title: 'Staff Engineer — Long Tenure',
    subtitle: 'BigCo',
    period: { start: '2000-01', end: '2020-01' },
    bullets: Array.from({ length: 16 }, (_, i) => fillerBullet('Owned the platform', i)),
  })
  return ws
}

// ---------------------------------------------------------------------------
// D — orphan: work content fills page one up to the bottom, so the project
// section's title would land as the last element of page one while its first
// entry falls to page two. The title must move with its first entry.
// ---------------------------------------------------------------------------

export const ORPHAN_SECTION_ID = SECTION.project

export function fixtureD(): Workspace {
  const ws = createWorkspace()
  ws.master.sectionOrder = [SECTION.work, SECTION.project]
  ws.master.visibleSections = [SECTION.work, SECTION.project]

  for (let i = 0; i < 6; i += 1) {
    addEntryTo(ws, SECTION.work, {
      id: `ent_d_fill_${i + 1}`,
      title: `Filler Role ${i + 1}`,
      subtitle: 'Filler Corp',
      period: { start: `${2022 - i}-01`, end: `${2023 - i}-01` },
      bullets: [fillerBullet('Drove the roadmap', i), fillerBullet('Shipped the platform', i + 1)],
    })
  }
  return ws
}

// ---------------------------------------------------------------------------
// E — size-diff: medium content tuned so the page count differs between A4 and
// Letter (one page on A4, two on Letter).
// ---------------------------------------------------------------------------

export function fixtureE(): Workspace {
  const ws = createWorkspace()
  ws.master.sectionOrder = [SECTION.work]
  ws.master.visibleSections = [SECTION.work]
  // Full control over the content: short, non-wrapping entries so each one is
  // the same height on A4 and Letter — then the only difference between the two
  // sizes is the sheet height, and the page counts provably diverge.
  ws.master.entrySelection[SECTION.work] = []
  for (let i = 0; i < 25; i += 1) {
    addEntryTo(ws, SECTION.work, {
      id: `ent_e_${i + 1}`,
      title: `Role ${i + 1}`,
      subtitle: 'Corp',
      period: { start: '2020-01', end: '2021-01' },
      bullets: [`Shipped feature ${i + 1}.`],
    })
  }
  return ws
}

// ---------------------------------------------------------------------------
// rare — the base fixture with rare CJK characters injected into the basics.
// 頔/玥/甯 are uncommon given-name characters; 爨 (U+7228) sits far outside any
// "common 3500" subset. The PDF coverage gate uses these to prove the bundled
// font is the full unified-ideograph block, not a narrow subset: a character
// the font lacks would fall back to a system font and reappear as Type 3.
// ---------------------------------------------------------------------------

export function fixtureRare(): Workspace {
  const ws = createWorkspace()
  ws.pool.basics.name = '頔玥甯'
  ws.pool.basics.headline = '工程师'
  ws.pool.basics.location = '爨村'
  return ws
}

// ---------------------------------------------------------------------------
// custom — the hidden `sec_oss` custom section is made visible. Renders through
// the generic renderer without any template change.
// ---------------------------------------------------------------------------

export function fixtureCustom(): Workspace {
  const ws = createWorkspace()
  ws.master.visibleSections = [...ws.master.visibleSections, SECTION.oss]
  return ws
}

// ---------------------------------------------------------------------------
// text-undefined — a text-layout section whose body is missing. Its title must
// still render, with an empty body.
// ---------------------------------------------------------------------------

export function fixtureTextUndefined(): Workspace {
  const ws = createWorkspace()
  const summary = ws.pool.sections[SECTION.summary]
  if (summary) summary.text = undefined
  return ws
}

// ---------------------------------------------------------------------------
// bullets-200 — one work entry with 200 bullets. The AC9 performance gate: a
// keystroke in the editor re-renders the whole model (all 200 bullets), so
// per-keystroke latency must still clear its budget on the largest realistic
// resume.
// ---------------------------------------------------------------------------

export const PERF_ENTRY_ID = 'ent_perf'

export function fixtureBullets200(): Workspace {
  const ws = createWorkspace()
  ws.master.sectionOrder = [SECTION.work]
  ws.master.visibleSections = [SECTION.work]
  ws.master.sectionTitles = {}

  const entryId = asEntryId(PERF_ENTRY_ID)
  const bulletIds = Array.from({ length: 200 }, (_, index) => asBulletId(`bul_perf_${index + 1}`))

  ws.pool.entries = {
    [entryId]: { id: entryId, sectionId: SECTION.work, title: 'Performance', bulletIds },
  }
  ws.pool.bullets = {}
  bulletIds.forEach((id, index) => {
    ws.pool.bullets[id] = { id, text: `bullet ${index + 1}` }
  })
  ws.master.entrySelection = { [SECTION.work]: [entryId] }
  ws.master.bulletSelection = { [entryId]: bulletIds }

  return ws
}

/** id → factory, so the dev page can address any fixture by query param. */
export const FIXTURES: Record<string, () => Workspace> = {
  a: fixtureA,
  b: fixtureB,
  c: fixtureC,
  d: fixtureD,
  e: fixtureE,
  rare: fixtureRare,
  custom: fixtureCustom,
  'text-undefined': fixtureTextUndefined,
  'bullets-200': fixtureBullets200,
}

export { ENTRY, SECTION }
