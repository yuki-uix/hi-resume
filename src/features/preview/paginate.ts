import type { PageBlock } from './types'

/**
 * Greedy page assignment over measured block heights.
 *
 * `heights[i]` must be `blocks[i]`'s rendered height at the page content width.
 * Blocks are indivisible: a block that does not fit in the remaining space of
 * the current page starts a new page instead of splitting. A `section-header`
 * is kept with the block that follows it (its section's first entry or body
 * text), so a title can never be stranded as the last element of a page.
 */
export function paginateBlocks(
  blocks: PageBlock[],
  heights: number[],
  contentHeightPx: number,
): PageBlock[][] {
  const pages: PageBlock[][] = []
  let current: PageBlock[] = []
  let currentHeight = 0

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
      pages.push(current)
      current = []
      currentHeight = 0
    }

    current.push(block)
    currentHeight += height

    if (keepsWithNext) {
      current.push(blocks[i + 1] as PageBlock)
      currentHeight += heights[i + 1] ?? 0
      i += 2
    } else {
      i += 1
    }
  }

  if (current.length > 0) pages.push(current)
  return pages
}
