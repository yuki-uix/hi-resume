import { useLayoutEffect, useRef, useState } from 'react'

import type { PageSize } from '../../domain/composition/types'
import { CSS_PAGE_SIZE, pageMetrics } from './page-metrics'
import { paginateBlocks } from './paginate'
import type { PageBlock } from './types'
import './preview.css'

type Props = {
  blocks: PageBlock[]
  pageSize: PageSize
}

/**
 * Renders template blocks into discrete A4/Letter page containers.
 *
 * Pagination is measurement-based: the blocks are laid out once at the page
 * content width, their heights are read back, and a greedy pass assigns each
 * block to a page. The visible page containers are the *only* break mechanism:
 * screen pages and `page.pdf()` pages both come from the same `.resume-page`
 * elements (print adds `break-after: page`), so the two can never disagree.
 *
 * The measuring pass renders into an off-screen, hidden container that is
 * removed as soon as the page assignment is computed, so the steady-state DOM
 * contains the page containers exactly once.
 */
export function PaginatedPreview({ blocks, pageSize }: Props) {
  const metrics = pageMetrics(pageSize)
  const [pages, setPages] = useState<PageBlock[][] | null>(null)
  const measurerRef = useRef<HTMLDivElement | null>(null)

  // Re-measure when the *input reference* changes. The previous fingerprint
  // joined `block.key`s, which are stable IDs — correct while the model was
  // immutable, but a rename (or any text override) changes a block's node
  // without changing its key, so the pages would silently keep rendering the
  // stale node. `blocks` is a fresh array whenever the render model changes, so
  // reference identity catches both key changes (reorder / add / remove) and
  // content-only changes (rename) without touching how heights are read or how
  // pages are assigned.
  const measuredRef = useRef<{ pageSize: PageSize; blocks: PageBlock[] } | null>(null)
  const measuring =
    measuredRef.current === null ||
    measuredRef.current.pageSize !== pageSize ||
    measuredRef.current.blocks !== blocks

  useLayoutEffect(() => {
    if (!measuring) return
    const host = measurerRef.current
    if (!host) return

    const heights = Array.from(host.children).map(
      (child) => (child as HTMLElement).getBoundingClientRect().height,
    )
    measuredRef.current = { pageSize, blocks }
    setPages(paginateBlocks(blocks, heights, metrics.contentHeightPx))
  }, [measuring, pageSize, blocks, metrics.contentHeightPx])

  if (measuring || pages === null) {
    return (
      <div
        ref={measurerRef}
        className="pagination-measurer"
        style={{ width: metrics.contentWidthPx }}
        aria-hidden="true"
      >
        {blocks.map((block) => (
          <div key={block.key} style={{ margin: 0, padding: 0 }}>
            {block.node}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <style>{`@page { size: ${CSS_PAGE_SIZE[pageSize]}; margin: 0; }`}</style>
      <div className="preview" data-paginated="true" data-page-size={pageSize}>
        {pages.map((pageBlocks, index) => (
          <section
            key={index}
            className="resume-page"
            data-page-index={index}
            style={{
              width: metrics.widthPx,
              height: metrics.heightPx,
              padding: metrics.marginPx,
            }}
          >
            {pageBlocks.map((block) => (
              <div key={block.key} style={{ margin: 0, padding: 0 }}>
                {block.node}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
