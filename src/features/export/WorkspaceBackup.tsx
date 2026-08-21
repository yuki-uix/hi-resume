import { useRef, useState, type ChangeEvent } from 'react'

import type { Workspace } from '../../domain/composition/types'
import { saveWorkspace } from '../../persistence/workspace-db'
import { useEditorStore } from '../editor/editor-store-context'
import {
  parseWorkspaceFile,
  serializeWorkspace,
  summarizeWorkspace,
  WORKSPACE_FILE_NAME,
  type WorkspaceSummary,
} from './json'
import './workspace-backup.css'

/**
 * JSON export/import, rendered in the editor sidebar by the *persistent*
 * startup path only (the `?fixture=` dev path has no backup controls, and must
 * never be able to overwrite the real IndexedDB record).
 *
 * Export reads the current workspace from the store and triggers a file
 * download. Import validates the file *before* touching anything, shows a
 * confirmation with a summary of what it will overwrite, then — on confirm —
 * writes to IndexedDB first and swaps the in-memory store only after the write
 * succeeds. That ordering is the atomicity guarantee: a failed write leaves
 * both IndexedDB and the store exactly as they were, never a half-imported
 * state.
 */

type OpenDialog =
  | { kind: 'confirm'; workspace: Workspace; summary: WorkspaceSummary }
  | { kind: 'error'; errors: string[] }

export function WorkspaceBackup() {
  const store = useEditorStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const handleExport = () => {
    downloadJson(store.getState().workspace)
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset so re-selecting the same file fires `change` again.
    event.target.value = ''
    if (!file) return

    setDone(false)
    const text = await file.text()
    const result = parseWorkspaceFile(text)
    if (result.ok) {
      setDialog({ kind: 'confirm', workspace: result.workspace, summary: summarizeWorkspace(result.workspace) })
    } else {
      setDialog({ kind: 'error', errors: result.errors })
    }
  }

  const handleConfirm = async () => {
    if (dialog?.kind !== 'confirm') return
    setSaving(true)
    try {
      // Persist first; only on success swap the in-memory store. A thrown write
      // leaves the previous workspace in both places, untouched.
      await saveWorkspace(dialog.workspace)
      store.getState().replaceWorkspace(dialog.workspace)
      setDialog(null)
      setDone(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDialog({ kind: 'error', errors: [`导入失败，未写入任何数据：${message}`] })
    } finally {
      setSaving(false)
    }
  }

  const closeDialog = () => {
    if (saving) return
    setDialog(null)
  }

  return (
    <div className="backup">
      <div className="backup__label">备份</div>
      <div className="backup__actions">
        <button type="button" className="backup__button" data-testid="export-json" onClick={handleExport}>
          导出 JSON
        </button>
        <button
          type="button"
          className="backup__button"
          data-testid="import-json"
          onClick={() => fileInputRef.current?.click()}
        >
          导入 JSON
        </button>
      </div>
      {done && (
        <span className="backup__done" data-testid="import-done" role="status">
          导入成功，已写入本地存储。
        </span>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="backup__file-input"
        data-testid="import-file"
        onChange={handleFileChange}
      />

      {dialog?.kind === 'confirm' && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="确认导入"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="dialog__title">确认导入</h3>
            <p className="dialog__text" data-testid="import-summary">
              将导入的备份包含 {dialog.summary.sections} 个区块、{dialog.summary.entries} 条经历、
              {dialog.summary.bullets} 条要点、{dialog.summary.variants} 个岗位版本。
            </p>
            <p className="dialog__text backup__warn">导入会覆盖当前的全部内容，且无法撤销。</p>
            <div className="dialog__actions">
              <button type="button" className="dialog__button" onClick={closeDialog} data-testid="import-cancel">
                取消
              </button>
              <button
                type="button"
                className="dialog__button dialog__button--primary"
                onClick={handleConfirm}
                disabled={saving}
                data-testid="import-confirm-submit"
              >
                {saving ? '导入中…' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'error' && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeDialog}>
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="导入失败"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="dialog__title">导入失败</h3>
            <ul className="backup__errors" data-testid="import-error" role="alert">
              {dialog.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <div className="dialog__actions">
              <button
                type="button"
                className="dialog__button dialog__button--primary"
                onClick={closeDialog}
                data-testid="import-error-dismiss"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Build the file and trigger a browser download. DOM-only glue, hence not in the pure `json.ts`. */
function downloadJson(workspace: Workspace): void {
  const blob = new Blob([serializeWorkspace(workspace)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = WORKSPACE_FILE_NAME
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Defer the revoke until the download has actually started; revoking inside
  // the click handler can race the browser reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
