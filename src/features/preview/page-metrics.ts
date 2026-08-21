import type { PageSize } from '../../domain/composition/types'

/**
 * One CSS pixel per millimetre. Both directions are exact by spec: 1in is 96px
 * and 1in is 25.4mm, so converting page geometry between `mm` (for the print
 * engine's `@page`) and `px` (for DOM measurement) never rounds.
 */
export const MM_TO_PX = 96 / 25.4

/** Physical page size per `WorkspaceSettings.pageSize`. */
export const PAGE_METRICS: Record<PageSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
}

/** The `@page` size keyword Chromium's print engine expects for each page size. */
export const CSS_PAGE_SIZE: Record<PageSize, string> = {
  A4: 'A4',
  Letter: 'letter',
}

/**
 * The white margin baked into every page as padding. It lives here rather than
 * in the template because pagination must measure against the *content* area —
 * the page height minus this margin — so it has to be part of the pagination
 * contract, not a template styling detail.
 */
export const PAGE_MARGIN_MM = 18

export type PageMetrics = {
  widthPx: number
  heightPx: number
  marginPx: number
  contentWidthPx: number
  contentHeightPx: number
}

export function pageMetrics(pageSize: PageSize): PageMetrics {
  const { widthMm, heightMm } = PAGE_METRICS[pageSize]
  const marginPx = PAGE_MARGIN_MM * MM_TO_PX
  return {
    widthPx: widthMm * MM_TO_PX,
    heightPx: heightMm * MM_TO_PX,
    marginPx,
    contentWidthPx: (widthMm - 2 * PAGE_MARGIN_MM) * MM_TO_PX,
    contentHeightPx: (heightMm - 2 * PAGE_MARGIN_MM) * MM_TO_PX,
  }
}
