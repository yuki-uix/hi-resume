import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–3 + 5 for issue #26 (主简历删除的影响面确认与变体清理).
 *
 * The key external fact (AC3) is *not* the naive "create two variants, delete an
 * entry, export, grep zero hits" — on a fresh variant the partial has no
 * `entrySelection` key at all, so that check passes even on an unfixed main. The
 * dangling id only appears once a variant *materialises* its own selection for
 * the section (e.g. by unchecking a sibling entry). AC3 below drives exactly
 * that: materialise first, delete second, then assert the exported JSON has no
 * trace of the deleted id.
 */

async function open(page: Page, fixture?: string): Promise<void> {
  await page.goto(fixture ? `/?fixture=${fixture}` : '/')
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

/** The entry-edit ids of the work section, in render order. */
async function workEntryEditIds(page: Page): Promise<string[]> {
  return page.locator('[data-section-edit-id="sec_work"] [data-entry-edit-id]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-entry-edit-id') ?? ''),
  )
}

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
// AC 1 — the confirm lists the affected variant *names*, not a count.
// ---------------------------------------------------------------------------

test('AC1: delete confirm lists every variant that renders the entry', async ({ page }) => {
  await open(page, 'variants')

  // Both seeded variants inherit the work selection, so both render ent_acme.
  await page.click('[data-entry-edit-id="ent_acme"] [data-testid="delete-entry"]')

  const impact = page.locator('[data-testid="delete-impact"]')
  await expect(impact).toBeVisible()
  await expect(impact).toContainText('后端侧重')
  await expect(impact).toContainText('前端侧重')
})

// ---------------------------------------------------------------------------
// AC 2 — no variants render the entry → no impact paragraph at all.
// ---------------------------------------------------------------------------

test('AC2: no impact notice when no variant renders the entry', async ({ page }) => {
  await open(page, 'a') // fixture `a` has no variants

  await page.click('[data-entry-edit-id="ent_acme"] [data-testid="delete-entry"]')
  await expect(page.locator('[data-testid="delete-entry-title"]')).toBeVisible()
  await expect(page.locator('[data-testid="delete-impact"]')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// AC 3 — materialise a variant's selection first, then delete, then export and
// assert the deleted id leaves no trace.
// ---------------------------------------------------------------------------

test('AC3: deleting an entry removes its id from materialised variant selections', async ({ page }) => {
  await open(page) // persistent path — the only one with export controls

  // Two entries in sec_work so that unchecking one materialises the other's id.
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  const ids = await workEntryEditIds(page)
  const targetId = ids[0] ?? ''
  const siblingId = ids[1] ?? ''
  expect(targetId).toBeTruthy()
  expect(siblingId).toBeTruthy()

  // Materialise: on a variant, uncheck the sibling so the variant's own
  // `entrySelection.sec_work` is now exactly `[targetId]`.
  await createVariant(page, '变体 A')
  await page.locator(`[data-entry-edit-id="${siblingId}"] [data-testid="toggle-entry"]`).uncheck()
  await expect(page.locator(`[data-entry-id="${siblingId}"]`)).toHaveCount(0)

  // Back on the master, delete the target entry.
  await selectMaster(page)
  await page.click(`[data-entry-edit-id="${targetId}"] [data-testid="delete-entry"]`)
  await page.click('[data-testid="delete-entry-confirm"]')

  // The exported JSON must contain no trace of the deleted id — neither the pool
  // (already removed) nor any variant's materialised selection (the fix).
  const raw = await captureExport(page)
  expect(raw).not.toContain(targetId)
  // The sibling survives, so the delete really targeted the right entry.
  expect(raw).toContain(siblingId)
})

// ---------------------------------------------------------------------------
// AC 5 — bullet deletion goes through the same confirm flow.
// ---------------------------------------------------------------------------

test('AC5: deleting a bullet requires confirmation; cancel keeps it', async ({ page }) => {
  await open(page, 'a')

  await page.click('[data-entry-edit-id="ent_acme"] [data-bullet-edit-id="bul_acme_1"] [data-testid="delete-bullet"]')
  await expect(page.locator('[data-testid="delete-bullet-confirm"]')).toBeVisible()

  await page.click('[data-testid="delete-bullet-cancel"]')
  await expect(page.locator('[data-bullet-edit-id="bul_acme_1"]')).toHaveCount(1)
})
