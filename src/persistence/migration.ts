import { CURRENT_SCHEMA_VERSION, parseWorkspace } from '../domain/composition/schema'
import type { Workspace } from '../domain/composition/types'
import { SchemaVersionMismatchError, WorkspaceReadError } from './errors'
import { assertSchemaVersionSupported } from './schema-version'

/**
 * The one gate every "read a `Workspace` from untrusted bytes" path must pass.
 *
 * Before #27 the three entry points diverged: JSON import and the bound file
 * validated through `parseWorkspaceFile`, but `loadWorkspace` returned the raw
 * IndexedDB record unchecked. This module is the shared闸: `validateWorkspace`
 * is the validate-only gate (JSON import, bound file), and `parseAndMigrate` is
 * `validateWorkspace` after older versions have run through the migration switch
 * (IndexedDB, whose records were written by older builds in place).
 *
 * The two are deliberately separate: JSON import must *not* migrate — a backup
 * is a snapshot and `parseWorkspaceFile` promises to rewrite nothing, so the
 * export → import → export round trip stays byte-for-byte. IndexedDB is the app's
 * own live state, so a v1 row gets upgraded in place on load.
 */

/** Read the `schemaVersion` a raw record *claims*, or `null` if it has none. */
export function peekSchemaVersion(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null
  const version = (raw as { schemaVersion?: unknown }).schemaVersion
  return typeof version === 'number' && Number.isFinite(version) ? version : null
}

/**
 * Validate without migrating: the JSON-import / bound-file gate. Throws
 * {@link WorkspaceReadError} with one Zod issue path per message on a corrupt
 * record, and {@link SchemaVersionMismatchError} on a newer version.
 */
export function validateWorkspace(raw: unknown): Workspace {
  const parsed = parseWorkspace(raw)
  if (!parsed.ok) throw new WorkspaceReadError(parsed.errors.join('; '))
  assertSchemaVersionSupported(parsed.workspace.schemaVersion)
  return parsed.workspace
}

/**
 * The migration switch (#27): bring a record from `fromVersion` up to
 * {@link CURRENT_SCHEMA_VERSION}, then assert — *inside this function* — that
 * the result satisfies the current schema. A migration that produces a value the
 * v2 schema rejects is caught here and thrown as a {@link WorkspaceReadError},
 * not trusted by the caller to re-validate.
 */
export function migrateWorkspace(raw: unknown, fromVersion: number): Workspace {
  let next = raw
  if (fromVersion < 2) next = migrateV1ToV2(next)
  // Future bumps add a branch here (e.g. `if (fromVersion < 3) next = migrateV2ToV3(next)`).

  const parsed = parseWorkspace(next)
  if (!parsed.ok) throw new WorkspaceReadError(parsed.errors.join('; '))
  return parsed.workspace
}

/** v1 → v2: add the optional `pageNumbers` setting and stamp the new version. */
function migrateV1ToV2(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const workspace = raw as { schemaVersion?: unknown; settings?: unknown }
  const settings =
    typeof workspace.settings === 'object' && workspace.settings !== null
      ? (workspace.settings as Record<string, unknown>)
      : {}
  return {
    ...workspace,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...settings, pageNumbers: settings.pageNumbers ?? false },
  }
}

/**
 * The IndexedDB load gate: version-check, migrate, validate. A record newer than
 * this build is a hard refusal (never downgraded); a missing/unusable version is
 * handed to validation so Zod can name the `schemaVersion` path.
 */
export function parseAndMigrate(raw: unknown): Workspace {
  const fromVersion = peekSchemaVersion(raw)
  if (fromVersion !== null && fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaVersionMismatchError(fromVersion, CURRENT_SCHEMA_VERSION)
  }
  if (fromVersion === null) return validateWorkspace(raw)
  return migrateWorkspace(raw, fromVersion)
}

/**
 * Every place untrusted data becomes a `Workspace`, keyed by name. The type is a
 * mapped type over `WorkspaceReadPathName`, so the key set is *exactly* the set
 * of read paths: add a fourth path name without a loader here and the build
 * fails, and add a fourth loader that does not validate and the AC3 coverage
 * test fails. This is the coverage guarantee, expressed in the type system
 * rather than a checklist.
 */
export type WorkspaceReadPathName = 'indexeddb' | 'json-import' | 'file-binding'

export const workspaceReadPaths: {
  [K in WorkspaceReadPathName]: (raw: unknown) => Workspace
} = {
  indexeddb: parseAndMigrate,
  'json-import': validateWorkspace,
  'file-binding': validateWorkspace,
}
