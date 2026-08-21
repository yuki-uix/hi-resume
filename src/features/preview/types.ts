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
}
