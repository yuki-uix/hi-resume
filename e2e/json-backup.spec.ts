import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–8 for issue #7 (JSON import/export). Every test drives the *default
 * assembly path* (`/`, no `?fixture=`), so export reads the real store and
 * import really writes through Dexie to IndexedDB — the same guarantees the
 * rest of the e2e suite relies on.
 *
 * The round-trip assertions compare the **whole** parsed JSON with
 * `toStrictEqual`: nothing is deleted or exempted before comparing, which is
 * exactly what AC8 forbids.
 */

async function openEditor(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

/** Type one work entry + bullet + name, so the workspace has real content. */
async function buildContent(page: Page): Promise<void> {
  await page.fill('[data-testid="basics-name"]', 'Alice Wu')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'Staff Engineer')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-bullet"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="bullet-text"]', 'Led the platform team')
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

/** Feed `json` to the file input and confirm the import through the dialog. */
async function importJson(page: Page, json: string): Promise<void> {
  await page.setInputFiles('[data-testid="import-file"]', {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
  await expect(page.locator('[data-testid="import-summary"]')).toBeVisible()
  await page.click('[data-testid="import-confirm-submit"]')
  await expect(page.locator('[data-testid="import-done"]')).toBeVisible()
}

/** Feed `json` to the file input and expect the error dialog (no import). */
async function expectImportError(page: Page, json: string): Promise<void> {
  await page.setInputFiles('[data-testid="import-file"]', {
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
  await expect(page.locator('[data-testid="import-error"]')).toBeVisible()
}

test('AC1: export → import → export is deep-equal, whole JSON, no field exempted', async ({ page }) => {
  await openEditor(page)
  await buildContent(page)

  const first = await captureExport(page)
  const firstJson = JSON.parse(first)

  await importJson(page, first)

  const second = await captureExport(page)
  expect(JSON.parse(second)).toStrictEqual(firstJson)
})

test('AC2: preview DOM text is identical across the round trip', async ({ page }) => {
  await openEditor(page)
  await buildContent(page)

  const preview = page.locator('[data-paginated="true"]')
  const before = await preview.textContent()

  const exported = await captureExport(page)
  await importJson(page, exported)

  const after = await preview.textContent()
  expect(after).toBe(before)
})

test('AC3: importing JSON missing a required field errors and leaves existing data untouched', async ({ page }) => {
  await openEditor(page)
  await buildContent(page)

  // Corrupt a valid export: drop one entry's required `id`.
  const exported = JSON.parse(await captureExport(page)) as {
    pool: { entries: Record<string, { id: string }> }
  }
  const entryKey = Object.keys(exported.pool.entries)[0]
  if (!entryKey) throw new Error('expected at least one entry')
  delete exported.pool.entries[entryKey].id

  await expectImportError(page, JSON.stringify(exported))
  await expect(page.locator('[data-testid="import-error"]')).toContainText('pool.entries.')

  // Dismiss, then the form and preview still show the pre-import content.
  await page.click('[data-testid="import-error-dismiss"]')
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Alice Wu')
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="entry-title"]')).toHaveValue(
    'Staff Engineer',
  )
  await expect(page.locator('[data-entry-id] .resume-entry-title')).toHaveText('Staff Engineer')
})

test('AC4: importing an unsupported schemaVersion shows a clear error', async ({ page }) => {
  await openEditor(page)

  const exported = JSON.parse(await captureExport(page)) as { schemaVersion: number }
  exported.schemaVersion = 999

  await expectImportError(page, JSON.stringify(exported))
  await expect(page.locator('[data-testid="import-error"]')).toContainText('999')
  await expect(page.locator('[data-testid="import-error"]')).toContainText('无法导入')
})

test('AC5: cancelling the import confirmation leaves data unchanged', async ({ page }) => {
  await openEditor(page)
  await buildContent(page)

  const exported = JSON.parse(await captureExport(page)) as { pool: { basics: { name: string } } }
  exported.pool.basics.name = 'Someone Else'

  await page.setInputFiles('[data-testid="import-file"]', {
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  })
  await expect(page.locator('[data-testid="import-summary"]')).toBeVisible()

  await page.click('[data-testid="import-cancel"]')

  await expect(page.locator('[data-testid="import-summary"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Alice Wu')
  await expect(page.locator('[data-testid="import-done"]')).toHaveCount(0)
})

test('AC6: the exported file is valid JSON, parseable directly', async ({ page }) => {
  await openEditor(page)

  const text = await captureExport(page)

  expect(() => JSON.parse(text)).not.toThrow()
})

test('AC7: import writes to IndexedDB and survives a reload', async ({ page }) => {
  await openEditor(page)
  await buildContent(page)

  const exported = JSON.parse(await captureExport(page)) as { pool: { basics: { name: string } } }
  exported.pool.basics.name = 'Imported Carol'
  await importJson(page, JSON.stringify(exported))

  // Reload wipes memory; the only source of "Imported Carol" is IndexedDB.
  await page.reload()
  await openEditor(page)

  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Imported Carol')
  await expect(page.locator('.resume-name')).toHaveText('Imported Carol')
  await expect(page.locator('[data-entry-id] .resume-entry-title')).toHaveText('Staff Engineer')
})
