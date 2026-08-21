import { describe, expect, it } from 'vitest'

import { createWorkspace } from '../__fixtures__/workspace'
import { parseWorkspace } from './schema'

/**
 * `parseWorkspace` takes `unknown` — its whole job is to face hand-edited or
 * out-of-date JSON — so these tests hand it plain objects, including malformed
 * ones the `Workspace` type would not admit.
 */
type RawWorkspace = any

function rawWorkspace(): RawWorkspace {
  return JSON.parse(JSON.stringify(createWorkspace())) as RawWorkspace
}

function expectErrors(data: unknown): string[] {
  const result = parseWorkspace(data)
  if (result.ok) throw new Error('expected the workspace to be rejected, but it parsed')
  return result.errors
}

describe('parseWorkspace', () => {
  it('accepts the fixture workspace', () => {
    const result = parseWorkspace(rawWorkspace())

    expect(result.ok).toBe(true)
  })

  it('accepts a workspace carrying a variant', () => {
    const raw = rawWorkspace()
    raw.variants = [
      {
        id: 'var_acme',
        name: 'Acme — Senior Engineer',
        composition: { entrySelection: { sec_work: ['ent_acme'] } },
        textOverrides: { ent_acme: 'Senior Engineer' },
        application: {
          company: 'Acme Corp',
          status: 'applied',
          appliedAt: '2026-08-01T09:00:00.000Z',
          events: [{ at: '2026-08-01T09:00:00.000Z', text: 'Applied via careers page.' }],
        },
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
      },
    ]

    const result = parseWorkspace(raw)

    expect(result.ok).toBe(true)
  })

  describe('missing ids', () => {
    it('rejects an entry with no id and names the path', () => {
      const raw = rawWorkspace()
      delete raw.pool.entries.ent_acme.id

      expect(expectErrors(raw)).toEqual([
        'pool.entries.ent_acme.id: Invalid input: expected string, received undefined',
      ])
    })

    it('rejects a bullet with no id and names the path', () => {
      const raw = rawWorkspace()
      delete raw.pool.bullets.bul_acme_1.id

      expect(expectErrors(raw)).toEqual([
        'pool.bullets.bul_acme_1.id: Invalid input: expected string, received undefined',
      ])
    })

    it('rejects a section with no id and names the path', () => {
      const raw = rawWorkspace()
      delete raw.pool.sections.sec_work.id

      expect(expectErrors(raw)).toEqual([
        'pool.sections.sec_work.id: Invalid input: expected string, received undefined',
      ])
    })

    it('rejects an empty-string id', () => {
      const raw = rawWorkspace()
      raw.pool.entries.ent_acme.id = ''

      // Two issues: an empty string is still a string, so the record key check
      // runs as well and reports the same path.
      expect(expectErrors(raw)).toEqual([
        'pool.entries.ent_acme.id: entry id must be a non-empty string',
        'pool.entries.ent_acme.id: id "" does not match its key "ent_acme"',
      ])
    })
  })

  describe('key and id must agree', () => {
    it('rejects an entry filed under the wrong key', () => {
      const raw = rawWorkspace()
      raw.pool.entries.ent_acme.id = 'ent_globex'

      expect(expectErrors(raw)).toEqual([
        'pool.entries.ent_acme.id: id "ent_globex" does not match its key "ent_acme"',
      ])
    })
  })

  describe('other malformed input', () => {
    it('rejects a bullet selection that is not an array of ids', () => {
      const raw = rawWorkspace()
      raw.master.bulletSelection.ent_acme = 'bul_acme_1'

      expect(expectErrors(raw)).toEqual([
        'master.bulletSelection.ent_acme: Invalid input: expected array, received string',
      ])
    })

    it('rejects an unknown application status', () => {
      const raw = rawWorkspace()
      raw.variants = [
        {
          id: 'var_acme',
          name: 'Acme',
          composition: {},
          textOverrides: {},
          application: { status: 'ghosted', events: [] },
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        },
      ]

      expect(expectErrors(raw)).toEqual([
        'variants.0.application.status: Invalid option: expected one of "draft"|"applied"|"interviewing"|"offer"|"rejected"|"closed"',
      ])
    })

    it('rejects a missing schemaVersion', () => {
      const raw = rawWorkspace()
      delete raw.schemaVersion

      expect(expectErrors(raw)).toEqual([
        'schemaVersion: Invalid input: expected number, received undefined',
      ])
    })

    it('rejects a non-object', () => {
      expect(expectErrors('not a workspace')).toEqual([
        'Invalid input: expected object, received string',
      ])
    })
  })
})
