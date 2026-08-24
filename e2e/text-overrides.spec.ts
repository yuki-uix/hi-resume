import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1/3/5 for issue #32 (变体的文字覆盖 — textOverrides 写路径). Rewriting a
 * bullet / entry title / text-section body on a variant must land in
 * `variant.textOverrides` and leave `pool` byte-for-byte intact; clearing an
 * override must *delete* the key (not leave `undefined` or `null`), and the
 * empty string must render as empty rather than falling back to the inherited
 * text. These tests read the real downloaded JSON (`captureExport`) so the
 * "pool holds the original, override holds the rewrite" split is an external
 * fact, not an assertion the UI could satisfy vacuously.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function openEditor(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

async function createVariant(page: Page, name: string): Promise<void> {
  await page.click('[data-testid="new-variant"]')
  await page.fill('[data-testid="variant-name-input"]', name)
  await page.click('[data-testid="variant-dialog-submit"]')
  await expect(page.locator('[data-editing-target="variant"]')).toBeVisible()
}

/** Click export and read back the downloaded file's raw text. */
async function captureExport(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-json"]'),
  ])
  const path = await download.path()
  if (!path) throw new Error('download produced no file path')
  return readFile(path, 'utf8')
}

/** Build one work entry with one bullet on the master (the persistent path is empty). */
async function buildWorkEntry(page: Page, title: string, bulletText: string): Promise<void> {
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', title)
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-bullet"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="bullet-text"]', bulletText)
}

// ---------------------------------------------------------------------------
// AC 1 — an override lands in textOverrides, never the pool.
// ---------------------------------------------------------------------------

test('AC1: a bullet override lives in textOverrides and the pool keeps the original', async ({ page }) => {
  await openEditor(page)
  await buildWorkEntry(page, 'Staff Engineer', 'Original bullet text')
  await createVariant(page, '变体 A')

  // Rewrite the bullet on the variant.
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="bullet-text"]', 'Reworded for a design role')

  // The variant preview shows the rewrite…
  await expect(page.locator('[data-paginated="true"]')).toContainText('Reworded for a design role')

  // …and the exported JSON is the external fact: pool holds the original, the
  // variant's textOverrides holds the rewrite.
  const exported = JSON.parse(await captureExport(page)) as {
    pool: { bullets: Record<string, { text: string }> }
    variants: Array<{ name: string; textOverrides: Record<string, string> }>
  }
  const bulletIds = Object.keys(exported.pool.bullets)
  expect(bulletIds).toHaveLength(1)
  const bulletId = bulletIds[0] as string
  expect(exported.pool.bullets[bulletId]?.text).toBe('Original bullet text')

  const variant = exported.variants.find((v) => v.name === '变体 A')
  expect(variant?.textOverrides[bulletId]).toBe('Reworded for a design role')

  // The master still renders the original.
  await page.selectOption('[data-testid="variant-select"]', 'master')
  await expect(page.locator('[data-editing-target="master"]')).toBeVisible()
  await expect(page.locator('[data-paginated="true"]')).toContainText('Original bullet text')
  await expect(page.locator('[data-paginated="true"]')).not.toContainText('Reworded for a design role')
})

// ---------------------------------------------------------------------------
// AC 3 — restoring inheritance deletes the key.
// ---------------------------------------------------------------------------

test('AC3: clearing an override deletes the key, it is not null or undefined', async ({ page }) => {
  await openEditor(page)
  await buildWorkEntry(page, 'Original Title', 'Original bullet text')
  await createVariant(page, '变体 A')

  // Override the title; the inheritance dot flips to "overridden".
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'Overridden Title')
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="restore-override"]')).toHaveCount(1)
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-overridden="true"]')).toHaveCount(1)

  // Restore: the dot flips back to "inherited" and the title reverts.
  await page.click('[data-section-edit-id="sec_work"] [data-testid="restore-override"]')
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="entry-title"]')).toHaveValue(
    'Original Title',
  )
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="restore-override"]')).toHaveCount(0)

  // External fact: the key is gone from the exported JSON, not `null`/`undefined`.
  const exported = JSON.parse(await captureExport(page)) as {
    pool: { entries: Record<string, unknown> }
    variants: Array<{ name: string; textOverrides: Record<string, string> }>
  }
  const variant = exported.variants.find((v) => v.name === '变体 A')
  const entryIds = Object.keys(exported.pool.entries)
  expect(entryIds).toHaveLength(1)
  const entryId = entryIds[0] as string
  expect(Object.prototype.hasOwnProperty.call(variant?.textOverrides, entryId)).toBe(false)
  expect(variant?.textOverrides).toEqual({})
})

// ---------------------------------------------------------------------------
// AC 5 — the empty string is a real override, not a fallback to the original.
// ---------------------------------------------------------------------------

test('AC5: an empty-string override renders empty, not the inherited text', async ({ page }) => {
  await openEditor(page)

  // Give the text-layout summary a body on the master, so a variant has
  // something it could fall back to.
  await page.fill('[data-section-edit-id="sec_summary"] [data-testid="section-text"]', 'Inherited summary prose')

  await createVariant(page, '变体 A')

  // Override the summary body to the empty string.
  await page.fill('[data-section-edit-id="sec_summary"] [data-testid="section-text"]', '')

  // External fact: the override is `''` (a real key), and the pool is untouched.
  const exported = JSON.parse(await captureExport(page)) as {
    pool: { sections: Record<string, { text?: string }> }
    variants: Array<{ name: string; textOverrides: Record<string, string> }>
  }
  const variant = exported.variants.find((v) => v.name === '变体 A')
  expect(variant?.textOverrides['sec_summary']).toBe('')
  expect(exported.pool.sections['sec_summary']?.text).toBe('Inherited summary prose')

  // The variant preview renders empty — it does NOT fall back to the inherited
  // prose, and the override dot lights up as "overridden".
  await expect(page.locator('[data-paginated="true"]')).not.toContainText('Inherited summary prose')
  await expect(page.locator('[data-section-edit-id="sec_summary"] [data-overridden="true"]')).toHaveCount(1)
})
