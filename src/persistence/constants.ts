/**
 * Persistence constants, split out from `workspace-db.ts` so tests (including
 * Playwright, which runs in Node) can reference the IndexedDB names without
 * pulling Dexie into the test process.
 */

/** IndexedDB database name. */
export const WORKSPACE_DB_NAME = 'hi-resume'

/**
 * Dexie schema version — distinct from the workspace `schemaVersion`.
 *
 * v1 held only `workspaces`. v2 adds `bindings`, the row that remembers which
 * file the workspace is bound to (#45); Dexie upgrades an existing v1 database
 * in place, so the workspace row survives the bump untouched.
 */
export const WORKSPACE_DB_VERSION = 2

/** The single table that holds the workspace record. */
export const WORKSPACE_TABLE = 'workspaces'

/**
 * The primary key of the one and only workspace row. M1 owns a single local
 * workspace, so there is exactly one row with this fixed key.
 */
export const WORKSPACE_KEY = 'default'

/**
 * The table holding the file binding: the `FileSystemFileHandle` plus the two
 * version stamps that decide, at startup, whether the file and the cached copy
 * still agree. Separate from `workspaces` so a binding can be dropped without
 * rewriting the workspace, and vice versa.
 */
export const BINDING_TABLE = 'bindings'

/** The primary key of the one and only binding row — one workspace, one file. */
export const BINDING_KEY = 'default'
