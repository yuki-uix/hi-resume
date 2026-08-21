import { CURRENT_SCHEMA_VERSION } from '../domain/composition/schema'
import { SchemaVersionMismatchError, WorkspaceReadError } from './errors'

/**
 * Decide whether a stored `schemaVersion` can be loaded by this build.
 *
 * The one rule that matters today: a version *newer* than this build is a hard
 * refusal — the data was written by a future release and loading it here could
 * silently drop fields this build does not understand. Lower versions do not
 * exist yet (the schema shipped at 1), so there is deliberately no migration
 * path; when the first bump lands, that is where a migration switch goes.
 *
 * Kept as a pure function so the refusal logic is testable in Node without
 * IndexedDB.
 */
export function assertSchemaVersionSupported(stored: unknown): void {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) {
    throw new WorkspaceReadError('stored workspace has no numeric schemaVersion')
  }
  if (stored > CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionMismatchError(stored, CURRENT_SCHEMA_VERSION)
  }
}
