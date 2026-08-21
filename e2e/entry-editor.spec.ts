import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–8 for issue #5 (entries & bullets). The editor keeps the `?fixture=`
 * query param from #3/#4, so these run on fixture `a` — the base workspace with
 * three work entries, two project entries and one skill entry, which keeps the
 * expected order short enough to assert by hand.
 *
 * Anchor convention: the paginated preview owns `data-entry-id` /
 * `data-bullet-id`; the middle-column form uses `data-entry-edit-id` /
 * `data-bullet-edit-id` so the two can never collide.
 */

async function open(page: Page, fixture = 'a'): Promise<void> {
  await page.goto(`/?fixture=${fixture}`)
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

async function previewEntryIds(page: Page): Promise<string[]> {
  return page.locator('[data-entry-id]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-entry-id') ?? ''),
  )
}

async function previewBulletIds(page: Page, entryId: string): Promise<string[]> {
  return page.locator(`[data-entry-id="${entryId}"] [data-bullet-id]`).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-bullet-id') ?? ''),
  )
}

async function dragTo(page: Page, handleSelector: string, targetSelector: string): Promise<void> {
  const fromHandle = page.locator(handleSelector)
  const toRow = page.locator(targetSelector)

  // Measure first: `boundingBox` reports the laid-out box even when the row is
  // scrolled out of the editor's clip, so the distance stays accurate.
  const fromBox = await fromHandle.boundingBox()
  const toBox = await toRow.boundingBox()
  if (!fromBox || !toBox) throw new Error(`missing bounds for ${handleSelector} -> ${targetSelector}`)

  const deltaY = toBox.y + toBox.height / 2 - (fromBox.y + fromBox.height / 2)

  // Only the source must actually be hit-testable: the editor column scrolls
  // (`.entries-editor` is `overflow-y: auto`), and a handle below the fold would
  // swallow the pointerdown into `<html>`.
  await fromHandle.scrollIntoViewIfNeeded()
  const visible = await fromHandle.boundingBox()
  if (!visible) throw new Error(`handle not visible after scroll: ${handleSelector}`)

  const fromX = visible.x + visible.width / 2
  const fromY = visible.y + visible.height / 2
  const toY = fromY + deltaY

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  // Move a few pixels first to satisfy the PointerSensor activation distance.
  await page.mouse.move(fromX, fromY + 8, { steps: 4 })
  await page.mouse.move(fromX, toY, { steps: 12 })
  await page.mouse.up()
}

test('AC1: a new entry appears at the end of its section with a new id', async ({ page }) => {
  await open(page)

  const before = await previewEntryIds(page)
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')

  const after = await previewEntryIds(page)
  expect(after.length).toBe(before.length + 1)

  const newId = after.find((id) => !before.includes(id))
  expect(newId).toBeTruthy()
  // The end of the work section is right before project's first entry.
  expect(after.indexOf(newId!)).toBe(after.indexOf('ent_atlas') - 1)
})

test('AC2: editing an entry title updates the preview title in place', async ({ page }) => {
  await open(page)

  const titleInput = page.locator('[data-entry-edit-id="ent_acme"] [data-testid="entry-title"]')
  await titleInput.fill('Staff Platform Engineer')

  await expect(page.locator('[data-entry-id="ent_acme"] .resume-entry-title')).toHaveText(
    'Staff Platform Engineer',
  )
})

test('AC3: drag-reordering entries changes the preview order', async ({ page }) => {
  await open(page)

  expect(await previewEntryIds(page)).toEqual([
    'ent_acme',
    'ent_globex',
    'ent_initech',
    'ent_atlas',
    'ent_beacon',
    'ent_skills',
  ])

  // Move `acme` down onto `globex`'s handle — one full row down, so the active
  // row's centre lands on `globex` and resolves to it (not the row below).
  await dragTo(
    page,
    '[data-entry-edit-id="ent_acme"] [data-testid="drag-entry"]',
    '[data-entry-edit-id="ent_globex"] [data-testid="drag-entry"]',
  )

  expect(await previewEntryIds(page)).toEqual([
    'ent_globex',
    'ent_acme',
    'ent_initech',
    'ent_atlas',
    'ent_beacon',
    'ent_skills',
  ])
})

test('AC4: typing 20 chars into a bullet keeps every char and focus', async ({ page }) => {
  await open(page)

  const input = page.locator(
    '[data-entry-edit-id="ent_acme"] [data-bullet-edit-id="bul_acme_1"] [data-testid="bullet-text"]',
  )
  await input.click()
  await input.fill('')
  await page.keyboard.type('abcdefghijklmnopqrst')

  // All 20 chars land, in order — none swallowed, none reordered.
  await expect(input).toHaveValue('abcdefghijklmnopqrst')
  // The preview re-render never stole focus from the input.
  await expect(input).toBeFocused()
})

test('AC5: deleting the middle entry leaves the rest in order', async ({ page }) => {
  await open(page)

  await page.click('[data-entry-edit-id="ent_globex"] [data-testid="delete-entry"]')
  await page.click('[data-testid="delete-entry-confirm"]')

  expect(await previewEntryIds(page)).toEqual([
    'ent_acme',
    'ent_initech',
    'ent_atlas',
    'ent_beacon',
    'ent_skills',
  ])
})

test('AC6: the delete confirmation shows the entry title', async ({ page }) => {
  await open(page)

  await page.click('[data-entry-edit-id="ent_globex"] [data-testid="delete-entry"]')
  await expect(page.locator('[data-testid="delete-entry-title"]')).toContainText('Product Engineer')

  // Cancel keeps the entry.
  await page.click('[data-testid="delete-entry-cancel"]')
  await expect(page.locator('[data-entry-id="ent_globex"]')).toHaveCount(1)
})

test('AC7: a new bullet appears at the end of its entry with a new id', async ({ page }) => {
  await open(page)

  const before = await previewBulletIds(page, 'ent_acme')
  await page.click('[data-entry-edit-id="ent_acme"] [data-testid="add-bullet"]')

  const after = await previewBulletIds(page, 'ent_acme')
  expect(after.length).toBe(before.length + 1)

  const newId = after.find((id) => !before.includes(id))
  expect(newId).toBeTruthy()
  expect(after.at(-1)).toBe(newId)
})

test('AC8: drag-reordering bullets changes the preview order', async ({ page }) => {
  await open(page)

  // `ent_acme` selects its bullets out of order: [acme3, acme1].
  expect(await previewBulletIds(page, 'ent_acme')).toEqual(['bul_acme_3', 'bul_acme_1'])

  await dragTo(
    page,
    '[data-entry-edit-id="ent_acme"] [data-bullet-edit-id="bul_acme_3"] [data-testid="drag-bullet"]',
    '[data-entry-edit-id="ent_acme"] [data-bullet-edit-id="bul_acme_1"]',
  )

  expect(await previewBulletIds(page, 'ent_acme')).toEqual(['bul_acme_1', 'bul_acme_3'])
})
