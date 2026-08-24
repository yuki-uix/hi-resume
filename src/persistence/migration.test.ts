import { describe, expect, it } from 'vitest'

import { createWorkspace } from '../domain/__fixtures__/workspace'
import { CURRENT_SCHEMA_VERSION } from '../domain/composition/schema'
import { SchemaVersionMismatchError, WorkspaceReadError } from './errors'
import {
  migrateWorkspace,
  parseAndMigrate,
  validateWorkspace,
  workspaceReadPaths,
  type WorkspaceReadPathName,
} from './migration'

/**
 * The shared gate every workspace read path must pass through (#27). The three
 * paths are exercised at the *object* level here (the level the gate actually
 * works on); the IndexedDB read itself is covered by e2e, where a corrupt row
 * must surface as a readable error instead of a white screen.
 */

// `any` mirrors schema.test.ts: these tests feed malformed objects the
// `Workspace` type would not admit.
type Raw = any

function rawWorkspace(): Raw {
  return JSON.parse(JSON.stringify(createWorkspace()))
}

/** A v1-shaped workspace record: the fixture already ships at schemaVersion 1. */
function v1Record(): Raw {
  return rawWorkspace()
}

/** A structurally corrupt record: `pool.entries` is an array, not an object. */
function corruptRecord(): Raw {
  const raw = rawWorkspace()
  raw.pool.entries = []
  return raw
}

describe('parseAndMigrate (the IndexedDB load gate)', () => {
  it('AC1: rejects a structurally corrupt record with a WorkspaceReadError naming the Zod path', () => {
    const corrupt = corruptRecord()
    // Premise first: the record really is the corruption we think it is.
    expect(Array.isArray(corrupt.pool.entries)).toBe(true)

    let caught: unknown
    try {
      parseAndMigrate(corrupt)
      throw new Error('expected parseAndMigrate to reject the corrupt record')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(WorkspaceReadError)
    expect((caught as Error).message).toContain('pool.entries')
  })

  it('AC1: still names the schemaVersion path when the record has no version', () => {
    const raw = rawWorkspace()
    delete raw.schemaVersion

    expect(() => parseAndMigrate(raw)).toThrow(WorkspaceReadError)
    try {
      parseAndMigrate(raw)
    } catch (error) {
      expect((error as Error).message).toContain('schemaVersion')
    }
  })

  it('refuses a newer version with the versions attached', () => {
    const raw = rawWorkspace()
    raw.schemaVersion = CURRENT_SCHEMA_VERSION + 1

    try {
      parseAndMigrate(raw)
      throw new Error('expected a newer version to be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaVersionMismatchError)
      const mismatch = error as SchemaVersionMismatchError
      expect(mismatch.storedVersion).toBe(CURRENT_SCHEMA_VERSION + 1)
      expect(mismatch.supportedVersion).toBe(CURRENT_SCHEMA_VERSION)
    }
  })
})

describe('migration v1 → v2', () => {
  it('AC2: migrates a v1 record to schemaVersion 2 with the new field defaulted', () => {
    const v1 = v1Record()
    expect(v1.schemaVersion).toBe(1)

    const migrated = parseAndMigrate(v1)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.settings.pageNumbers).toBe(false)
  })

  it('AC2: migrateWorkspace asserts the result passes the current schema (throws on a broken migration)', () => {
    // A v1 record whose structure is already corrupt: the migration stamps the
    // version and field, but the result still fails the v2 schema, so the
    // internal assertion throws instead of returning an invalid Workspace.
    const broken = v1Record()
    broken.pool.bullets = 'not-an-object'

    expect(() => migrateWorkspace(broken, 1)).toThrow(WorkspaceReadError)
    try {
      migrateWorkspace(broken, 1)
    } catch (error) {
      expect((error as Error).message).toContain('pool.bullets')
    }
  })

  it('keeps an already-current record unchanged in shape (no rewrite on load)', () => {
    const current = rawWorkspace()
    current.schemaVersion = CURRENT_SCHEMA_VERSION

    const parsed = parseAndMigrate(current)

    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})

describe('validateWorkspace (the JSON-import / bound-file gate)', () => {
  it('accepts a valid record', () => {
    expect(() => validateWorkspace(rawWorkspace())).not.toThrow()
  })

  it('rejects a structurally corrupt record with the Zod path', () => {
    expect(() => validateWorkspace(corruptRecord())).toThrow(WorkspaceReadError)
    try {
      validateWorkspace(corruptRecord())
    } catch (error) {
      expect((error as Error).message).toContain('pool.entries')
    }
  })

  it('AC4: accepts a dangling EntryId in a selection list (existing behaviour preserved)', () => {
    const raw = rawWorkspace()
    raw.master.entrySelection.sec_work = ['ent_acme', 'ent_gone', 'ent_initech']

    const workspace = validateWorkspace(raw)

    expect((workspace.master.entrySelection as Record<string, string[]>).sec_work).toContain(
      'ent_gone',
    )
  })
})

describe('AC3: every workspace read path goes through the gate', () => {
  it('each registered read path rejects a corrupt record with a WorkspaceReadError', () => {
    // The registry's key set is fixed by `WorkspaceReadPathName` (a mapped type),
    // so a fourth read path added anywhere must register a loader here — and then
    // this loop tests it. A loader that skips validation accepts the corrupt
    // record and fails the assertion below.
    const entries = Object.entries(workspaceReadPaths) as [
      WorkspaceReadPathName,
      (raw: unknown) => unknown,
    ][]

    expect(entries.length).toBeGreaterThan(0)

    for (const [name, load] of entries) {
      const corrupt = corruptRecord()
      let caught: unknown
      try {
        load(corrupt)
      } catch (error) {
        caught = error
      }
      expect(
        caught,
        `read path "${name}" must reject a corrupt record (got no error)`,
      ).toBeInstanceOf(WorkspaceReadError)
      expect((caught as Error).message).toContain('pool.entries')
    }
  })

  it('covers the three known read paths', () => {
    expect(Object.keys(workspaceReadPaths).sort()).toEqual([
      'file-binding',
      'indexeddb',
      'json-import',
    ])
  })
})
