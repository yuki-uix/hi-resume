import type { Workspace } from '../domain/composition/types'
import type { SaveWorkspace } from './autosave'
import { versionsAfterSave, type WorkspaceVersions } from './binding-policy'

/**
 * The dual write (#45): one save lands in IndexedDB *and* in the user's file.
 *
 * Three properties this module exists to guarantee, all of them load-bearing:
 *
 * 1. **Neither target may be skipped because the other failed.** They are
 *    attempted independently and both errors are collected; a broken file does
 *    not cost the user their working copy, and a broken IndexedDB does not stop
 *    the file — the only copy that survives a cache wipe — from being written.
 * 2. **A failed file write is loud.** `save` rejects, so the autosave
 *    controller's `onError` fires and the status line shows it. There is
 *    deliberately no branch that swallows a file error and reports success
 *    because IndexedDB worked: that would tell the user their resume is in their
 *    file when it is not, which is worse than never binding at all.
 * 3. **The outcome is recorded.** The version stamps are updated and persisted
 *    on every attempt, success or failure, so the *next* startup knows whether
 *    the file received the latest edits — see `binding-policy.ts`.
 *
 * The saver holds no state of its own: the binding can appear (the user binds
 * mid-session) or change while a debounced save is already pending, so both the
 * file target and the stamps are read through accessors at save time rather than
 * captured when the controller is built. A saver that captured them would keep
 * writing to yesterday's binding.
 */

export type SyncTargets = {
  /** Write to IndexedDB. Always attempted. */
  saveCache: SaveWorkspace
  /**
   * Write to the bound file and return its new mtime, or `null` when no file is
   * bound right now. Read at save time, never captured.
   */
  writeFile: (workspace: Workspace) => Promise<number | null>
  /** The stamps as of this moment. */
  getVersions: () => WorkspaceVersions
  /** Persist the new stamps. Attempted after both writes have been tried. */
  saveVersions: (versions: WorkspaceVersions) => Promise<void>
  now?: () => number
}

/** Build the `save` handed to `createAutosaveController`. */
export function createWorkspaceSaver(targets: SyncTargets): SaveWorkspace {
  const { saveCache, writeFile, getVersions, saveVersions } = targets
  const now = targets.now ?? (() => Date.now())

  return async (workspace) => {
    // Both writes are attempted before either error is thrown. Sequential
    // rather than concurrent so the ordering is deterministic and a shared
    // failure cannot leave one of them half-issued.
    let cacheError: unknown = null
    try {
      await saveCache(workspace)
    } catch (error) {
      cacheError = error
    }

    let fileError: unknown = null
    let writtenFileVersionAt: number | null = null
    try {
      writtenFileVersionAt = await writeFile(workspace)
    } catch (error) {
      fileError = error
    }

    const versions = versionsAfterSave({
      previous: getVersions(),
      writtenFileVersionAt,
      now: now(),
    })

    let versionsError: unknown = null
    try {
      await saveVersions(versions)
    } catch (error) {
      versionsError = error
    }

    // The file error wins when several fail: it is the one that says "the copy
    // that survives a cache wipe is stale", which is the more urgent fact.
    if (fileError !== null) throw fileError
    if (cacheError !== null) throw cacheError
    if (versionsError !== null) throw versionsError
  }
}
