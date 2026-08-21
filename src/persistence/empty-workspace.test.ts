import { describe, expect, it } from 'vitest'

import { parseWorkspace } from '../domain/composition/schema'
import { createEmptyWorkspace, EMPTY_SECTION } from './empty-workspace'

/**
 * The first-launch workspace must be a valid, empty skeleton — and, crucially,
 * it must share *no* content strings with the dev/e2e fixture, so a fresh
 * install can never present "Ada Chen's fake resume" as the user's own.
 */

// Content strings that only exist in `src/domain/__fixtures__/workspace.ts`.
// The empty workspace's JSON must not contain any of these.
const FIXTURE_CONTENT = [
  'Ada Chen',
  'Product Engineer',
  'Senior Product Engineer',
  'Acme Corp',
  'Globex',
  'Initech',
  'Beacon',
  'markdown-lint',
  '技术栈',
  '开源贡献',
  'ada@example.com',
  '+86 138 0000 0000',
  'Shanghai',
  'Product engineer with eight years building tools people use daily.',
  'Led the migration of the billing service to event sourcing.',
  'TypeScript, React, Node.js, PostgreSQL',
]

describe('createEmptyWorkspace', () => {
  it('produces a workspace that parses as a valid Workspace', () => {
    const result = parseWorkspace(createEmptyWorkspace())
    expect(result.ok).toBe(true)
  })

  it('has the built-in section skeleton with no entries or bullets', () => {
    const workspace = createEmptyWorkspace()
    const { pool, master } = workspace

    expect(pool.entries).toEqual({})
    expect(pool.bullets).toEqual({})
    expect(pool.basics).toEqual({ name: '' })

    // All six built-in sections, in the PRD's canonical order.
    expect(master.sectionOrder).toEqual([
      EMPTY_SECTION.summary,
      EMPTY_SECTION.work,
      EMPTY_SECTION.project,
      EMPTY_SECTION.education,
      EMPTY_SECTION.skill,
      EMPTY_SECTION.language,
    ])

    // Every built-in section is non-removable and correctly typed.
    expect(pool.sections[EMPTY_SECTION.summary]).toMatchObject({ kind: 'summary', layout: 'text', removable: false })
    for (const id of [
      EMPTY_SECTION.work,
      EMPTY_SECTION.project,
      EMPTY_SECTION.education,
      EMPTY_SECTION.skill,
      EMPTY_SECTION.language,
    ]) {
      expect(pool.sections[id]).toMatchObject({ layout: 'entries', removable: false })
    }

    // Nothing selected: the entries-layout sections carry empty selection lists.
    for (const ids of Object.values(master.entrySelection)) {
      expect(ids).toEqual([])
    }
    expect(master.bulletSelection).toEqual({})
    expect(master.visibleSections).toEqual(master.sectionOrder)
  })

  it('contains none of the fixture content strings', () => {
    const json = JSON.stringify(createEmptyWorkspace())
    for (const content of FIXTURE_CONTENT) {
      expect(json).not.toContain(content)
    }
  })

  it('returns a fresh object graph each call', () => {
    const first = createEmptyWorkspace()
    const second = createEmptyWorkspace()
    expect(second).not.toBe(first)
    expect(second.pool).not.toBe(first.pool)
    expect(second.master).not.toBe(first.master)
  })
})
