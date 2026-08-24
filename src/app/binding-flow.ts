import type { Workspace } from '../domain/composition/types'
import {
  decideStartupSource,
  isWorkspaceEmpty,
  type WorkspaceVersions,
} from '../persistence/binding-policy'
import { createEmptyWorkspace } from '../persistence/empty-workspace'
import {
  isBlankFile,
  parseFileSnapshot,
  queryWritePermission,
  readFileSnapshot,
  requestWritePermission,
  writeWorkspaceToFile,
  type WritePermission,
} from '../persistence/file-binding'
import { loadBinding, loadWorkspace, saveBinding, saveWorkspace } from '../persistence/workspace-db'
import {
  BIND_PERMISSION,
  FILE_INVALID,
  FILE_READ_FAILED_PREFIX,
} from './storage-status'

/**
 * The three flows a bound workspace goes through (#45), kept out of the React
 * component so the ordering rules are readable in one place:
 *
 * - {@link resolveStartup} — what to load on launch;
 * - {@link bindToFile} — what happens when the user picks a file;
 * - {@link resolveConflict} — what happens after the user chooses a side.
 *
 * The rule they all obey: **nothing is written to either the file or the cache
 * until the outcome is unambiguous.** Every branch that cannot decide on its own
 * returns a `conflict` for the user to settle, and every branch that cannot
 * proceed returns an `issue` that the status line shows. None of them fall back
 * to writing one side quietly.
 */

/** A live, writable binding. */
export type BoundFile = {
  handle: FileSystemFileHandle
  fileName: string
  versions: WorkspaceVersions
}

/**
 * Something is wrong with the binding. The app keeps working against IndexedDB
 * and says so — it does not present itself as bound.
 */
export type BindingIssue = {
  message: string
  /**
   * The handle, when a click could still fix this by re-requesting permission.
   * `null` for problems a permission prompt cannot solve (a deleted file, a file
   * that is not a workspace).
   */
  regrant: FileSystemFileHandle | null
}

/** Two real versions, waiting on the user. Nothing has been written. */
export type PendingConflict = {
  handle: FileSystemFileHandle
  fileName: string
  fileWorkspace: Workspace
  cacheWorkspace: Workspace
  cacheAt: number
  fileAt: number
}

export type StartupResolution =
  | {
      kind: 'ready'
      workspace: Workspace
      /** Write this workspace to IndexedDB once on mount; not user content. */
      persistCache: boolean
      bound: BoundFile | null
      issue: BindingIssue | null
    }
  | { kind: 'conflict'; conflict: PendingConflict }

export type BindResult =
  | { kind: 'bound'; bound: BoundFile; adopted: Workspace | null }
  | { kind: 'conflict'; conflict: PendingConflict }
  | { kind: 'issue'; issue: BindingIssue }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function bound(handle: FileSystemFileHandle, versions: WorkspaceVersions): BoundFile {
  return { handle, fileName: handle.name, versions }
}

/** Both stamps set to the file's mtime: the two copies hold the same content. */
function syncedAt(fileVersionAt: number): WorkspaceVersions {
  return { cacheVersionAt: fileVersionAt, fileVersionAt }
}

/**
 * Decide what the app loads at launch.
 *
 * Throws only what the pre-#45 startup already threw — an IndexedDB read
 * failure or an unsupported `schemaVersion` — so the existing error screen is
 * unchanged. Every *binding* problem is returned as an `issue` instead, because
 * a broken binding must not stop the user from reaching their work.
 */
export async function resolveStartup(): Promise<StartupResolution> {
  const cacheWorkspace = await loadWorkspace()
  const binding = await loadBinding()

  if (binding === null) {
    return {
      kind: 'ready',
      workspace: cacheWorkspace ?? createEmptyWorkspace(),
      persistCache: cacheWorkspace === null,
      bound: null,
      issue: null,
    }
  }

  const fallback = cacheWorkspace ?? createEmptyWorkspace()
  const unbound = (issue: BindingIssue): StartupResolution => ({
    kind: 'ready',
    workspace: fallback,
    persistCache: cacheWorkspace === null,
    bound: null,
    issue,
  })

  // `requestPermission` needs a user gesture, which a startup effect does not
  // have; asking here would produce a spurious denial. So startup only *queries*
  // and offers a button when the answer is `prompt`.
  const permission = await queryWritePermission(binding.handle)
  if (permission !== 'granted') {
    return unbound({
      message: BIND_PERMISSION[permission === 'denied' ? 'denied' : 'prompt'],
      regrant: binding.handle,
    })
  }

  let snapshot
  try {
    snapshot = await readFileSnapshot(binding.handle)
  } catch (error) {
    return unbound({ message: FILE_READ_FAILED_PREFIX + describe(error), regrant: null })
  }

  // A file that is empty or unreadable as a workspace is damage, not truth.
  // Adopting it would present the user with a blank resume, and overwriting it
  // would destroy whatever is actually in there — so do neither, and say so.
  if (isBlankFile(snapshot)) {
    return unbound({ message: FILE_READ_FAILED_PREFIX + FILE_INVALID, regrant: null })
  }
  const parsed = parseFileSnapshot(snapshot)
  if (!parsed.ok) {
    return unbound({ message: FILE_READ_FAILED_PREFIX + parsed.errors.join('；'), regrant: null })
  }

  const decision = decideStartupSource({
    versions: { cacheVersionAt: binding.cacheVersionAt, fileVersionAt: binding.fileVersionAt },
    fileLastModified: snapshot.lastModified,
    hasCachedWorkspace: cacheWorkspace !== null,
  })

  if (decision.kind === 'conflict' && cacheWorkspace !== null) {
    // Return before any write. The caller blocks the editor on this, so no
    // autosave controller exists yet either — there is nothing that *could*
    // write while the user decides.
    return {
      kind: 'conflict',
      conflict: {
        handle: binding.handle,
        fileName: binding.handle.name,
        fileWorkspace: parsed.workspace,
        cacheWorkspace,
        cacheAt: decision.cacheAt,
        fileAt: decision.fileAt,
      },
    }
  }

  // The file is the truth. Adopt it and refresh the cache from it, so the two
  // copies agree again.
  const versions = syncedAt(snapshot.lastModified)
  await saveBinding(binding.handle, versions)
  return {
    kind: 'ready',
    workspace: parsed.workspace,
    persistCache: true,
    bound: bound(binding.handle, versions),
    issue: null,
  }
}

/**
 * Bind the workspace to a handle the user just chose.
 *
 * Called with a handle from `showSaveFilePicker`, and — in the Playwright tests
 * — with a real OPFS handle, which is the same `FileSystemFileHandle` interface.
 * Everything below this line is identical either way; only the dialog differs.
 */
export async function bindToFile(
  handle: FileSystemFileHandle,
  currentWorkspace: Workspace,
): Promise<BindResult> {
  // A click got us here, so there *is* user activation and a prompt is allowed.
  let permission: WritePermission = await queryWritePermission(handle)
  if (permission === 'prompt') permission = await requestWritePermission(handle)
  if (permission !== 'granted') {
    return { kind: 'issue', issue: { message: BIND_PERMISSION.denied, regrant: handle } }
  }

  let snapshot
  try {
    snapshot = await readFileSnapshot(handle)
  } catch (error) {
    return { kind: 'issue', issue: { message: FILE_READ_FAILED_PREFIX + describe(error), regrant: null } }
  }

  // A brand-new file from the picker: nothing to lose, so seed it.
  if (isBlankFile(snapshot)) {
    let fileVersionAt: number
    try {
      fileVersionAt = await writeWorkspaceToFile(handle, currentWorkspace)
    } catch (error) {
      return { kind: 'issue', issue: { message: describe(error), regrant: null } }
    }
    const versions = syncedAt(fileVersionAt)
    await saveBinding(handle, versions)
    return { kind: 'bound', bound: bound(handle, versions), adopted: null }
  }

  const parsed = parseFileSnapshot(snapshot)
  if (!parsed.ok) {
    // Refuse rather than overwrite: the user may have picked the wrong file, and
    // whatever is in it is not ours to destroy.
    return { kind: 'issue', issue: { message: FILE_INVALID, regrant: null } }
  }

  // The file already holds a workspace. If the editor holds nothing the user
  // typed, this is a restore — adopt the file. Otherwise there are two real
  // versions and only the user can say which survives.
  if (!isWorkspaceEmpty(currentWorkspace)) {
    return {
      kind: 'conflict',
      conflict: {
        handle,
        fileName: handle.name,
        fileWorkspace: parsed.workspace,
        cacheWorkspace: currentWorkspace,
        cacheAt: Date.now(),
        fileAt: snapshot.lastModified,
      },
    }
  }

  const versions = syncedAt(snapshot.lastModified)
  await saveWorkspace(parsed.workspace)
  await saveBinding(handle, versions)
  return { kind: 'bound', bound: bound(handle, versions), adopted: parsed.workspace }
}

/**
 * Apply the user's choice. This is the first write in the conflict path — up to
 * here both copies are untouched.
 */
export async function resolveConflict(
  conflict: PendingConflict,
  choice: 'file' | 'cache',
): Promise<{ bound: BoundFile; workspace: Workspace }> {
  if (choice === 'file') {
    const versions = syncedAt(conflict.fileAt)
    await saveWorkspace(conflict.fileWorkspace)
    await saveBinding(conflict.handle, versions)
    return { bound: bound(conflict.handle, versions), workspace: conflict.fileWorkspace }
  }

  // Overwrite the file with the cached copy. The file write goes first: if it
  // fails the error propagates and the stamps stay as they were, so the next
  // startup asks again rather than recording a sync that never happened.
  const fileVersionAt = await writeWorkspaceToFile(conflict.handle, conflict.cacheWorkspace)
  const versions = syncedAt(fileVersionAt)
  await saveWorkspace(conflict.cacheWorkspace)
  await saveBinding(conflict.handle, versions)
  return { bound: bound(conflict.handle, versions), workspace: conflict.cacheWorkspace }
}
