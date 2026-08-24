import type { ReactNode } from 'react'

import { useEditorStore } from '../features/editor/editor-store-context'
import { downloadWorkspaceFile } from '../features/export/download'
import {
  FileChangedElsewhereError,
  WorkspaceFileWriteError,
  type WorkspaceStorageError,
} from '../persistence/errors'
import type { BindingIssue, BoundFile } from './binding-flow'
import { formatClock } from './format-time'
import {
  BIND_ACTION_LABEL,
  BIND_HINT,
  FILE_BOUND_PREFIX,
  FILE_BOUND_RISK,
  FILE_CHANGED_ELSEWHERE,
  FILE_WRITE_FAILED_DETAIL,
  FILE_WRITE_FAILED_PREFIX,
  PERSIST_PENDING,
  PERSIST_RISK,
  REGRANT_ACTION_LABEL,
  STORAGE_LOCATION,
  type PersistState,
} from './storage-status'
import './storage-status.css'

/**
 * The always-visible storage status (#44), extended with the file binding (#45).
 *
 * The location line is the load-bearing part: unbound it says the data is only
 * in this browser, bound it names the file being written. It must never say both
 * or neither, and — per #45 — it may only read "bound" when a write would
 * actually succeed. A binding whose permission was refused or whose file
 * vanished shows the *unbound* wording plus the error, because that is the
 * user's real situation.
 */
export function StorageStatus({
  lastSavedAt,
  error,
  persistState,
  bound,
  issue,
  canBind,
  onBind,
  onRegrant,
  busy,
}: {
  lastSavedAt: number | null
  error: WorkspaceStorageError | null
  persistState: PersistState
  bound: BoundFile | null
  issue: BindingIssue | null
  /** False where the File System Access API is missing — no entry is shown. */
  canBind: boolean
  onBind: () => void
  onRegrant: (handle: FileSystemFileHandle) => void
  busy: boolean
}) {
  const store = useEditorStore()

  const risk = persistState === 'pending' ? PERSIST_PENDING : PERSIST_RISK[persistState]

  return (
    <div className="storage-status" data-testid="storage-status">
      {bound === null ? (
        <>
          <div className="storage-status__location">{STORAGE_LOCATION}</div>
          <div className="storage-status__risk" data-testid="storage-risk">
            {risk}
          </div>
        </>
      ) : (
        <>
          <div className="storage-status__location" data-testid="bound-file">
            {FILE_BOUND_PREFIX}
            <span className="storage-status__file">{bound.fileName}</span>
          </div>
          <div className="storage-status__risk" data-testid="storage-risk">
            {FILE_BOUND_RISK}
          </div>
        </>
      )}

      {issue !== null && (
        <div className="storage-status__issue" role="alert" data-testid="binding-issue">
          {issue.message}
          {issue.regrant !== null && (
            <button
              type="button"
              className="storage-status__regrant"
              data-testid="regrant-permission"
              disabled={busy}
              onClick={() => onRegrant(issue.regrant as FileSystemFileHandle)}
            >
              {REGRANT_ACTION_LABEL}
            </button>
          )}
        </div>
      )}

      <div className="storage-status__actions">
        <button
          type="button"
          className="storage-status__export"
          data-testid="status-export-json"
          onClick={() => downloadWorkspaceFile(store.getState().workspace)}
        >
          导出 JSON
        </button>
        {canBind && bound === null && (
          <button
            type="button"
            className="storage-status__bind"
            data-testid="bind-file"
            disabled={busy}
            onClick={onBind}
          >
            {BIND_ACTION_LABEL}
          </button>
        )}
      </div>

      {canBind && bound === null && <div className="storage-status__hint">{BIND_HINT}</div>}

      <span
        className={`storage-status__saved${error ? ' storage-status__saved--error' : ''}`}
        data-testid="last-saved"
      >
        {saveStatusText(lastSavedAt, error)}
      </span>
    </div>
  )
}

function saveStatusText(lastSavedAt: number | null, error: WorkspaceStorageError | null): ReactNode {
  // A refusal to clobber someone else's edit is not a disk error, so it gets
  // the explanation rather than a DOMException name the user cannot act on.
  if (error instanceof FileChangedElsewhereError) {
    return `${FILE_WRITE_FAILED_PREFIX}${FILE_CHANGED_ELSEWHERE}`
  }
  // A failed *file* write gets its own wording: the generic "保存失败" would
  // leave the user guessing which copy is stale, and the answer matters — the
  // browser copy took the edit, the file did not.
  if (error instanceof WorkspaceFileWriteError) {
    return `${FILE_WRITE_FAILED_PREFIX}${error.message}${FILE_WRITE_FAILED_DETAIL}`
  }
  if (error) return `保存失败：${error.message}`
  if (lastSavedAt === null) return '尚未保存'
  return `最近保存 ${formatClock(lastSavedAt)}`
}
