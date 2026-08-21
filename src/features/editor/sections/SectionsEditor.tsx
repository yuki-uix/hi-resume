import { useMemo, useState } from 'react'

import { buildRenderModel } from '../../../domain/composition/render-model'
import type { PageSize } from '../../../domain/composition/types'
import type { SectionId } from '../../../domain/pool/types'
import { FIXTURES, fixtureB } from '../../preview/fixtures'
import { buildBlocks } from '../../../templates/standard'
import { EntriesEditor } from '../entries/EntriesEditor'
import { PreviewStage } from './PreviewStage'
import { AddSectionDialog, DeleteSectionDialog, RenameDialog } from './SectionDialogs'
import { SectionList } from './SectionList'
import { EditorStoreContext } from '../editor-store-context'
import { createEditorStore } from '../editor-store'
import './sections-editor.css'

/**
 * The editor page: left column (section list) + right column (paginated
 * preview). The store is seeded from the same `?fixture=` / `?pageSize=` query
 * params the #3 dev page used, so the pagination e2e keeps working unchanged.
 */
export function SectionsEditor() {
  const params = new URLSearchParams(window.location.search)
  const fixture = params.get('fixture') ?? 'b'
  const pageSize: PageSize = params.get('pageSize') === 'Letter' ? 'Letter' : 'A4'
  const debugMeasurer = params.get('measurer') === '1'

  const [store] = useState(() => {
    const makeWorkspace = FIXTURES[fixture]
    return createEditorStore((makeWorkspace ?? fixtureB)())
  })
  const workspace = store((state) => state.workspace)

  const [renamingId, setRenamingId] = useState<SectionId | null>(null)
  const [deletingId, setDeletingId] = useState<SectionId | null>(null)
  const [adding, setAdding] = useState(false)

  const blocks = useMemo(() => buildBlocks(buildRenderModel(workspace.pool, workspace.master)), [workspace])

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
          <SectionList onRename={setRenamingId} onDelete={setDeletingId} />
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
