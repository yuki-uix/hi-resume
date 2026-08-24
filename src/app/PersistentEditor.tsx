import { useCallback, useEffect, useRef, useState } from 'react'

import type { Workspace } from '../domain/composition/types'
import { SectionsEditor } from '../features/editor/sections/SectionsEditor'
import { createEditorStore, type EditorStore } from '../features/editor/editor-store'
import { WorkspaceBackup } from '../features/export/WorkspaceBackup'
import { AUTOSAVE_DEBOUNCE_MS, createAutosaveController, type AutosaveController } from '../persistence/autosave'
import type { WorkspaceVersions } from '../persistence/binding-policy'
import { SchemaVersionMismatchError, WorkspaceStorageError } from '../persistence/errors'
import {
  isFileBindingSupported,
  pickWorkspaceFile,
  requestWritePermission,
  syncWorkspaceToFile,
} from '../persistence/file-binding'
import { requestPersistentStorage } from '../persistence/persist'
import { saveBinding, saveWorkspace } from '../persistence/workspace-db'
import { createWorkspaceSaver } from '../persistence/workspace-sync'
import {
  bindToFile,
  resolveConflict,
  resolveStartup,
  type BindingIssue,
  type BoundFile,
  type PendingConflict,
} from './binding-flow'
import { ConflictChoice } from './ConflictChoice'
import { StorageStatus } from './StorageStatus'
import { BIND_FAILED_PREFIX, type PersistState } from './storage-status'
import './app.css'

/**
 * The production startup path: resolve where the workspace comes from (the bound
 * file, or IndexedDB), wire the editor store to debounced autosave, and force a
 * flush on `beforeunload` / `pagehide` so edits inside the debounce window
 * survive a close.
 *
 * Four states: loading, a load error (shown and left in place — never downgraded
 * or overwritten), an unresolved file/cache conflict, and ready. First launch
 * (empty IndexedDB) builds the empty workspace and persists it, but that initial
 * save does not count as "user content saved", so the status line still reads
 * "尚未保存" until the first edit-triggered autosave.
 *
 * The conflict state blocks the editor from mounting at all. That is what makes
 * "nothing is written before the user chooses" true by construction rather than
 * by review: with no editor there is no store subscription and no autosave
 * controller, so there is no code path that could write.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: WorkspaceStorageError }
  | { status: 'conflict'; conflict: PendingConflict }
  | {
      status: 'ready'
      workspace: Workspace
      persistCache: boolean
      bound: BoundFile | null
      issue: BindingIssue | null
    }

function toStorageError(error: unknown): WorkspaceStorageError {
  if (error instanceof WorkspaceStorageError) return error
  return new WorkspaceStorageError(error instanceof Error ? error.message : String(error), { cause: error })
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function PersistentEditor() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [conflictError, setConflictError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    resolveStartup()
      .then((resolution) => {
        if (cancelled) return
        setState(
          resolution.kind === 'conflict'
            ? { status: 'conflict', conflict: resolution.conflict }
            : {
                status: 'ready',
                workspace: resolution.workspace,
                persistCache: resolution.persistCache,
                bound: resolution.bound,
                issue: resolution.issue,
              },
        )
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', error: toStorageError(error) })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const chooseSide = (conflict: PendingConflict, choice: 'file' | 'cache') => {
    setConflictError(null)
    resolveConflict(conflict, choice)
      .then(({ bound, workspace }) => {
        // The cache was written by `resolveConflict`, so the editor mounts with
        // both copies already in agreement.
        setState({ status: 'ready', workspace, persistCache: false, bound, issue: null })
      })
      .catch((error: unknown) => setConflictError(message(error)))
  }

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <LoadError error={state.error} />
  if (state.status === 'conflict') {
    return (
      <ConflictChoice
        conflict={state.conflict}
        error={conflictError}
        onChoose={(choice) => chooseSide(state.conflict, choice)}
      />
    )
  }
  return (
    <ReadyEditor
      workspace={state.workspace}
      persistCache={state.persistCache}
      initialBound={state.bound}
      initialIssue={state.issue}
    />
  )
}

function ReadyEditor({
  workspace,
  persistCache,
  initialBound,
  initialIssue,
}: {
  workspace: Workspace
  persistCache: boolean
  initialBound: BoundFile | null
  initialIssue: BindingIssue | null
}) {
  const [store] = useState<EditorStore>(() => createEditorStore(workspace))
  const pageSize = store((s) => s.workspace.settings.pageSize)

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<WorkspaceStorageError | null>(null)
  const [persistState, setPersistState] = useState<PersistState>('pending')
  const [bound, setBound] = useState<BoundFile | null>(initialBound)
  const [issue, setIssue] = useState<BindingIssue | null>(initialIssue)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<PendingConflict | null>(null)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const controllerRef = useRef<AutosaveController | null>(null)

  // The binding the *save* path reads. Kept in a ref beside the state so a save
  // already sitting in the debounce window picks up a binding made a moment ago,
  // and so the autosave controller never has to be torn down and rebuilt.
  const bindingRef = useRef<BoundFile | null>(initialBound)
  const applyBinding = useCallback((next: BoundFile | null) => {
    bindingRef.current = next
    setBound(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Ask for persistent storage once at startup. `pending` until it resolves,
    // so the status line never briefly claims "granted" before the answer is in.
    void requestPersistentStorage().then((granted) => {
      if (cancelled) return
      setPersistState(granted ? 'granted' : 'denied')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const save = createWorkspaceSaver({
      saveCache: saveWorkspace,
      // Returning `null` when unbound is what tells the version stamps that no
      // file received this save. When bound, the write is the guarded one: this
      // runs unattended (including on page unload), so it must not overwrite a
      // file that changed underneath it.
      writeFile: async (current) => {
        const binding = bindingRef.current
        if (binding === null) return null
        return syncWorkspaceToFile(binding.handle, current, binding.versions.fileVersionAt)
      },
      getVersions: () => bindingRef.current?.versions ?? { cacheVersionAt: 0, fileVersionAt: 0 },
      saveVersions: async (versions: WorkspaceVersions) => {
        const binding = bindingRef.current
        if (binding === null) return
        bindingRef.current = { ...binding, versions }
        await saveBinding(binding.handle, versions)
      },
    })

    const controller = createAutosaveController({
      getWorkspace: () => store.getState().workspace,
      save,
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      onSaved: () => {
        setLastSavedAt(Date.now())
        setSaveError(null)
      },
      onError: (error) => setSaveError(toStorageError(error)),
    })
    controllerRef.current = controller

    // Persist the workspace the app started from — the freshly created empty one
    // on first launch, or the contents just adopted from the bound file — so
    // IndexedDB always holds exactly one, current record. Best-effort, and
    // deliberately does not touch `lastSavedAt`: neither is user content.
    if (persistCache) {
      void saveWorkspace(store.getState().workspace).catch((error: unknown) => {
        setSaveError(toStorageError(error))
      })
    }

    const unsubscribe = store.subscribe((current, previous) => {
      if (current.workspace !== previous.workspace) controller.notify()
    })

    // `beforeunload` is the required flush hook; `pagehide` is the more reliable
    // signal on close/bfcache and covers the same case. Both call `flush`, which
    // writes the latest workspace immediately — the write is issued
    // synchronously inside the handler, so it commits even though the handler
    // cannot await the promise.
    const flushOnUnload = () => {
      // Reported through `onError` already; the page is going away, so there is
      // nobody left to reject to.
      void controller.flush().catch(() => {})
    }
    window.addEventListener('beforeunload', flushOnUnload)
    window.addEventListener('pagehide', flushOnUnload)

    return () => {
      window.removeEventListener('beforeunload', flushOnUnload)
      window.removeEventListener('pagehide', flushOnUnload)
      unsubscribe()
      controller.dispose()
      controllerRef.current = null
    }
  }, [store, persistCache])

  /**
   * Adopt a handle. The picker button and the Playwright hook both land here, so
   * the automated tests drive the same code the real entry point does — only the
   * dialog that produces the handle differs.
   */
  const adoptHandle = useCallback(
    async (handle: FileSystemFileHandle): Promise<void> => {
      setBusy(true)
      try {
        const result = await bindToFile(handle, store.getState().workspace)
        if (result.kind === 'issue') {
          applyBinding(null)
          setIssue(result.issue)
          return
        }
        if (result.kind === 'conflict') {
          setConflict(result.conflict)
          return
        }
        if (result.adopted !== null) store.getState().replaceWorkspace(result.adopted)
        applyBinding(result.bound)
        setIssue(null)
        setSaveError(null)
      } catch (error) {
        applyBinding(null)
        setIssue({ message: BIND_FAILED_PREFIX + message(error), regrant: null })
      } finally {
        setBusy(false)
      }
    },
    [applyBinding, store],
  )

  // The e2e hook. `showSaveFilePicker` opens an OS dialog Playwright cannot
  // drive, so the tests bring their own real `FileSystemFileHandle` (from OPFS,
  // the same interface) and hand it to the same `adoptHandle` above. Gated to
  // dev builds: it is a test seam, not a feature.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const hooked = window as typeof window & {
      __hiResumeBindFile?: (handle: FileSystemFileHandle) => Promise<void>
    }
    hooked.__hiResumeBindFile = adoptHandle
    return () => {
      delete hooked.__hiResumeBindFile
    }
  }, [adoptHandle])

  const handleBind = () => {
    void (async () => {
      setBusy(true)
      let handle: FileSystemFileHandle | null
      try {
        handle = await pickWorkspaceFile()
      } catch (error) {
        setIssue({ message: BIND_FAILED_PREFIX + message(error), regrant: null })
        setBusy(false)
        return
      } finally {
        // `adoptHandle` sets its own busy window; release this one either way.
        setBusy(false)
      }
      // A cancelled dialog is a normal outcome and says nothing on screen.
      if (handle === null) return
      await adoptHandle(handle)
    })()
  }

  const handleRegrant = (handle: FileSystemFileHandle) => {
    void (async () => {
      setBusy(true)
      try {
        // Runs inside a click, so the browser allows the prompt.
        await requestWritePermission(handle)
      } finally {
        setBusy(false)
      }
      await adoptHandle(handle)
    })()
  }

  const chooseSide = (pending: PendingConflict, choice: 'file' | 'cache') => {
    setConflictError(null)
    resolveConflict(pending, choice)
      .then(({ bound: next, workspace: chosen }) => {
        store.getState().replaceWorkspace(chosen)
        applyBinding(next)
        setIssue(null)
        setConflict(null)
      })
      .catch((error: unknown) => setConflictError(message(error)))
  }

  return (
    <>
      <SectionsEditor
        store={store}
        pageSize={pageSize}
        statusLine={
          <StorageStatus
            lastSavedAt={lastSavedAt}
            error={saveError}
            persistState={persistState}
            bound={bound}
            issue={issue}
            canBind={isFileBindingSupported()}
            onBind={handleBind}
            onRegrant={handleRegrant}
            busy={busy}
          />
        }
        backupControls={<WorkspaceBackup />}
      />
      {conflict !== null && (
        <ConflictChoice
          conflict={conflict}
          error={conflictError}
          onChoose={(choice) => chooseSide(conflict, choice)}
        />
      )}
    </>
  )
}

function Loading() {
  return <div className="persistent-loading" data-testid="loading">加载中…</div>
}

function LoadError({ error }: { error: WorkspaceStorageError }) {
  if (error instanceof SchemaVersionMismatchError) {
    return (
      <div className="persistent-error" data-testid="storage-error" role="alert">
        <h1 className="persistent-error__title">数据版本不兼容</h1>
        <p className="persistent-error__text">
          本地保存的工作区版本为 {error.storedVersion}，高于当前应用支持的版本 {error.supportedVersion}
          。为防止数据损坏，应用已停止加载。请升级应用后再打开，或先从浏览器导出备份。
        </p>
      </div>
    )
  }

  return (
    <div className="persistent-error" data-testid="storage-error" role="alert">
      <h1 className="persistent-error__title">无法读取本地数据</h1>
      <p className="persistent-error__text">{error.message}</p>
    </div>
  )
}
