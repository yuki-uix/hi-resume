import Dexie, { type Table } from 'dexie'

import type { Workspace } from '../domain/composition/types'
import { WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION, WORKSPACE_KEY, WORKSPACE_TABLE } from './constants'
import { WorkspaceReadError, WorkspaceWriteError } from './errors'
import { assertSchemaVersionSupported } from './schema-version'

/**
 * The one row the app reads and writes. The `workspace` value is the whole
 * `Workspace` object exactly as `parseWorkspace` / `createEmptyWorkspace`
 * produce it, so the IndexedDB record and the JSON backup share one shape.
 */
type WorkspaceRecord = {
  id: string
  workspace: Workspace
}

class WorkspaceDatabase extends Dexie {
  workspaces!: Table<WorkspaceRecord, string>

  constructor() {
    super(WORKSPACE_DB_NAME)
    this.version(WORKSPACE_DB_VERSION).stores({
      [WORKSPACE_TABLE]: 'id',
    })
  }
}

// Lazily opened so importing this module is side-effect free — the domain/pure
// tests (and Playwright's Node runner) can import constants and errors without
// touching IndexedDB.
let db: WorkspaceDatabase | null = null

function getDb(): WorkspaceDatabase {
  if (db === null) db = new WorkspaceDatabase()
  return db
}

/**
 * Read the stored workspace, or `null` when nothing has been saved yet.
 *
 * Throws {@link WorkspaceReadError} on an IndexedDB failure or a corrupt
 * record, and {@link SchemaVersionMismatchError} when the stored version is
 * newer than this build — that last case must be surfaced, never downgraded.
 */
export async function loadWorkspace(): Promise<Workspace | null> {
  let record: WorkspaceRecord | undefined
  try {
    record = await getDb().workspaces.get(WORKSPACE_KEY)
  } catch (cause) {
    throw new WorkspaceReadError('failed to read workspace from IndexedDB', { cause })
  }

  if (record === undefined) return null

  assertSchemaVersionSupported(record.workspace?.schemaVersion)
  return record.workspace
}

/**
 * Persist the workspace. Throws {@link WorkspaceWriteError} on failure so the
 * UI can show it instead of swallowing a lost save.
 */
export async function saveWorkspace(workspace: Workspace): Promise<void> {
  try {
    await getDb().workspaces.put({ id: WORKSPACE_KEY, workspace })
  } catch (cause) {
    throw new WorkspaceWriteError('failed to save workspace to IndexedDB', { cause })
  }
}
