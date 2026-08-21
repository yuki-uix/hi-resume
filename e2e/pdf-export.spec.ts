import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

/**
 * AC 1–6 for issue #8 (PDF 导出与打印样式).
 *
 * The PDF comes from Chromium's own print pipeline (`page.pdf()`), which prints
 * the same `.resume-page` containers the screen renders — so screen and PDF
 * cannot drift. Every assertion here is against real external facts:
 *
 * - `page.pdf()` page count (AC 2 / 5), the same leaf-`/Page` counting method as
 *   `e2e/pagination.spec.ts`;
 * - `pdftotext` on the emitted bytes (AC 1 / 4 / 5) — text, not a screenshot;
 * - `pdffonts` on the emitted bytes (AC 6) — the CJK font must be *embedded*,
 *   which no on-screen look can verify (this machine has the font, so it always
 *   looks right locally).
 *
 * The e2e seed is the `?fixture=` dev entry from #6 (never the production
 * IndexedDB path), so every test opens a known-content resume.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function open(page: Page, fixture: string, pageSize: 'A4' | 'Letter' = 'A4'): Promise<void> {
  await page.goto(`/?fixture=${fixture}&pageSize=${pageSize}`)
  await page.waitForSelector('[data-paginated="true"]')
}

/**
 * Count the PDF pages Chromium emits. `/Count` in the page tree is unreliable
 * (Chromium nests a page tree), so count the leaf `/Page` objects — the same
 * method `e2e/pagination.spec.ts` uses.
 */
async function pdfPageCount(page: Page): Promise<number> {
  const pdf = await page.pdf({ preferCSSPageSize: true })
  const body = pdf.toString('latin1')
  const matches = body.match(/\/Type \/Page(?![a-zA-Z])/g)
  return matches ? matches.length : 0
}

/** Emit the PDF once and hand back a path `pdftotext` / `pdffonts` can read. */
async function renderPdf(page: Page, testInfo: TestInfo): Promise<string> {
  const pdf = await page.pdf({ preferCSSPageSize: true })
  const path = testInfo.outputPath('resume.pdf')
  await writeFile(path, pdf)
  return path
}

function execToString(command: 'pdftotext' | 'pdffonts', args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

/** Extract text from the whole PDF, or a `[first, last]` page range. */
async function pdfText(path: string, range?: [number, number]): Promise<string> {
  const args =
    range === undefined
      ? ['-layout', path, '-']
      : ['-layout', '-f', String(range[0]), '-l', String(range[1]), path, '-']
  return execToString('pdftotext', args)
}

type FontRow = {
  name: string
  type: string
  encoding: string
  emb: string
  sub: string
  uni: string
  objectId: string
}

/** Parse the `pdffonts` table. Header is two lines; each row is 7 columns. */
async function pdfFonts(path: string): Promise<FontRow[]> {
  const stdout = await execToString('pdffonts', [path])
  const lines = stdout.split('\n')

  // Columns are fixed-width, not whitespace-delimited ("Type 3" and "4  0" each
  // contain a space). The dash-runs of the separator line mark the columns.
  const separator = lines[1] ?? ''
  const bounds = [...separator.matchAll(/-+/g)].map((match) => {
    const start = match.index ?? 0
    return [start, start + match[0].length] as const
  })
  const slice = (line: string, column: number): string => {
    const [start, end] = bounds[column] ?? [0, 0]
    return line.slice(start, end).trim()
  }

  return lines
    .slice(2)
    .filter((line) => line.trim() !== '')
    .map((line) => ({
      name: slice(line, 0),
      type: slice(line, 1),
      encoding: slice(line, 2),
      emb: slice(line, 3),
      sub: slice(line, 4),
      uni: slice(line, 5),
      objectId: slice(line, 6),
    }))
}

async function pageEntryTitles(page: Page, index: number): Promise<string[]> {
  return page
    .locator(`.resume-page[data-page-index="${index}"] [data-entry-id] .resume-entry-title`)
    .evaluateAll((els) => els.map((el) => el.textContent ?? ''))
}

// ---------------------------------------------------------------------------
// AC 1 — the PDF's extracted text contains fixture key strings.
// ---------------------------------------------------------------------------

test('AC1: page.pdf() text contains the fixture key strings', async ({ page }, testInfo) => {
  await open(page, 'a')
  const text = await pdfText(await renderPdf(page, testInfo))

  expect(text).toContain('Ada Chen')
  expect(text).toContain('Senior Product Engineer')
  expect(text).toContain('TypeScript, React, Node.js, PostgreSQL')
  expect(text).toContain('个人简介')
  expect(text).toContain('工作经验')
  expect(text).toContain('技能')
  expect(text).toContain('技术栈')
})

// ---------------------------------------------------------------------------
// AC 2 — PDF page count equals the screen page count, on both fixtures.
// ---------------------------------------------------------------------------

for (const [fixture, expected] of [
  ['a', 1],
  ['b', 2],
] as const) {
  test(`AC2: fixture ${fixture} PDF pages == screen pages`, async ({ page }) => {
    await open(page, fixture)
    expect(await page.locator('.resume-page').count()).toBe(expected)
    expect(await pdfPageCount(page)).toBe(expected)
  })
}

// ---------------------------------------------------------------------------
// AC 3 — the print view drops the editor UI.
// ---------------------------------------------------------------------------

test('AC3: print view contains no editor UI', async ({ page }) => {
  await open(page, 'a')

  // Show the hover toolbar first, so "hidden in print" is a real assertion on a
  // rendered element rather than one that was never in the DOM.
  await page.hover('[data-section-id="sec_work"]')
  await expect(page.locator('[data-testid="section-toolbar"]')).toBeVisible()

  await page.emulateMedia({ media: 'print' })

  // Left column, middle form, and hover toolbar are all gone.
  await expect(page.locator('[data-testid="add-section"]')).toBeHidden()
  await expect(page.locator('[data-testid="entries-editor"]')).toBeHidden()
  await expect(page.locator('[data-testid="section-toolbar"]')).toBeHidden()
  await expect(page.locator('[data-testid="export-pdf"]')).toBeHidden()

  // The resume itself is still there.
  await expect(page.locator('[data-paginated="true"]')).toBeVisible()
  expect(await page.locator('.resume-page').count()).toBe(1)
})

// ---------------------------------------------------------------------------
// AC 3b — document.title is set to the suggested filename, then restored.
// ---------------------------------------------------------------------------

test('AC3b: print sets document.title to the suggested filename and restores it', async ({ page }) => {
  await open(page, 'a')
  const original = await page.title()

  // Stub the blocking dialog; the title is restored by `afterprint`, which we
  // drive manually so the test observes both the "during print" and "after"
  // states.
  await page.evaluate(() => {
    ;(window as unknown as { print: () => void }).print = () => {}
  })

  await page.click('[data-testid="export-pdf"]')
  await expect.poll(() => page.title()).toBe('Ada Chen-简历.pdf')

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect.poll(() => page.title()).toBe(original)
})

// ---------------------------------------------------------------------------
// AC 4 — extracted text is ordered top-to-bottom and words are never split.
// ---------------------------------------------------------------------------

test('AC4: extracted text is ordered and words are not split by stray spaces', async ({ page }, testInfo) => {
  await open(page, 'a')
  const text = await pdfText(await renderPdf(page, testInfo))

  // Presence + top-to-bottom order of the resume's sections and entries. Each
  // string is unique, so a strictly increasing indexOf sequence proves the
  // reading order matches the resume, not merely that everything is "somewhere".
  const ordered = [
    'Ada Chen',
    '个人简介',
    'Product engineer with eight years building tools people use daily.',
    '工作经验',
    'Senior Product Engineer',
    'Cut p99 checkout latency from 1.8s to 420ms.',
    'Led the migration of the billing service to event sourcing.',
    'Junior Engineer',
    '项目经历',
    'Atlas',
    'Beacon',
    '技能',
    '技术栈',
    'TypeScript, React, Node.js, PostgreSQL',
    'Vitest, Playwright, GitHub Actions',
  ]
  const positions = ordered.map((s) => text.indexOf(s))
  for (const p of positions) expect(p).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < positions.length; i += 1) {
    expect(positions[i]).toBeGreaterThan(positions[i - 1])
  }

  // Stray-whitespace probe: these words must survive without an internal space.
  for (const word of ['TypeScript', 'PostgreSQL', 'GitHub', 'ada@example.com', '工作经验', '个人简介']) {
    expect(text).toContain(word)
  }
})

// ---------------------------------------------------------------------------
// AC 5 — PDF page boundaries match the screen pages (fixture B), reusing #3.
// ---------------------------------------------------------------------------

test('AC5: PDF page boundaries match the screen pages', async ({ page }, testInfo) => {
  await open(page, 'b')
  expect(await page.locator('.resume-page').count()).toBe(2)

  const titles0 = await pageEntryTitles(page, 0)
  const titles1 = await pageEntryTitles(page, 1)
  const lastOf0 = titles0.at(-1)
  const firstOf1 = titles1[0]
  expect(lastOf0).toBe('Support Engineer')
  expect(firstOf1).toBe('Atlas')

  const path = await renderPdf(page, testInfo)
  const page1 = await pdfText(path, [1, 1])
  const page2 = await pdfText(path, [2, 2])

  expect(page1).toContain(lastOf0 as string)
  expect(page1).not.toContain(firstOf1 as string)
  expect(page2).toContain(firstOf1 as string)
})

// ---------------------------------------------------------------------------
// AC 6 — every font in the PDF is embedded (the CJK font above all).
// ---------------------------------------------------------------------------

test('AC6: every font in the PDF is embedded', async ({ page }, testInfo) => {
  await open(page, 'a')
  const path = await renderPdf(page, testInfo)

  // The Chinese text must actually be in the PDF, otherwise "all embedded"
  // would pass vacuously with no CJK font rendered at all.
  const text = await pdfText(path)
  expect(text).toContain('个人简介')

  const fonts = await pdfFonts(path)
  expect(fonts.length).toBeGreaterThan(0)
  for (const font of fonts) {
    expect(font.emb, `${font.name} has emb=${font.emb}`).toBe('yes')
  }
})
