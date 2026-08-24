import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { VARIANT_BACKEND_ID, VARIANT_FRONTEND_ID } from '../src/features/preview/fixtures'

/**
 * AC 1/2/5/8/9 for issue #30 (岗位版本的创建、复制、删除与切换).
 *
 * The CRUD flows drive the *default assembly path* (`/`, no `?fixture=`) so a
 * created variant is a real store mutation and the JSON export reads the real
 * workspace. The switch/delete/export tests drive `?fixture=variants`, whose two
 * pre-seeded variants *differ* from the master — a variant whose composition is
 * `{}` renders byte-identically to the master, so only a differing variant can
 * prove the preview really followed the switch (AC8) rather than staying stale.
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function openEditor(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

async function openVariantsFixture(page: Page): Promise<void> {
  await page.goto('/?fixture=variants')
  await page.waitForSelector('[data-paginated="true"]')
}

async function previewSectionIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-section-id]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-section-id') ?? ''))
}

async function createVariant(page: Page, name: string): Promise<void> {
  await page.click('[data-testid="new-variant"]')
  await page.fill('[data-testid="variant-name-input"]', name)
  await page.click('[data-testid="variant-dialog-submit"]')
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

/** Extract text from the PDF Chromium emits for the current page. */
async function pdfText(page: Page): Promise<string> {
  const pdf = await page.pdf({ preferCSSPageSize: true })
  const doc = await getDocument({ data: new Uint8Array(pdf) }).promise
  let out = ''
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pdfPage = await doc.getPage(i)
    const content = await pdfPage.getTextContent()
    out += content.items.map((item) => ('str' in item ? item.str : '')).join('')
    out += '\n'
  }
  return out
}

// ---------------------------------------------------------------------------
// AC 1 — a new variant renders identically to the master and stores `{}`.
// ---------------------------------------------------------------------------

test('AC1: a new variant renders like the master and its composition is empty in the JSON', async ({ page }) => {
  await openEditor(page)

  const masterIds = await previewSectionIds(page)
  expect(masterIds.length).toBeGreaterThan(0)

  await createVariant(page, '后端岗位')

  // The switcher names the new variant, and the identity hint flips to variant.
  await expect(page.locator('[data-editing-target="variant"]')).toBeVisible()
  await expect(page.locator('[data-testid="variant-select"]')).toHaveValue(/^var_/)

  // The preview is unchanged — the empty partial inherits every master key.
  expect(await previewSectionIds(page)).toEqual(masterIds)

  // The external fact AC1 pins: the exported JSON has `composition: {}`, not a
  // copy of the master composition.
  const exported = JSON.parse(await captureExport(page)) as {
    variants: Array<{ name: string; composition: Record<string, unknown>; textOverrides: Record<string, unknown> }>
  }
  const variant = exported.variants.find((v) => v.name === '后端岗位')
  expect(variant).toBeDefined()
  expect(variant?.composition).toEqual({})
  expect(variant?.textOverrides).toEqual({})
})

// ---------------------------------------------------------------------------
// AC 2 — a master edit flows into an existing variant.
// ---------------------------------------------------------------------------

test('AC2: edits made on the master appear in an existing variant', async ({ page }) => {
  await openEditor(page)

  // Build one entry + bullet on the master first.
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'Staff Engineer')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-bullet"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="bullet-text"]', 'Led the platform team')

  await createVariant(page, '变体 V')
  await expect(page.locator('[data-editing-target="variant"]')).toBeVisible()

  // Back to the master, then make two edits: rewrite a bullet, add an entry.
  await page.selectOption('[data-testid="variant-select"]', 'master')
  await expect(page.locator('[data-editing-target="master"]')).toBeVisible()

  await page.fill('[data-section-edit-id="sec_work"] [data-testid="bullet-text"]', 'Led the platform team v2')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'Second Role')

  // Switch back to the variant: both master edits flow in via inheritance.
  await page.selectOption('[data-testid="variant-select"]', { label: '变体 V' })

  const preview = page.locator('[data-paginated="true"]')
  await expect(preview).toContainText('Led the platform team v2')
  await expect(preview).toContainText('Second Role')
})

// ---------------------------------------------------------------------------
// AC 5 — PDF export follows the selected variant.
// ---------------------------------------------------------------------------

test('AC5: PDF export renders the selected variant, not the master', async ({ page }) => {
  await openVariantsFixture(page)

  await page.selectOption('[data-testid="variant-select"]', VARIANT_BACKEND_ID)
  await expect(page.locator('[data-editing-target="variant"]')).toBeVisible()
  // The backend variant hides the project section on screen…
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(0)

  // …and the emitted PDF omits it too.
  const text = await pdfText(page)
  expect(text).toContain('技能')
  expect(text).not.toContain('项目经历')
})

// ---------------------------------------------------------------------------
// AC 8 — switching target recomputes the preview (memo dependency).
// ---------------------------------------------------------------------------

test('AC8: switching the target recomputes the preview from the selected variant', async ({ page }) => {
  await openVariantsFixture(page)

  // Master shows both the project and skill sections.
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(1)
  await expect(page.locator('[data-section-id="sec_skill"]')).toHaveCount(1)

  // The backend variant hides the project section.
  await page.selectOption('[data-testid="variant-select"]', VARIANT_BACKEND_ID)
  await expect(page.locator('[data-editing-target="variant"]')).toBeVisible()
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(0)
  await expect(page.locator('[data-section-id="sec_skill"]')).toHaveCount(1)

  // The frontend variant hides the skill section instead — the switch back is a
  // second recompute, proving the preview tracks the *current* target, not the
  // first non-master one.
  await page.selectOption('[data-testid="variant-select"]', VARIANT_FRONTEND_ID)
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(1)
  await expect(page.locator('[data-section-id="sec_skill"]')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// AC 9 — deleting the current variant resets the target to the master.
// ---------------------------------------------------------------------------

test('AC9: deleting the current variant resets the target to the master', async ({ page }) => {
  await openVariantsFixture(page)

  await page.selectOption('[data-testid="variant-select"]', VARIANT_BACKEND_ID)
  await expect(page.locator('[data-editing-target="variant"]')).toBeVisible()
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(0)

  await page.click('[data-testid="delete-variant"]')
  await expect(page.locator('[data-testid="variant-delete-confirm"]')).toBeVisible()
  await page.click('[data-testid="variant-delete-confirm"]')

  // The target is back on the master: the identity hint, the master's project
  // section, and a switcher that no longer lists the deleted variant.
  await expect(page.locator('[data-editing-target="master"]')).toBeVisible()
  await expect(page.locator('[data-section-id="sec_project"]')).toHaveCount(1)
  await expect(page.locator(`[data-testid="variant-select"] option[value="${VARIANT_BACKEND_ID}"]`)).toHaveCount(0)
})
