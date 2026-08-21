import { useState } from 'react'

import type { PageSize } from '../domain/composition/types'
import { SectionsEditor } from '../features/editor/sections/SectionsEditor'
import { createEditorStore } from '../features/editor/editor-store'
import { FIXTURES, fixtureB } from '../features/preview/fixtures'
import { PersistentEditor } from './PersistentEditor'

/**
 * Startup routing. There are exactly two, deliberately separate entry points:
 *
 * - **Fixture** (dev/e2e only, `?fixture=`): seeds the store from the in-memory
 *   fixtures. Gated behind `import.meta.env.DEV`, so a production build never
 *   loads example data no matter what a URL says.
 * - **Persistent** (everything else): loads the workspace from IndexedDB, or
 *   creates the empty workspace on first launch, and autosaves edits.
 *
 * `?pageSize=` / `?measurer=` remain query-param conveniences for the fixture
 * path, mirroring the #3/#4/#5 dev page; the persistent path reads page size
 * from `workspace.settings.pageSize`.
 */
export function App() {
  const params = new URLSearchParams(window.location.search)
  const fixture = params.get('fixture')
  const pageSize: PageSize = params.get('pageSize') === 'Letter' ? 'Letter' : 'A4'
  const debugMeasurer = params.get('measurer') === '1'

  if (import.meta.env.DEV && fixture) {
    return <FixtureEditor fixture={fixture} pageSize={pageSize} debugMeasurer={debugMeasurer} />
  }
  return <PersistentEditor />
}

function FixtureEditor({
  fixture,
  pageSize,
  debugMeasurer,
}: {
  fixture: string
  pageSize: PageSize
  debugMeasurer: boolean
}) {
  const [store] = useState(() => {
    const makeWorkspace = FIXTURES[fixture]
    return createEditorStore((makeWorkspace ?? fixtureB)())
  })

  return <SectionsEditor store={store} pageSize={pageSize} debugMeasurer={debugMeasurer} />
}
