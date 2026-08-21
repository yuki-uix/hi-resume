import { describe, expect, it } from 'vitest'

import { CURRENT_SCHEMA_VERSION } from '../domain/composition/schema'
import { SchemaVersionMismatchError, WorkspaceReadError } from './errors'
import { assertSchemaVersionSupported } from './schema-version'

describe('assertSchemaVersionSupported', () => {
  it('accepts the current version', () => {
    expect(() => assertSchemaVersionSupported(CURRENT_SCHEMA_VERSION)).not.toThrow()
  })

  it('accepts a lower version (no migration yet, but not an error either)', () => {
    expect(() => assertSchemaVersionSupported(0)).not.toThrow()
  })

  it('rejects a newer version with the versions attached', () => {
    try {
      assertSchemaVersionSupported(CURRENT_SCHEMA_VERSION + 1)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaVersionMismatchError)
      const mismatch = error as SchemaVersionMismatchError
      expect(mismatch.storedVersion).toBe(CURRENT_SCHEMA_VERSION + 1)
      expect(mismatch.supportedVersion).toBe(CURRENT_SCHEMA_VERSION)
    }
  })

  it('rejects a non-numeric version as a read error', () => {
    expect(() => assertSchemaVersionSupported(undefined)).toThrow(WorkspaceReadError)
    expect(() => assertSchemaVersionSupported('1')).toThrow(WorkspaceReadError)
    expect(() => assertSchemaVersionSupported(Number.NaN)).toThrow(WorkspaceReadError)
  })
})
