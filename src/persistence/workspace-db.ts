import Dexie, { type Table } from 'dexie'

import type { Workspace } from '../domain/composition/types'
import type { WorkspaceVersions } from './binding-policy'
import {
  BINDING_KEY,
  BINDING_TABLE,
  WORKSPACE_DB_NAME,
  WORKSPACE_DB_VERSION,
  WORKSPACE_KEY,
  WORKSPACE_TABLE,
} from './constants'
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

/**
 * The file binding (#45). `FileSystemFileHandle` is structured-cloneable, so the
 * handle itself round-trips through IndexedDB and the app can reopen the user's
 * file on the next launch without asking again.
 *
 * The stamps travel with the handle deliberately: they only mean anything
 * relative to *this* file, and dropping the binding must drop them too.
 */
export type BindingRecord = {
  id: string
  handle: FileSystemFileHandle
} & WorkspaceVersions

class WorkspaceDatabase extends Dexie {
  workspaces!: Table<WorkspaceRecord, string>
  bindings!: Table<BindingRecord, string>

  constructor() {
    super(WORKSPACE_DB_NAME)
    // v1 stays declared so an existing database upgrades in place rather than
    // being rebuilt — the workspace row must survive the addition of `bindings`.
    this.version(1).stores({ [WORKSPACE_TABLE]: 'id' })
    this.version(WORKSPACE_DB_VERSION).stores({
      [WORKSPACE_TABLE]: 'id',
      [BINDING_TABLE]: 'id',
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

/**
 * Read the file binding, or `null` when the workspace is not bound to a file.
 *
 * A binding whose handle did not survive (a browser that dropped it, a record
 * written by an older build) reads as "not bound" rather than as an error: the
 * app can still work from IndexedDB, and the user can bind again.
 */
export async function loadBinding(): Promise<BindingRecord | null> {
  let record: BindingRecord | undefined
  try {
    record = await getDb().bindings.get(BINDING_KEY)
  } catch (cause) {
    throw new WorkspaceReadError('failed to read the file binding from IndexedDB', { cause })
  }

  if (record === undefined) return null
  if (typeof record.handle?.getFile !== 'function') return null
  return record
}

/** Store the handle and its version stamps. Overwrites any previous binding. */
export async function saveBinding(
  handle: FileSystemFileHandle,
  versions: WorkspaceVersions,
): Promise<void> {
  try {
    await getDb().bindings.put({ id: BINDING_KEY, handle, ...versions })
  } catch (cause) {
    throw new WorkspaceWriteError('failed to save the file binding to IndexedDB', { cause })
  }
}
