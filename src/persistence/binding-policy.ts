import type { Workspace } from '../domain/composition/types'

/**
 * The two decisions that govern a file-bound workspace (#45), kept pure so they
 * are testable without a browser, IndexedDB, or a real file.
 *
 * ## The version stamps
 *
 * A binding carries two numbers, both in epoch-ms:
 *
 * - `fileVersionAt` — the file's `lastModified` *as of the last write this app
 *   completed successfully*. Read back from the file itself, so it is the
 *   browser's fact, not our guess.
 * - `cacheVersionAt` — the logical version time of the workspace sitting in
 *   IndexedDB.
 *
 * The pair is maintained so that `cacheVersionAt === fileVersionAt` means
 * exactly "the cached copy and the file hold the same content". A successful
 * dual write sets both to the file's new mtime; a *failed* file write leaves
 * `fileVersionAt` where it was and moves `cacheVersionAt` forward, which is what
 * makes "the cache is ahead of the file" a recorded fact rather than a guess.
 *
 * Comparing the two directly would be wrong without that discipline: the cache
 * write always finishes a few milliseconds after the file write, so a naive
 * `cacheSavedAt > fileMtime` would report a conflict after every single save.
 */

/** The stamps stored alongside the handle. */
export type WorkspaceVersions = {
  cacheVersionAt: number
  fileVersionAt: number
}

export type StartupDecision =
  /** The file is the truth; adopt its contents. */
  | { kind: 'file' }
  /**
   * The cached copy is ahead of the file — last session could not finish
   * writing, or the file was replaced by an older copy. The user must choose;
   * nothing may be written to either side first.
   */
  | { kind: 'conflict'; cacheAt: number; fileAt: number }

/**
 * Decide what a bound workspace loads at startup.
 *
 * **The file is the only source of truth**, with exactly one exception: when the
 * cache holds edits the file never received, picking either side silently would
 * throw away real work. That case — and only that case — asks the user.
 *
 * Note what is deliberately *not* a conflict: the file having moved on while the
 * cache stayed put (someone edited the file elsewhere). That is the normal case
 * for "file is truth" and loads the file without asking. The cache being ahead
 * is the only thing the file cannot answer for.
 *
 * There is no auto-merge branch here, and no "newest wins" branch. Both were
 * considered and are ruled out by the issue: a merge would invent content the
 * user never wrote, and "newest wins" is a silent choice.
 */
export function decideStartupSource(input: {
  versions: WorkspaceVersions
  /** The file's mtime right now, which may be newer than `fileVersionAt`. */
  fileLastModified: number
  /** `false` when IndexedDB holds no workspace at all — nothing to conflict with. */
  hasCachedWorkspace: boolean
}): StartupDecision {
  const { versions, fileLastModified, hasCachedWorkspace } = input

  if (!hasCachedWorkspace) return { kind: 'file' }

  // Strictly ahead: equal stamps mean a completed dual write, which is the
  // overwhelmingly common case and must never prompt.
  const cacheIsAhead = versions.cacheVersionAt > versions.fileVersionAt
  if (!cacheIsAhead) return { kind: 'file' }

  return { kind: 'conflict', cacheAt: versions.cacheVersionAt, fileAt: fileLastModified }
}

/**
 * Compute the stamps to record after a save attempt.
 *
 * On a successful file write both stamps become the file's fresh mtime, marking
 * the two copies as identical. When the file write failed (or there is no file),
 * the cache stamp moves to now — strictly past `fileVersionAt`, so the next
 * startup sees the divergence and asks.
 */
export function versionsAfterSave(input: {
  previous: WorkspaceVersions
  /** The file's mtime after a successful write, or `null` if it did not happen. */
  writtenFileVersionAt: number | null
  now: number
}): WorkspaceVersions {
  const { previous, writtenFileVersionAt, now } = input

  if (writtenFileVersionAt !== null) {
    return { cacheVersionAt: writtenFileVersionAt, fileVersionAt: writtenFileVersionAt }
  }

  // `Math.max` rather than a bare `now`: if the clock is behind the file's mtime
  // (skew, a file copied from another machine), a bare `now` could land at or
  // below `fileVersionAt` and the unsynced edits would be silently dropped at
  // the next startup. Erring one millisecond ahead only ever costs a prompt.
  return {
    cacheVersionAt: Math.max(now, previous.fileVersionAt + 1),
    fileVersionAt: previous.fileVersionAt,
  }
}

/**
 * Whether a workspace holds nothing the user typed.
 *
 * Used at bind time to tell "I am restoring onto a fresh install" from "I am
 * pointing my existing work at a file that already has content". The first can
 * adopt the file outright — there is provably nothing to lose — while the second
 * has two real versions and must go through the same prompt as a startup
 * conflict.
 *
 * Structure the app creates on its own — the six built-in sections, their empty
 * selections, the page size — is not content. Only what a user can type is.
 */
export function isWorkspaceEmpty(workspace: Workspace): boolean {
  const { pool, master, variants } = workspace

  if (variants.length > 0) return false
  if (Object.keys(pool.entries).length > 0) return false
  if (Object.keys(pool.bullets).length > 0) return false

  const basics = pool.basics
  if (basics.name.trim() !== '') return false
  for (const value of [basics.headline, basics.email, basics.phone, basics.location]) {
    if (value !== undefined && value.trim() !== '') return false
  }
  if (basics.links !== undefined && basics.links.length > 0) return false

  // Prose typed into a text-layout section, and any renamed section title.
  for (const section of Object.values(pool.sections)) {
    if (section.text !== undefined && section.text.trim() !== '') return false
  }
  if (Object.keys(master.sectionTitles).length > 0) return false

  return true
}
