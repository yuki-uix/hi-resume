import { buildRenderModel } from '../domain/composition/render-model'
import type { PageSize } from '../domain/composition/types'
import { PaginatedPreview } from '../features/preview/PaginatedPreview'
import { FIXTURES, fixtureB } from '../features/preview/fixtures'
import { buildBlocks } from '../templates/standard'

/**
 * The M1 dev page: renders a fixed fixture (chosen by `?fixture=` query param,
 * defaulting to the two-page `b`) at a page size (`?pageSize=A4|Letter`). The
 * editor arrives in a later task; until then this is the whole app surface.
 */
export function DevPreviewPage() {
  const params = new URLSearchParams(window.location.search)
  const fixture = params.get('fixture') ?? 'b'
  const pageSize: PageSize = params.get('pageSize') === 'Letter' ? 'Letter' : 'A4'

  const makeWorkspace = FIXTURES[fixture]
  const workspace = (makeWorkspace ?? fixtureB)()
  const model = buildRenderModel(workspace.pool, workspace.master)

  return <PaginatedPreview blocks={buildBlocks(model)} pageSize={pageSize} />
}
