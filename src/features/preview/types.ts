import type { ReactNode } from 'react'

/**
 * One atomic unit of pagination. A template flattens a `RenderModel` into an
 * ordered list of these; the preview measures each one and distributes them
 * across fixed-size page containers.
 *
 * Every block is indivisible — an entry never splits across pages. The one
 * extra rule is `section-header`: a section title must not end up as the last
 * element of a page, so it is kept together with the block that follows it
 * (that section's first entry or its body text).
 */
export type PageBlock = {
  key: string
  kind: 'section-header' | 'content'
  node: ReactNode
  /**
   * Human-readable name of what this block is (an entry title, a section
   * title). Required, so a new block kind cannot be added without a name for
   * it: the truncation notice has to be able to say *which* item overflowed,
   * and a key like `entry:ent_perf` is not something to show a user.
   *
   * It is metadata only — never rendered into `node`, so it cannot affect a
   * measured height.
   */
  label: string
}

/**
 * A page whose blocks are taller than the page's content area.
 *
 * Blocks are indivisible, so a block taller than a whole page is given its own
 * page and still does not fit. The page container is `overflow: hidden`, which
 * means the excess is invisible on screen *and* absent from the PDF: it is real
 * lost content, not a rendering artefact. `paginateBlocks` already computes
 * everything needed to see this — this type is how it reports it instead of
 * dropping it.
 */
export type PageOverflow = {
  /** Index into the `pages` array returned alongside this. */
  pageIndex: number
  /** How far past `contentHeightPx` this page's blocks reach. */
  overflowPx: number
  /** `key` of the block that does not fit (the tallest one on the page). */
  blockKey: string
  /** `label` of that same block, for the on-screen notice. */
  blockLabel: string
}
