import type { PageBlock, PageOverflow } from './types'

export type PaginationResult = {
  pages: PageBlock[][]
  /**
   * The pages whose blocks do not fit, in page order. Empty when everything
   * fits, which is the normal case.
   */
  overflows: PageOverflow[]
}

/**
 * Slack when deciding a page overflowed. Block heights are sub-pixel floats and
 * are summed here in a different association order than the placement loop
 * accumulates them, so an exactly-full page can land an ULP over the budget.
 * Half a pixel is below anything a reader could see clipped.
 */
const OVERFLOW_EPSILON_PX = 0.5

/**
 * Greedy page assignment over measured block heights.
 *
 * `heights[i]` must be `blocks[i]`'s rendered height at the page content width.
 * Blocks are indivisible: a block that does not fit in the remaining space of
 * the current page starts a new page instead of splitting. A `section-header`
 * is kept with the block that follows it (its section's first entry or body
 * text), so a title can never be stranded as the last element of a page.
 *
 * A block taller than a whole page cannot be placed anywhere it fits. It gets a
 * page of its own and overflows it; the page container clips the excess, so it
 * is missing from both the screen and the PDF. Splitting such a block is a
 * change to the pagination model and is out of scope here (#28) — what this
 * function must not do is stay silent about it, so every page that ends up over
 * budget is reported in `overflows`.
 */
export function paginateBlocks(
  blocks: PageBlock[],
  heights: number[],
  contentHeightPx: number,
): PaginationResult {
  const pages: PageBlock[][] = []
  // Heights per page, parallel to `pages`. Overflow is read back off the very
  // numbers that drove placement, never re-measured or re-derived, so the two
  // cannot disagree about what fits.
  const pageHeights: number[][] = []
  let current: PageBlock[] = []
  let currentHeights: number[] = []
  let currentHeight = 0

  const closePage = () => {
    pages.push(current)
    pageHeights.push(currentHeights)
    current = []
    currentHeights = []
    currentHeight = 0
  }

  let i = 0
  while (i < blocks.length) {
    const block = blocks[i] as PageBlock
    const height = heights[i] ?? 0

    // A title keeps with the next block, but only when that next block is the
    // section's own content. Two titles in a row (an empty section followed by
    // another section) stay independent.
    const keepsWithNext =
      block.kind === 'section-header' &&
      i + 1 < blocks.length &&
      (blocks[i + 1] as PageBlock).kind !== 'section-header'
    const runHeight = keepsWithNext ? height + (heights[i + 1] ?? 0) : height

    // `current.length > 0` guards the degenerate case of a single block taller
    // than a whole page: it still gets its own page rather than an empty loop.
    if (current.length > 0 && currentHeight + runHeight > contentHeightPx) {
      closePage()
    }

    current.push(block)
    currentHeights.push(height)
    currentHeight += height

    if (keepsWithNext) {
      current.push(blocks[i + 1] as PageBlock)
      currentHeights.push(heights[i + 1] ?? 0)
      currentHeight += heights[i + 1] ?? 0
      i += 2
    } else {
      i += 1
    }
  }

  if (current.length > 0) closePage()

  return { pages, overflows: collectOverflows(pages, pageHeights, contentHeightPx) }
}

/**
 * One report per page whose blocks sum past the content budget.
 *
 * The blamed block is the tallest one on the page. The greedy pass only ever
 * exceeds the budget by placing a single over-tall run onto an empty page, so
 * the tallest block is the one that could not be made to fit; naming it is what
 * lets the notice say which entry to shorten.
 */
function collectOverflows(
  pages: PageBlock[][],
  pageHeights: number[][],
  contentHeightPx: number,
): PageOverflow[] {
  const overflows: PageOverflow[] = []

  pages.forEach((pageBlocks, pageIndex) => {
    const blockHeights = pageHeights[pageIndex] ?? []
    const total = blockHeights.reduce((sum, height) => sum + height, 0)
    const overflowPx = total - contentHeightPx
    if (overflowPx <= OVERFLOW_EPSILON_PX) return

    let tallest = 0
    blockHeights.forEach((height, index) => {
      if (height > (blockHeights[tallest] ?? 0)) tallest = index
    })
    const block = pageBlocks[tallest]
    if (!block) return

    overflows.push({
      pageIndex,
      overflowPx,
      blockKey: block.key,
      blockLabel: block.label,
    })
  })

  return overflows
}
