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

/**
 * Writing the *bound file* failed — the file was deleted or moved, permission
 * was revoked, or the disk refused the write.
 *
 * This is deliberately a distinct type from {@link WorkspaceWriteError}: the two
 * targets fail independently, and a file failure must reach the user even when
 * the IndexedDB write succeeded. Silently falling back to "IndexedDB only" would
 * be the app pretending the save landed in the user's file when it did not.
 */
export class WorkspaceFileWriteError extends WorkspaceStorageError {}

/** Reading the bound file failed (deleted, moved, or unreadable). */
export class WorkspaceFileReadError extends WorkspaceStorageError {}

/**
 * The file changed since this app last wrote it, so the save was refused rather
 * than allowed to overwrite someone else's edit.
 *
 * A subclass of {@link WorkspaceFileWriteError} because it *is* a failed write
 * as far as every caller is concerned; it carries its own type only so the UI
 * can explain the cause, which is not a disk error and not the user's fault.
 */
export class FileChangedElsewhereError extends WorkspaceFileWriteError {}
