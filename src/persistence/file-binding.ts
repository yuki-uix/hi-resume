import type { Workspace } from '../domain/composition/types'
import { parseWorkspaceFile, serializeWorkspace, WORKSPACE_FILE_NAME } from '../features/export/json'
import {
  FileChangedElsewhereError,
  WorkspaceFileReadError,
  WorkspaceFileWriteError,
} from './errors'

/**
 * The File System Access adapter (#45): everything that touches a
 * `FileSystemFileHandle` lives here, and nothing else in the app calls the FSA
 * API directly.
 *
 * The file the user binds to holds *exactly* the JSON backup format — this
 * module writes it with `serializeWorkspace` and reads it with
 * `parseWorkspaceFile`, the same two functions the import/export feature uses.
 * That import is the guarantee that a bound file and an exported backup can
 * never drift into two formats: there is only one writer and one reader.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **Every failure throws.** A write that did not land must never resolve
 *    successfully — the caller has to be able to tell the user. There is no
 *    "fall back to IndexedDB and stay quiet" path anywhere in here.
 * 2. **No pretending.** {@link isFileBindingSupported} reports the real API's
 *    presence. Where it is missing (Safari, Firefox) the app hides the binding
 *    entry rather than substituting OPFS, which would look like a file to the
 *    user while dying with the rest of the site data.
 */

/** What `queryPermission` / `requestPermission` can answer for the handle. */
export type WritePermission = 'granted' | 'prompt' | 'denied'

/**
 * The Chromium permission methods on `FileSystemHandle` are not in the DOM
 * typings (they are an FSA extension), so they are narrowed here rather than
 * declared globally — keeping the `any`-shaped surface to this one spot.
 */
type PermissionCapableHandle = FileSystemFileHandle & {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<WritePermission>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<WritePermission>
}

type SaveFilePickerWindow = typeof window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
}

/**
 * Whether this browser can bind to a real file at all.
 *
 * Checked against `showSaveFilePicker` because that is the entry point the user
 * needs; a browser with only part of the API is treated as unsupported.
 */
export function isFileBindingSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as SaveFilePickerWindow).showSaveFilePicker === 'function'
}

/**
 * Ask the user for a file. Returns `null` when they cancel the dialog — a
 * cancel is a normal outcome, not an error, and must not surface as a failure.
 *
 * Requires transient user activation, so this may only be called from a click
 * handler. The OS dialog it opens cannot be driven by Playwright, which is why
 * everything *after* the handle arrives is a separate, testable function.
 */
export async function pickWorkspaceFile(): Promise<FileSystemFileHandle | null> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker
  if (typeof picker !== 'function') {
    throw new WorkspaceFileWriteError('this browser has no showSaveFilePicker')
  }
  try {
    return await picker({
      suggestedName: WORKSPACE_FILE_NAME,
      types: [{ description: 'hi-resume 工作区', accept: { 'application/json': ['.json'] } }],
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return null
    throw new WorkspaceFileWriteError(describe(cause), { cause })
  }
}

/**
 * Read the current readwrite permission without prompting.
 *
 * When the method is absent the answer is `'granted'`: the app cannot ask, so
 * it proceeds and lets the actual read/write fail loudly if it is not allowed.
 * That is the honest default here — the alternative (assume denied) would hide a
 * working binding, and unlike a save it cannot silently lose anything.
 */
export async function queryWritePermission(handle: FileSystemFileHandle): Promise<WritePermission> {
  const query = (handle as PermissionCapableHandle).queryPermission
  if (typeof query !== 'function') return 'granted'
  try {
    return await query.call(handle, { mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/**
 * Prompt for readwrite permission. Requires transient user activation, so this
 * belongs in a click handler — never in a startup effect, where the browser
 * would reject it and the user would see a spurious denial.
 */
export async function requestWritePermission(handle: FileSystemFileHandle): Promise<WritePermission> {
  const request = (handle as PermissionCapableHandle).requestPermission
  if (typeof request !== 'function') return 'granted'
  try {
    return await request.call(handle, { mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/** What the bound file holds right now, plus the mtime that version carries. */
export type FileSnapshot = {
  text: string
  /** `File.lastModified` — the browser's own mtime, the file side of the clock. */
  lastModified: number
}

/**
 * Read the bound file's raw text and mtime.
 *
 * Throws {@link WorkspaceFileReadError} when the file is gone (deleted or moved
 * out from under the handle) so the caller can say so instead of quietly
 * treating a missing file as an empty one — that mistake would look exactly like
 * "your resume is empty".
 */
export async function readFileSnapshot(handle: FileSystemFileHandle): Promise<FileSnapshot> {
  try {
    const file = await handle.getFile()
    return { text: await file.text(), lastModified: file.lastModified }
  } catch (cause) {
    throw new WorkspaceFileReadError(describe(cause), { cause })
  }
}

/** A file with nothing but whitespace in it — a freshly created file. */
export function isBlankFile(snapshot: FileSnapshot): boolean {
  return snapshot.text.trim() === ''
}

/**
 * Parse a snapshot into a workspace using the *import* path, so a hand-edited
 * file is validated exactly as an imported backup would be (#27).
 */
export function parseFileSnapshot(snapshot: FileSnapshot): ReturnType<typeof parseWorkspaceFile> {
  return parseWorkspaceFile(snapshot.text)
}

/**
 * Overwrite the bound file with the workspace and return the file's new mtime.
 *
 * The returned mtime is read back from the file *after* the write — it is the
 * browser's fact about what is now on disk, not our guess — and becomes the
 * `fileVersionAt` stamp the next startup compares against.
 */
export async function writeWorkspaceToFile(
  handle: FileSystemFileHandle,
  workspace: Workspace,
): Promise<number> {
  const text = serializeWorkspace(workspace)
  let writable: FileSystemWritableFileStream
  try {
    // Truncates by default, so a shorter workspace cannot leave a tail of the
    // previous, longer JSON behind and produce an unparseable file.
    writable = await handle.createWritable()
  } catch (cause) {
    throw new WorkspaceFileWriteError(describe(cause), { cause })
  }

  try {
    await writable.write(text)
    await writable.close()
  } catch (cause) {
    await writable.abort().catch(() => {})
    throw new WorkspaceFileWriteError(describe(cause), { cause })
  }

  try {
    return (await handle.getFile()).lastModified
  } catch (cause) {
    throw new WorkspaceFileWriteError(describe(cause), { cause })
  }
}

/**
 * The autosave path's write: bring the bound file in line with the workspace,
 * and return the mtime the two now share.
 *
 * Unlike {@link writeWorkspaceToFile} this refuses to overwrite blindly, because
 * autosave runs on its own schedule — including once on page unload, where there
 * is no user watching and no opportunity to ask. Two checks stand between it and
 * the file:
 *
 * - **Identical content is not written at all.** Otherwise every page close
 *   would rewrite the file with bytes it already has, churn its mtime, and — the
 *   part that actually loses data — overwrite a change made in another program
 *   while this tab sat idle.
 * - **A file that moved on since our last write is left alone**, and the save
 *   fails loudly. Overwriting would silently pick this app's copy over the
 *   user's other edit, which is exactly the choice #45 says only the user may
 *   make. Refusing leaves the cache marked unsynced, so the next startup shows
 *   the conflict prompt and the user decides there.
 *
 * `expectedVersionAt` is the mtime this app believes the file has. `null` skips
 * the second check, for the paths where the user has explicitly asked to
 * overwrite.
 */
export async function syncWorkspaceToFile(
  handle: FileSystemFileHandle,
  workspace: Workspace,
  expectedVersionAt: number | null,
): Promise<number> {
  const text = serializeWorkspace(workspace)

  let snapshot: FileSnapshot
  try {
    snapshot = await readFileSnapshot(handle)
  } catch (cause) {
    // From the save path's point of view an unreadable file is a failed write,
    // and it must be reported as one — the edit did not reach the file.
    throw new WorkspaceFileWriteError(describe(cause), { cause })
  }

  if (snapshot.text === text) return snapshot.lastModified

  if (expectedVersionAt !== null && snapshot.lastModified !== expectedVersionAt) {
    throw new FileChangedElsewhereError(
      `file changed at ${snapshot.lastModified}, expected ${expectedVersionAt}`,
    )
  }

  return writeWorkspaceToFile(handle, workspace)
}

function describe(cause: unknown): string {
  if (cause instanceof DOMException) return `${cause.name}: ${cause.message}`
  if (cause instanceof Error) return cause.message
  return String(cause)
}
