/**
 * Identifiable storage error types.
 *
 * The UI must be able to tell "your data is from a newer version" apart from
 * "the disk read failed" and "the disk write failed", so every failure path
 * throws one of these instead of a raw Dexie/DOM error. `instanceof` on the
 * class is the contract — callers show a distinct message per type and never
 * string-match on the message text.
 */
export class WorkspaceStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

/**
 * The stored `schemaVersion` is higher than this build supports. The workspace
 * is left untouched — the caller must refuse to load and must not overwrite.
 */
export class SchemaVersionMismatchError extends WorkspaceStorageError {
  constructor(
    public readonly storedVersion: number,
    public readonly supportedVersion: number,
  ) {
    super(
      `workspace schemaVersion ${storedVersion} is newer than the supported version ${supportedVersion}`,
    )
  }
}

/** Reading the stored workspace failed (IndexedDB error or corrupt record). */
export class WorkspaceReadError extends WorkspaceStorageError {}

/** Writing the workspace failed. */
export class WorkspaceWriteError extends WorkspaceStorageError {}
