import { useLayoutEffect, useRef, useState } from 'react'

import type { PageSize } from '../../domain/composition/types'
import { awaitResumeFont } from './fonts'
import { CSS_PAGE_SIZE, pageMetrics } from './page-metrics'
import { paginateBlocks, type PaginationResult } from './paginate'
import type { PageBlock, PageOverflow } from './types'
import './preview.css'

type Props = {
  blocks: PageBlock[]
  pageSize: PageSize
  /**
   * Keep the off-screen measurer mounted alongside the pages. The measurer is
   * normally removed once the page assignment is computed; the e2e gate that
   * pins "measurer typography == page typography" needs it present to read its
   * `getComputedStyle`. Opt-in via `?measurer=1` on the dev page.
   */
  debugMeasurer?: boolean
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
 * contains the page containers exactly once (unless `debugMeasurer` keeps the
 * measurer around for the typography gate test).
 */
export function PaginatedPreview({ blocks, pageSize, debugMeasurer = false }: Props) {
  const metrics = pageMetrics(pageSize)
  const [result, setResult] = useState<PaginationResult | null>(null)
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

    // Hard constraint #2: the measurer renders the blocks with the bundled CJK
    // font, but those heights are only correct once the font has loaded. Reading
    // them before that would paginate against the fallback font's metrics, then
    // the pages would silently reflow when the font swaps in. Gate on the font,
    // then measure.
    let cancelled = false
    void (async () => {
      await awaitResumeFont()
      if (cancelled) return
      const heights = Array.from(host.children).map(
        (child) => (child as HTMLElement).getBoundingClientRect().height,
      )
      measuredRef.current = { pageSize, blocks }
      setResult(paginateBlocks(blocks, heights, metrics.contentHeightPx))
    })()
    return () => {
      cancelled = true
    }
  }, [measuring, pageSize, blocks, metrics.contentHeightPx])

  const measurer = (
    <div
      ref={measurerRef}
      className="pagination-measurer resume-typography"
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

  if (measuring || result === null) {
    return measurer
  }

  const overflowByPage = new Map(result.overflows.map((overflow) => [overflow.pageIndex, overflow]))

  return (
    <>
      <style>{`@page { size: ${CSS_PAGE_SIZE[pageSize]}; margin: 0; }`}</style>
      <div className="preview" data-paginated="true" data-page-size={pageSize}>
        {result.pages.map((pageBlocks, index) => {
          const overflow = overflowByPage.get(index)
          return (
            <section
              key={index}
              className="resume-page resume-typography"
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
              {overflow ? <OverflowNotice overflow={overflow} /> : null}
            </section>
          )
        })}
      </div>
      {debugMeasurer ? measurer : null}
    </>
  )
}

/**
 * Screen-only warning that this page's content is being cut off.
 *
 * Deliberately *not* a `PageBlock`: it is never produced by `buildBlocks`, never
 * enters the off-screen measurer, and is `position: absolute` so it stays out of
 * the block flow — it cannot change a measured height and therefore cannot move
 * a page boundary. `@media print` hides it, so it is absent from the PDF.
 *
 * The wording has to leave the reader with the truth: the overflow has *not*
 * been dealt with, the text below the cut is gone from the exported file, and
 * the only fix available today is to shorten the entry.
 */
function OverflowNotice({ overflow }: { overflow: PageOverflow }) {
  return (
    <div className="page-overflow-notice" data-overflow-notice="" role="note">
      <strong className="page-overflow-notice__title">这一页放不下，内容被裁掉了</strong>
      <span className="page-overflow-notice__body">
        「{overflow.blockLabel}」比一页还高，超出页面 {Math.round(overflow.overflowPx)}px。
        超出的部分在这里被截断，导出的 PDF 里也没有这些内容。
        请删减这个条目，或把它拆成两个条目。
      </span>
    </div>
  )
}
