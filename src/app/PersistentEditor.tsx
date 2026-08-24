import { useEffect, useRef, useState } from 'react'

import type { Workspace } from '../domain/composition/types'
import { SectionsEditor } from '../features/editor/sections/SectionsEditor'
import { createEditorStore, type EditorStore } from '../features/editor/editor-store'
import { WorkspaceBackup } from '../features/export/WorkspaceBackup'
import { AUTOSAVE_DEBOUNCE_MS, createAutosaveController, type AutosaveController } from '../persistence/autosave'
import { createEmptyWorkspace } from '../persistence/empty-workspace'
import { SchemaVersionMismatchError, WorkspaceStorageError } from '../persistence/errors'
import { requestPersistentStorage } from '../persistence/persist'
import { loadWorkspace, saveWorkspace } from '../persistence/workspace-db'
import { StorageStatus } from './StorageStatus'
import type { PersistState } from './storage-status'
import './app.css'

/**
 * The production startup path: load the workspace from IndexedDB, wire the
 * editor store to debounced autosave, and force a flush on `beforeunload` /
 * `pagehide` so edits inside the debounce window survive a close.
 *
 * Three states: loading, a load error (shown and left in place — never
 * downgraded or overwritten), and ready. First launch (empty IndexedDB) builds
 * the empty workspace and persists it, but that initial save does not count as
 * "user content saved", so the status line still reads "尚未保存" until the
 * first edit-triggered autosave.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: WorkspaceStorageError }
  | { status: 'ready'; workspace: Workspace; initialSave: boolean }

function toStorageError(error: unknown): WorkspaceStorageError {
  if (error instanceof WorkspaceStorageError) return error
  return new WorkspaceStorageError(error instanceof Error ? error.message : String(error), { cause: error })
}

export function PersistentEditor() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    loadWorkspace()
      .then((workspace) => {
        if (cancelled) return
        if (workspace !== null) {
          setState({ status: 'ready', workspace, initialSave: false })
        } else {
          setState({ status: 'ready', workspace: createEmptyWorkspace(), initialSave: true })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', error: toStorageError(error) })
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <LoadError error={state.error} />
  return <ReadyEditor workspace={state.workspace} initialSave={state.initialSave} />
}

function ReadyEditor({ workspace, initialSave }: { workspace: Workspace; initialSave: boolean }) {
  const [store] = useState<EditorStore>(() => createEditorStore(workspace))
  const pageSize = store((s) => s.workspace.settings.pageSize)

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<WorkspaceStorageError | null>(null)
  const [persistState, setPersistState] = useState<PersistState>('pending')
  const controllerRef = useRef<AutosaveController | null>(null)

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
    const controller = createAutosaveController({
      getWorkspace: () => store.getState().workspace,
      save: saveWorkspace,
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      onSaved: () => {
        setLastSavedAt(Date.now())
        setSaveError(null)
      },
      onError: (error) => setSaveError(toStorageError(error)),
    })
    controllerRef.current = controller

    // Persist the freshly created empty workspace on first launch, so there is
    // always exactly one record. This is best-effort and deliberately does not
    // touch `lastSavedAt` — an empty workspace is not user content.
    if (initialSave) {
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
      void controller.flush()
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
  }, [store, initialSave])

  return (
    <SectionsEditor
      store={store}
      pageSize={pageSize}
      statusLine={<StorageStatus lastSavedAt={lastSavedAt} error={saveError} persistState={persistState} />}
      backupControls={<WorkspaceBackup />}
    />
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
