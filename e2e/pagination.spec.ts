import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–9 + 6b for issue #3. Every assertion here runs in a real browser against
 * the rendered DOM (and, for 6b, the PDF Chromium actually produces) — pagination
 * cannot be verified with unit tests, so there is no Vitest duplicate.
 *
 * Fixture ids are the raw strings from `src/domain/__fixtures__/workspace.ts`
 * (`asSectionId` / `asEntryId` / `asBulletId` return their argument unchanged),
 * so the `data-*` values asserted here are the same strings the fixtures use.
 */

async function open(page: Page, fixture: string, pageSize: 'A4' | 'Letter' = 'A4'): Promise<void> {
  await page.goto(`/?fixture=${fixture}&pageSize=${pageSize}`)
  await page.waitForSelector('[data-paginated="true"]')
}

async function pageEntryIds(page: Page, index: number): Promise<string[]> {
  return page
    .locator(`.resume-page[data-page-index="${index}"] [data-entry-id]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-entry-id') ?? ''))
}

/**
 * Count the PDF pages Chromium emits for the current page. `/Count` in the page
 * tree is not reliable (Chromium nests a page tree and `/Count` counts nodes,
 * not leaves), so count the leaf `/Page` objects instead.
 */
async function pdfPageCount(page: Page): Promise<number> {
  const pdf = await page.pdf({ preferCSSPageSize: true })
  const body = pdf.toString('latin1')
  const matches = body.match(/\/Type \/Page(?![a-zA-Z])/g)
  return matches ? matches.length : 0
}

// ---------------------------------------------------------------------------
// 1 — short content is a single page.
// ---------------------------------------------------------------------------

test('AC1: fixture A renders as one page', async ({ page }) => {
  await open(page, 'a')
  expect(await page.locator('.resume-page').count()).toBe(1)
})

// ---------------------------------------------------------------------------
// 2 — long content spills to two pages; pin the exact boundary ids.
// ---------------------------------------------------------------------------

test('AC2: fixture B is two pages with the expected boundary', async ({ page }) => {
  await open(page, 'b')
  expect(await page.locator('.resume-page').count()).toBe(2)
  expect((await pageEntryIds(page, 0)).at(-1)).toBe('ent_b_6')
  expect((await pageEntryIds(page, 1))[0]).toBe('ent_atlas')
})

// ---------------------------------------------------------------------------
// 3 — an entry constructed to straddle a boundary stays whole on one page.
// ---------------------------------------------------------------------------

test('AC3: fixture C keeps the tall entry whole on one page', async ({ page }) => {
  await open(page, 'c')
  expect(await page.locator('.resume-page').count()).toBe(2)
  // The tall entry appears exactly once, on page 1, with all 16 of its bullets.
  expect(await page.locator('[data-entry-id="ent_c_tall"]').count()).toBe(1)
  expect(await pageEntryIds(page, 1)).toEqual(['ent_c_tall'])
  expect(
    await page.locator('[data-entry-id="ent_c_tall"] [data-bullet-id]').count(),
  ).toBe(16)
})

// ---------------------------------------------------------------------------
// 4 — a section title stranded at a page bottom moves with its first entry.
// ---------------------------------------------------------------------------

test('AC4: fixture D keeps the project title with its first entry', async ({ page }) => {
  await open(page, 'd')
  expect(await page.locator('.resume-page').count()).toBe(2)

  const titlePage = await page
    .locator('[data-section-id="sec_project"]')
    .evaluate((el) => el.closest('.resume-page')?.getAttribute('data-page-index'))
  const entryPage = await page
    .locator('[data-entry-id="ent_atlas"]')
    .evaluate((el) => el.closest('.resume-page')?.getAttribute('data-page-index'))

  expect(titlePage).toBe('1')
  expect(entryPage).toBe('1')
})

// ---------------------------------------------------------------------------
// 5 — a fixture whose page count differs between A4 and Letter.
// ---------------------------------------------------------------------------

test('AC5: fixture E page count differs between A4 and Letter', async ({ page }) => {
  await open(page, 'e', 'A4')
  expect(await page.locator('.resume-page').count()).toBe(2)
  await open(page, 'e', 'Letter')
  expect(await page.locator('.resume-page').count()).toBe(3)
})

// ---------------------------------------------------------------------------
// 6 — a custom-kind section renders without a template change.
// ---------------------------------------------------------------------------

test('AC6: custom section renders through the generic renderer', async ({ page }) => {
  await open(page, 'custom')
  await expect(page.locator('[data-section-id="sec_oss"]')).toHaveText('开源贡献')
  expect(await page.locator('[data-entry-id="ent_oss"]').count()).toBe(1)
})

// ---------------------------------------------------------------------------
// 6b — screen page count equals page.pdf() page count.
// ---------------------------------------------------------------------------

for (const [fixture, expected] of [
  ['a', 1],
  ['b', 2],
] as const) {
  test(`AC6b: fixture ${fixture} screen pages == pdf pages`, async ({ page }) => {
    await open(page, fixture)
    expect(await page.locator('.resume-page').count()).toBe(expected)
    expect(await pdfPageCount(page)).toBe(expected)
  })
}

// ---------------------------------------------------------------------------
// 7 — text-layout body is real, readable DOM text.
// ---------------------------------------------------------------------------

test('AC7: text-layout body is readable via textContent', async ({ page }) => {
  await open(page, 'a')
  const text = await page.locator('body').textContent()
  expect(text).toContain('Product engineer with eight years building tools people use daily.')
})

// ---------------------------------------------------------------------------
// 8 — text-layout with undefined text still renders its title, empty body.
// ---------------------------------------------------------------------------

test('AC8: undefined text renders the title and an empty body without error', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await open(page, 'text-undefined')
  await expect(page.locator('[data-section-id="sec_summary"]')).toHaveText('个人简介')
  // The summary is the only text-layout section, and its body is undefined, so
  // no text body is emitted at all.
  expect(await page.locator('.resume-text-body').count()).toBe(0)
  expect(pageErrors).toEqual([])
})

// ---------------------------------------------------------------------------
// 9 — text-layout and entries-layout sections coexist, pagination still holds.
// ---------------------------------------------------------------------------

test('AC9: mixed text and entries sections paginate together', async ({ page }) => {
  await open(page, 'b')
  // summary (text) plus work/project/skill (entries) in the same render.
  expect(await page.locator('.resume-text-body').count()).toBe(1)
  expect(await page.locator('[data-entry-id]').count()).toBeGreaterThan(0)
  // and the two-page boundary from AC2 still holds with both layouts mixed in.
  expect(await page.locator('.resume-page').count()).toBe(2)
  expect((await pageEntryIds(page, 0)).at(-1)).toBe('ent_b_6')
  expect((await pageEntryIds(page, 1))[0]).toBe('ent_atlas')
})

// ---------------------------------------------------------------------------
// External fact checks — anchor ids match fixture ids; text is DOM, not media.
// ---------------------------------------------------------------------------

test('anchors: data-* ids equal the fixture ids', async ({ page }) => {
  await open(page, 'a')

  const sectionIds = await page
    .locator('[data-section-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-section-id')).sort())
  expect(sectionIds).toEqual(['sec_project', 'sec_skill', 'sec_summary', 'sec_work'])

  const entryIds = await page
    .locator('[data-entry-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-entry-id')))
  expect(entryIds).toEqual([
    'ent_acme',
    'ent_globex',
    'ent_initech',
    'ent_atlas',
    'ent_beacon',
    'ent_skills',
  ])

  // A couple of bullet anchors, including one that is deliberately re-ordered
  // by the master composition (acme selects bullets out of order).
  expect(await page.locator('[data-bullet-id="bul_acme_1"]').count()).toBe(1)
  expect(await page.locator('[data-bullet-id="bul_atlas_1"]').count()).toBe(1)
})

// ---------------------------------------------------------------------------
// 10 (#28) — no page may render content taller than its content area.
// ---------------------------------------------------------------------------

type PageFit = {
  index: number
  /** The page's padding box: page height, since the container has no border. */
  clientHeight: number
  scrollHeight: number
  /** `clientHeight` minus the two page margins — what pagination budgets for. */
  contentAreaPx: number
  /** How far the block flow actually reaches below the content box top. */
  contentUsedPx: number
  /** Overflow measured against the padding box (hides the bottom margin). */
  scrollOverflowPx: number
  /** Overflow measured against the content area — the pagination budget. */
  contentOverflowPx: number
}

/**
 * Read every page's real content extent. `.resume-page` is `overflow: hidden`,
 * so anything past the content area is invisible on screen *and* absent from
 * the PDF: measuring is the only way to see it.
 */
async function pageFits(page: Page): Promise<PageFit[]> {
  return page.locator('.resume-page').evaluateAll((els) =>
    els.map((el, index) => {
      const style = getComputedStyle(el)
      const padTop = Number.parseFloat(style.paddingTop)
      const padBottom = Number.parseFloat(style.paddingBottom)
      const contentTop = el.getBoundingClientRect().top + padTop
      const contentAreaPx = el.clientHeight - padTop - padBottom
      // Only the measured block wrappers count. The overflow notice is an
      // absolutely-positioned screen affordance, not part of the flow.
      const blocks = Array.from(el.children).filter(
        (child) => !(child as HTMLElement).hasAttribute('data-overflow-notice'),
      )
      const bottom = blocks.reduce(
        (max, child) => Math.max(max, child.getBoundingClientRect().bottom),
        contentTop,
      )
      return {
        index,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        contentAreaPx,
        contentUsedPx: bottom - contentTop,
        scrollOverflowPx: el.scrollHeight - el.clientHeight,
        contentOverflowPx: bottom - contentTop - contentAreaPx,
      }
    }),
  )
}

/** Sub-pixel slack: layout rounding, not truncation. */
const FIT_TOLERANCE_PX = 0.5

for (const fixture of ['a', 'b', 'c', 'd', 'e'] as const) {
  test(`AC10: fixture ${fixture} — every page's content fits its content area`, async ({
    page,
  }) => {
    await open(page, fixture)
    const fits = await pageFits(page)
    expect(fits.length).toBeGreaterThan(0)
    for (const fit of fits) {
      expect(fit.contentOverflowPx, `page ${fit.index} measured ${JSON.stringify(fit)}`).toBeLessThanOrEqual(
        FIT_TOLERANCE_PX,
      )
    }
    // Nothing overflowed, so nothing may be warned about — otherwise the notice
    // assertions below would pass on a preview that cries wolf on every page.
    expect(await page.locator('[data-overflow-notice]').count()).toBe(0)
  })
}

// ---------------------------------------------------------------------------
// 10b (#28) — the known-overflowing fixture. `bullets-200` is one entry with
// 200 bullets: a single indivisible block taller than a whole page, which the
// greedy pass gives its own page and which then overruns it. Splitting such a
// block is a change to the pagination model and is out of scope for #28, so
// this test does not assert that it fits — it pins the defect at its measured
// size and asserts that it is no longer silent.
//
// If pagination ever learns to split blocks, this test fails. That is the
// intent: the fixture would then belong in the AC10 list above.
// ---------------------------------------------------------------------------

test('AC10b: bullets-200 overflows its page, and the page says so', async ({ page }) => {
  await open(page, 'bullets-200')
  const fits = await pageFits(page)
  const contentAreaPx = fits[0]?.contentAreaPx ?? 0
  expect(contentAreaPx).toBeGreaterThan(0)

  // Precondition first: the fixture must really produce a block taller than the
  // content area. `getBoundingClientRect` reports the element's full box even
  // where an ancestor clips it, so this is the block's true height. Without
  // this assertion, everything below could be passing about a page that never
  // overflowed at all.
  const entryHeight = await page
    .locator('.resume-page [data-entry-id="ent_perf"]')
    .evaluate((el) => el.getBoundingClientRect().height)
  expect(
    entryHeight,
    `entry block is ${entryHeight}px, page content area is ${contentAreaPx}px`,
  ).toBeGreaterThan(contentAreaPx)

  // The defect itself, measured: exactly one page overruns its content area.
  const overflowing = fits.filter((fit) => fit.contentOverflowPx > FIT_TOLERANCE_PX)
  expect(overflowing.map((fit) => fit.index)).toEqual([1])
  const overflow = overflowing[0] as PageFit
  // Both readings of "how much is lost" agree to within a rounding pixel:
  // `scrollHeight - clientHeight` (the padding box) and content-used minus the
  // content area. If these ever diverge, one of them is measuring the wrong box.
  expect(Math.abs(overflow.contentOverflowPx - overflow.scrollOverflowPx)).toBeLessThan(1)
  // Same order of magnitude as the block's own overhang — this is a whole entry
  // of lost bullets, not a rounding artefact.
  expect(overflow.contentOverflowPx).toBeGreaterThan(1000)

  // And it is no longer silent: the affected page names the entry and says the
  // excess is gone from the PDF.
  const notice = page.locator('.resume-page[data-page-index="1"] [data-overflow-notice]')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Performance')
  await expect(notice).toContainText('导出的 PDF 里也没有这些内容')
  // Only the page that overflows carries one.
  expect(await page.locator('[data-overflow-notice]').count()).toBe(1)
})

// ---------------------------------------------------------------------------
// 10c (#28) — the notice is an editing affordance, not resume content: it must
// not reach the print view, and it must not move a page boundary.
// ---------------------------------------------------------------------------

test('AC10c: the overflow notice is screen-only and does not move page boundaries', async ({
  page,
}) => {
  await open(page, 'bullets-200')
  const notice = page.locator('[data-overflow-notice]')
  await expect(notice).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(notice).toBeHidden()
  await page.emulateMedia({ media: 'screen' })

  // It is not among the blocks: the off-screen measurer renders exactly what
  // `buildBlocks` produced, so a notice there would be a measured height.
  await page.goto('/?fixture=bullets-200&measurer=1')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('.pagination-measurer', { state: 'attached' })
  expect(await page.locator('.pagination-measurer [data-overflow-notice]').count()).toBe(0)

  // And it is out of the page's flow: deleting it changes no page's measured
  // geometry. If it were in the flow (or stretched the scroll area), the
  // scrollHeight readings below would move when it goes away.
  const before = await pageFits(page)
  expect(before.some((fit) => fit.scrollOverflowPx > 0)).toBe(true)
  await page.evaluate(() => {
    document.querySelectorAll('[data-overflow-notice]').forEach((el) => el.remove())
  })
  expect(await page.locator('[data-overflow-notice]').count()).toBe(0)
  expect(await pageFits(page)).toEqual(before)
})

test('anchors: text is real DOM, not canvas or image', async ({ page }) => {
  await open(page, 'b')
  expect(await page.locator('canvas').count()).toBe(0)
  expect(await page.locator('.resume-page img').count()).toBe(0)
  const text = await page.locator('body').textContent()
  expect(text).toContain('Ada Chen')
  expect(text).toContain('Senior Product Engineer')
})
