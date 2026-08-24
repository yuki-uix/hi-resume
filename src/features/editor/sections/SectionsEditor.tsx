import { useMemo, useState, type ReactNode } from 'react'

import { selectRenderModel } from '../../../domain/composition/select-render-model'
import type { PageSize, RenderTarget } from '../../../domain/composition/types'
import type { SectionId } from '../../../domain/pool/types'
import { buildBlocks } from '../../../templates/standard'
import { PrintButton } from '../../export/PrintButton'
import { EntriesEditor } from '../entries/EntriesEditor'
import { EditorStoreContext } from '../editor-store-context'
import type { EditorStore } from '../editor-store'
import { PreviewStage } from './PreviewStage'
import { AddSectionDialog, DeleteSectionDialog, RenameDialog } from './SectionDialogs'
import { SectionList } from './SectionList'
import './sections-editor.css'

// Fixed to the master resume until variant switching lands: this issue wires the
// read side only, so the editor always renders `{ kind: 'master' }`.
const masterTarget: RenderTarget = { kind: 'master' }

/**
 * The editor page: left column (section list) + middle column (entries form) +
 * right column (paginated preview).
 *
 * The component no longer decides where the workspace comes from. The store is
 * created and owned by the caller — the dev fixture bootstrap or the
 * persistence bootstrap in `App.tsx` — so the two startup paths cannot be
 * confused, and a `?fixture=` param can never seed example data on the
 * production path.
 */
export function SectionsEditor({
  store,
  pageSize,
  debugMeasurer = false,
  statusLine,
  backupControls,
}: {
  store: EditorStore
  pageSize: PageSize
  debugMeasurer?: boolean
  /** Optional slot for caller-owned chrome (e.g. the autosave status line). */
  statusLine?: ReactNode
  /** Optional slot for caller-owned backup controls (persistent path only). */
  backupControls?: ReactNode
}) {
  const workspace = store((state) => state.workspace)

  const [renamingId, setRenamingId] = useState<SectionId | null>(null)
  const [deletingId, setDeletingId] = useState<SectionId | null>(null)
  const [adding, setAdding] = useState(false)

  // Narrow the memo to the two references `selectRenderModel` actually reads for
  // a master target: the pool (content) and the master composition (shape). The
  // old `[workspace]` dependency rebuilt the whole render model and re-measured
  // every page on any workspace change — including, later, a variant's
  // application notes, which touch neither the pool nor the master.
  const blocks = useMemo(
    () => buildBlocks(selectRenderModel(workspace, masterTarget)),
    [workspace.pool, workspace.master],
  )

  return (
    <EditorStoreContext.Provider value={store}>
      <div className="sections-editor">
        <aside className="sections-sidebar">
          <div className="sections-sidebar__header">
            <h2 className="sections-sidebar__title">区块</h2>
            <button type="button" className="sections-sidebar__add" data-testid="add-section" onClick={() => setAdding(true)}>
              新建区块
            </button>
          </div>
          {statusLine && <div className="sections-sidebar__status">{statusLine}</div>}
          <SectionList onRename={setRenamingId} onDelete={setDeletingId} />
          <div className="sections-sidebar__print">
            <PrintButton />
          </div>
          {backupControls}
        </aside>

        <EntriesEditor />

        <main className="sections-editor__preview">
          <PreviewStage blocks={blocks} pageSize={pageSize} onRenameSection={setRenamingId} debugMeasurer={debugMeasurer} />
        </main>
      </div>

      {renamingId && <RenameDialog sectionId={renamingId} onClose={() => setRenamingId(null)} />}
      {deletingId && <DeleteSectionDialog sectionId={deletingId} onClose={() => setDeletingId(null)} />}
      {adding && <AddSectionDialog onClose={() => setAdding(false)} />}
    </EditorStoreContext.Provider>
  )
}
