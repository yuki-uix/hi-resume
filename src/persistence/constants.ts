/**
 * Persistence constants, split out from `workspace-db.ts` so tests (including
 * Playwright, which runs in Node) can reference the IndexedDB names without
 * pulling Dexie into the test process.
 */

/** IndexedDB database name. */
export const WORKSPACE_DB_NAME = 'hi-resume'

/** Dexie schema version — distinct from the workspace `schemaVersion`. */
export const WORKSPACE_DB_VERSION = 1

/** The single table that holds the workspace record. */
export const WORKSPACE_TABLE = 'workspaces'

/**
 * The primary key of the one and only workspace row. M1 owns a single local
 * workspace, so there is exactly one row with this fixed key.
 */
export const WORKSPACE_KEY = 'default'
