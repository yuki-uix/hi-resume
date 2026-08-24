import type { Workspace } from '../domain/composition/types'

/**
 * Debounced write-behind for the editor store.
 *
 * Every keystroke mutates the store; writing each one to IndexedDB would be
 * wasteful, so `notify()` collapses a burst of edits into one save after a
 * quiet window. `flush()` skips the window entirely and writes the latest
 * workspace now — that is the `beforeunload` path, so edits made inside the
 * debounce window still land before the page goes away.
 *
 * The controller is storage-agnostic: it takes a `save` function, so the
 * debounce/flush behaviour is unit-testable with a fake save and no IndexedDB
 * (the default-assembly path is covered by the Playwright tests instead).
 */

/**
 * The quiet window between the last edit and the write. Named so the debounce
 * length lives in exactly one place rather than as a magic number in a
 * `setTimeout`.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1000

export type SaveWorkspace = (workspace: Workspace) => Promise<void>

export type AutosaveController = {
  /** Record an edit; schedules a debounced save. */
  notify: () => void
  /**
   * Cancel any pending debounce and save the latest workspace immediately.
   * Does nothing when no edit is waiting to be written.
   */
  flush: () => Promise<void>
  dispose: () => void
}

export function createAutosaveController(options: {
  /** Always returns the latest workspace, read at save time (latest wins). */
  getWorkspace: () => Workspace
  save: SaveWorkspace
  debounceMs?: number
  onSaved?: (savedAt: number) => void
  onError?: (error: unknown) => void
  /** Injectable clock for tests; defaults to `Date.now`. */
  now?: () => number
}): AutosaveController {
  const { getWorkspace, save, onSaved, onError } = options
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS
  const now = options.now ?? (() => Date.now())

  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  // Whether an edit has arrived that no completed save has covered yet. Without
  // it `flush` would write on every page close even when nothing changed, and a
  // save is no longer free: since #45 it also writes the user's file, where a
  // pointless rewrite can clobber a change another program made while this tab
  // sat idle.
  let dirty = false

  const saveNow = async (): Promise<void> => {
    // Cleared before the await, so an edit landing mid-save marks the controller
    // dirty again rather than being swallowed by this save's completion.
    dirty = false
    try {
      await save(getWorkspace())
      onSaved?.(now())
    } catch (error) {
      // The work is still unwritten, so a later flush must try again.
      dirty = true
      onError?.(error)
      throw error
    }
  }

  const notify = (): void => {
    if (disposed) return
    dirty = true
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      // Nothing awaits the debounced save, and `saveNow` rethrows for `flush`'s
      // callers, so the rejection is settled here. The failure is not lost: it
      // has already gone to `onError`, which is what puts it on screen.
      void saveNow().catch(() => {})
    }, debounceMs)
  }

  const flush = async (): Promise<void> => {
    if (disposed) return
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (!dirty) return
    await saveNow()
  }

  const dispose = (): void => {
    disposed = true
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  return { notify, flush, dispose }
}
