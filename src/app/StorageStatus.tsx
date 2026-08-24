import type { ReactNode } from 'react'

import { useEditorStore } from '../features/editor/editor-store-context'
import { downloadWorkspaceFile } from '../features/export/download'
import type { WorkspaceStorageError } from '../persistence/errors'
import { PERSIST_PENDING, PERSIST_RISK, STORAGE_LOCATION, type PersistState } from './storage-status'
import './storage-status.css'

/**
 * The always-visible storage status (#44): where the data lives, how much risk
 * it is at, the last save time, and the escape hatch (export JSON). Rendered in
 * the sidebar `statusLine` slot, so the user sees it without opening a menu.
 *
 * The save-time text reuses the existing `onSaved` callback — no new timer.
 */
export function StorageStatus({
  lastSavedAt,
  error,
  persistState,
}: {
  lastSavedAt: number | null
  error: WorkspaceStorageError | null
  persistState: PersistState
}) {
  const store = useEditorStore()

  const risk = persistState === 'pending' ? PERSIST_PENDING : PERSIST_RISK[persistState]

  return (
    <div className="storage-status" data-testid="storage-status">
      <div className="storage-status__location">{STORAGE_LOCATION}</div>
      <div className="storage-status__risk" data-testid="storage-risk">
        {risk}
      </div>
      <div className="storage-status__actions">
        <button
          type="button"
          className="storage-status__export"
          data-testid="status-export-json"
          onClick={() => downloadWorkspaceFile(store.getState().workspace)}
        >
          导出 JSON
        </button>
      </div>
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
  if (error) return `保存失败：${error.message}`
  if (lastSavedAt === null) return '尚未保存'
  return `最近保存 ${formatTime(lastSavedAt)}`
}

function formatTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
