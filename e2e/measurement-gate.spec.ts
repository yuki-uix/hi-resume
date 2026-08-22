import { expect, test, type Page } from '@playwright/test'

import { RESUME_FONT_FAMILY } from '../src/features/preview/fonts'

/**
 * The measurement-isolation gate for issue #5.
 *
 * Pagination reads each template block's `getBoundingClientRect().height` from
 * an off-screen measurer, then renders the same blocks into `.resume-page`
 * containers. If the measurer and the page ever disagree on typography — say a
 * `font-family` cascades into one but not the other — every block height is
 * silently off and page boundaries shift without a single error. #4 hit exactly
 * that; this test turns the convention into a failing gate.
 *
 * The fix is structural: both containers carry the same `.resume-typography`
 * root, so the layout-affecting font properties are set by one set of rules in
 * both places. This test pins that invariant by comparing the computed style of
 * the *same* block in the measurer and in the page.
 *
 * `?measurer=1` keeps the normally-transient measurer mounted so its computed
 * style can be read.
 */

const TYPOGRAPHY_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'font-stretch',
] as const

type Typography = Record<(typeof TYPOGRAPHY_PROPS)[number], string>

function readTypography(el: Element): Typography {
  const style = getComputedStyle(el)
  return {
    'font-family': style.fontFamily,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'line-height': style.lineHeight,
    'letter-spacing': style.letterSpacing,
    'word-spacing': style.wordSpacing,
    'font-stretch': style.fontStretch,
  }
}

/** The same block in the measurer and in the page container, compared per-prop. */
async function typographyOf(page: Page, scope: string, blockId: string): Promise<Typography> {
  return page
    .locator(`${scope} [data-entry-id="${blockId}"]`)
    .first()
    .evaluate(readTypography)
}

test('measurement gate: measurer and page blocks share one typography root', async ({ page }) => {
  await page.goto('/?fixture=a&measurer=1')
  await page.waitForSelector('[data-paginated="true"]')
  // The measurer is `visibility: hidden`, so it never becomes "visible" — wait
  // for it to be attached instead.
  await page.waitForSelector('.pagination-measurer [data-entry-id="ent_acme"]', { state: 'attached' })

  // A work entry block — the kind whose measured height drives pagination.
  const measurer = await typographyOf(page, '.pagination-measurer', 'ent_acme')
  const pageBlock = await typographyOf(page, '.resume-page', 'ent_acme')

  // One explicit object comparison, so a mismatch names the property that moved.
  expect(measurer).toEqual(pageBlock)

  // The shared root must actually be the resume typography, not the browser
  // default (Times) — otherwise the equality above would be trivially "both
  // wrong" and the gate would pass while pagination still drifted.
  //
  // The bundled CJK font must be the *head* of the stack, not merely present
  // somewhere behind a system font that happens to also match. `fontFamily`
  // is the full resolved list (e.g. `"Source Han Sans SC", system-ui, …`), so
  // peel the first entry and compare it against the family we declare.
  const firstFamily = measurer['font-family']
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  expect(firstFamily).toBe(RESUME_FONT_FAMILY)
  // The stack still ends in a system fallback (so the resume degrades if the
  // bundled font is ever missing), and the size pin stays put.
  expect(measurer['font-family']).toContain('system-ui')
  expect(measurer['font-size']).toBe('12.5px')
})
