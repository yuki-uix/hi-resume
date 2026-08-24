import type { Workspace } from '../../domain/composition/types'
import { serializeWorkspace, WORKSPACE_FILE_NAME } from './json'

/**
 * Build the JSON backup and trigger a browser download. DOM-only glue, hence not
 * in the pure `json.ts`. Shared by the sidebar backup controls and the
 * storage-status line, so both export the same file format.
 */
export function downloadWorkspaceFile(workspace: Workspace): void {
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
