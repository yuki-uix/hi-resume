import { describe, expect, it } from 'vitest'

import { paginateBlocks } from './paginate'
import type { PageBlock } from './types'

/**
 * `paginateBlocks` is pure arithmetic over measured heights — no DOM, no React.
 * The browser-side facts (that heights are measured correctly, that the page
 * container clips the excess) live in `e2e/pagination.spec.ts`; what belongs
 * here is the placement itself and, for #28, the overflow report.
 *
 * `node` is irrelevant to placement, so it stays `null` throughout.
 */

const PAGE = 1000

function block(key: string, kind: PageBlock['kind'] = 'content'): PageBlock {
  return { key, kind, node: null, label: `label:${key}` }
}

function keysOf(pages: PageBlock[][]): string[][] {
  return pages.map((page) => page.map((b) => b.key))
}

describe('paginateBlocks placement', () => {
  it('packs blocks greedily and breaks when the next one does not fit', () => {
    const blocks = [block('a'), block('b'), block('c')]
    const { pages, overflows } = paginateBlocks(blocks, [600, 300, 400], PAGE)

    expect(keysOf(pages)).toEqual([['a', 'b'], ['c']])
    expect(overflows).toEqual([])
  })

  it('keeps a section header with the block that follows it', () => {
    const blocks = [block('body'), block('title', 'section-header'), block('entry')]
    // `body` alone leaves 200px, which fits the title but not title+entry, so
    // both move to page 2 rather than stranding the title.
    const { pages } = paginateBlocks(blocks, [800, 50, 300], PAGE)

    expect(keysOf(pages)).toEqual([['body'], ['title', 'entry']])
  })

  it('reports nothing for a page filled exactly to the budget', () => {
    const { pages, overflows } = paginateBlocks([block('a'), block('b')], [400, 600], PAGE)

    expect(keysOf(pages)).toEqual([['a', 'b']])
    expect(overflows).toEqual([])
  })
})

describe('paginateBlocks overflow reporting (#28)', () => {
  it('reports page index, overflow pixels and the block that does not fit', () => {
    const blocks = [block('basics'), block('entry:ent_perf')]
    // Precondition: the second block is genuinely taller than a whole page.
    // Without this, "an overflow was reported" could be asserted about a
    // scenario that never overflowed.
    const tallHeight = 3700
    expect(tallHeight).toBeGreaterThan(PAGE)

    const { pages, overflows } = paginateBlocks(blocks, [200, tallHeight], PAGE)

    // The over-tall block got its own page, as the placement rule says.
    expect(keysOf(pages)).toEqual([['basics'], ['entry:ent_perf']])
    expect(overflows).toEqual([
      {
        pageIndex: 1,
        overflowPx: 2700,
        blockKey: 'entry:ent_perf',
        blockLabel: 'label:entry:ent_perf',
      },
    ])
  })

  it('blames the tall block, not the section header carried onto its page', () => {
    const blocks = [block('title', 'section-header'), block('entry:ent_perf')]
    const { pages, overflows } = paginateBlocks(blocks, [40, 3000], PAGE)

    expect(keysOf(pages)).toEqual([['title', 'entry:ent_perf']])
    // The page is 40 + 3000 tall; the header is part of the overflow amount but
    // is not what to shorten.
    expect(overflows).toEqual([
      {
        pageIndex: 0,
        overflowPx: 2040,
        blockKey: 'entry:ent_perf',
        blockLabel: 'label:entry:ent_perf',
      },
    ])
  })

  it('reports every overflowing page, not just the first', () => {
    const blocks = [block('tall-1'), block('short'), block('tall-2')]
    const { pages, overflows } = paginateBlocks(blocks, [2500, 100, 1600], PAGE)

    expect(keysOf(pages)).toEqual([['tall-1'], ['short'], ['tall-2']])
    expect(overflows.map((o) => [o.pageIndex, o.overflowPx, o.blockKey])).toEqual([
      [0, 1500, 'tall-1'],
      [2, 600, 'tall-2'],
    ])
  })

  it('ignores a sub-pixel overshoot, but reports a whole-pixel one', () => {
    // A block a third of a pixel over the budget is float noise, not clipped
    // content. One pixel over is not noise, and must still be reported —
    // otherwise the tolerance would be a hole rather than a rounding guard.
    expect(paginateBlocks([block('a')], [PAGE + 0.3], PAGE).overflows).toEqual([])
    expect(paginateBlocks([block('a')], [PAGE + 1], PAGE).overflows).toEqual([
      { pageIndex: 0, overflowPx: 1, blockKey: 'a', blockLabel: 'label:a' },
    ])
  })

  it('treats a missing height as zero and reports no overflow for it', () => {
    const { pages, overflows } = paginateBlocks([block('a'), block('b')], [500], PAGE)

    expect(keysOf(pages)).toEqual([['a', 'b']])
    expect(overflows).toEqual([])
  })
})
