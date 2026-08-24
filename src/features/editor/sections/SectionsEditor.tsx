import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { selectRenderModel } from '../../../domain/composition/select-render-model'
import type { PageSize, RenderTarget } from '../../../domain/composition/types'
import type { SectionId } from '../../../domain/pool/types'
import { buildBlocks } from '../../../templates/standard'
import { PrintButton } from '../../export/PrintButton'
import { EntriesEditor } from '../entries/EntriesEditor'
import { EditorStoreContext } from '../editor-store-context'
import type { EditorStore } from '../editor-store'
import { VariantSwitcher } from '../variants/VariantSwitcher'
import { PreviewStage } from './PreviewStage'
import { AddSectionDialog, DeleteSectionDialog, RenameDialog } from './SectionDialogs'
import { SectionList } from './SectionList'
import './sections-editor.css'

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

  const [target, setTarget] = useState<RenderTarget>({ kind: 'master' })
  const [renamingId, setRenamingId] = useState<SectionId | null>(null)
  const [deletingId, setDeletingId] = useState<SectionId | null>(null)
  const [adding, setAdding] = useState(false)

  // The target is never allowed to go stale. Deleting the current variant resets
  // it synchronously in `VariantSwitcher`, but a JSON import can also replace the
  // workspace out from under a selected variant — this effect is the single gate
  // that walks every exit back to the master.
  useEffect(() => {
    if (target.kind === 'variant' && !workspace.variants.some((variant) => variant.id === target.id)) {
      setTarget({ kind: 'master' })
    }
  }, [target, workspace.variants])

  // The memo dependency must cover everything `selectRenderModel` reads for the
  // *current* target. For the master that is `pool` + `master`; for a variant it
  // also reads `variants`. `target` itself must be present or switching does not
  // recompute. Keeping all four — the union over every target — means the preview
  // can never silently show a stale target's content (AC8).
  const blocks = useMemo(
    () => buildBlocks(selectRenderModel(workspace, target)),
    [workspace.pool, workspace.master, workspace.variants, target],
  )

  const editingVariant = target.kind === 'variant'

  return (
    <EditorStoreContext.Provider value={store}>
      <div className={`sections-editor${editingVariant ? ' sections-editor--variant' : ''}`} data-editing-target={target.kind}>
        <aside className="sections-sidebar">
          <VariantSwitcher target={target} onSelectTarget={setTarget} />
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
