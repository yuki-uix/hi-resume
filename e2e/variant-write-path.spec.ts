import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–3 for issue #39 (变体写路径缺少 e2e). #31 built the variant write path
 * (copy-on-write at inheritance granularity) and its reducers are unit-tested,
 * but the ~345 lines of editor chrome that dispatch against the *resolved*
 * composition had no browser coverage — a checkbox that reads `workspace.master`
 * instead of the resolved composition would pass every reducer test and still
 * render wrong here.
 *
 * AC1/AC2 drive `?fixture=a` (pre-seeded content with stable ids), asserting the
 * preview changes on a variant while the master stays put. AC3 drives the
 * persistent path (`/`, the only one with export controls) and reads the real
 * downloaded JSON to pin that the variant's partial composition is minimal —
 * `sectionOrder` is *absent*, and only the touched keys exist.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function openFixtureA(page: Page): Promise<void> {
  await page.goto('/?fixture=a')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

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

async function selectMaster(page: Page): Promise<void> {
  await page.selectOption('[data-testid="variant-select"]', 'master')
  await expect(page.locator('[data-editing-target="master"]')).toBeVisible()
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

// ---------------------------------------------------------------------------
// AC 1 — the entry checkbox reads the resolved composition, not the master.
// ---------------------------------------------------------------------------

test('AC1: the entry checkbox follows the current target', async ({ page }) => {
  await openFixtureA(page)
  await createVariant(page, '变体 A')

  const checkbox = page.locator('[data-entry-edit-id="ent_globex"] [data-testid="toggle-entry"]')
  await checkbox.uncheck()

  // On the variant: the checkbox is unchecked and the preview drops the entry.
  await expect(checkbox).not.toBeChecked()
  await expect(page.locator('[data-entry-id="ent_globex"]')).toHaveCount(0)

  // On the master: the checkbox is checked and the preview still has the entry.
  await selectMaster(page)
  await expect(page.locator('[data-entry-edit-id="ent_globex"] [data-testid="toggle-entry"]')).toBeChecked()
  await expect(page.locator('[data-entry-id="ent_globex"]')).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// AC 2 — one test per write granularity: variant changes, master does not.
// ---------------------------------------------------------------------------

test('AC2a: entry selection writes only the variant', async ({ page }) => {
  await openFixtureA(page)
  await createVariant(page, '变体 A')

  await page.locator('[data-entry-edit-id="ent_globex"] [data-testid="toggle-entry"]').uncheck()
  await expect(page.locator('[data-entry-id="ent_globex"]')).toHaveCount(0)

  await selectMaster(page)
  await expect(page.locator('[data-entry-id="ent_globex"]')).toHaveCount(1)
})

test('AC2b: bullet selection writes only the variant', async ({ page }) => {
  await openFixtureA(page)
  await createVariant(page, '变体 A')

  await page
    .locator('[data-entry-edit-id="ent_acme"] [data-bullet-edit-id="bul_acme_1"] [data-testid="toggle-bullet"]')
    .uncheck()
  await expect(page.locator('[data-bullet-id="bul_acme_1"]')).toHaveCount(0)

  await selectMaster(page)
  await expect(page.locator('[data-bullet-id="bul_acme_1"]')).toHaveCount(1)
})

test('AC2c: section visibility writes only the variant', async ({ page }) => {
  await openFixtureA(page)
  await createVariant(page, '变体 A')

  await page.locator('[data-section-list-id="sec_project"] [data-testid="toggle-section"]').uncheck()
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(0)

  await selectMaster(page)
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(1)
})

test('AC2d: section rename writes only the variant', async ({ page }) => {
  await openFixtureA(page)
  await createVariant(page, '变体 A')

  await page.locator('[data-section-list-id="sec_work"] [data-testid="rename-section"]').click()
  await page.fill('[data-testid="rename-input"]', '工作经历改写')
  await page.click('[data-testid="rename-submit"]')
  await expect(page.locator('[data-section-id="sec_work"]')).toHaveText('工作经历改写')

  await selectMaster(page)
  await expect(page.locator('[data-section-id="sec_work"]')).toHaveText('工作经验')
})

// ---------------------------------------------------------------------------
// AC 3 — the exported composition is exactly the touched keys, nothing more.
// ---------------------------------------------------------------------------

test('AC3: the exported composition is minimal', async ({ page }) => {
  await openEditor(page)

  // Build one entry + one bullet on the master, so the persistent (empty) path
  // has something to deselect on the variant.
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'Staff Engineer')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-bullet"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="bullet-text"]', 'Led the platform team')

  await createVariant(page, '变体 A')

  // entry selection: drop the single work entry.
  await page.locator('[data-section-edit-id="sec_work"] [data-testid="toggle-entry"]').uncheck()
  // bullet selection: drop the single bullet.
  await page.locator('[data-section-edit-id="sec_work"] [data-testid="toggle-bullet"]').uncheck()
  // visibleSections: hide the project section.
  await page.locator('[data-section-list-id="sec_project"] [data-testid="toggle-section"]').uncheck()
  // sectionTitles: rename the work section.
  await page.locator('[data-section-list-id="sec_work"] [data-testid="rename-section"]').click()
  await page.fill('[data-testid="rename-input"]', '经历改写')
  await page.click('[data-testid="rename-submit"]')

  const exported = JSON.parse(await captureExport(page)) as {
    pool: { entries: Record<string, unknown> }
    variants: Array<{ name: string; composition: Record<string, unknown> }>
  }
  const variant = exported.variants.find((v) => v.name === '变体 A')
  expect(variant).toBeDefined()
  const composition = variant?.composition ?? {}

  // Exactly the four touched fields — `sectionOrder` was never materialised.
  expect(Object.keys(composition).sort()).toEqual([
    'bulletSelection',
    'entrySelection',
    'sectionTitles',
    'visibleSections',
  ])
  expect(composition).not.toHaveProperty('sectionOrder')

  // Only the section / entry we actually touched are present.
  expect(Object.keys(composition.entrySelection as Record<string, unknown>).sort()).toEqual(['sec_work'])
  const entryIds = Object.keys(exported.pool.entries)
  expect(entryIds).toHaveLength(1)
  expect(Object.keys(composition.bulletSelection as Record<string, unknown>).sort()).toEqual(entryIds.sort())
})
