import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–8 for issue #4. The section editor builds on the #3 pagination preview
 * and keeps the same `?fixture=` query param, so fixture `b` (default) is the
 * two-page workspace: `sectionOrder` = [summary, work, project, skill, oss]
 * with `oss` hidden, i.e. a visible sequence of [summary, work, project, skill].
 *
 * The preview anchors (`data-section-id`) live only in the paginated pages; the
 * left column uses a distinct `data-section-list-id` so the two never collide.
 */

const BUILT_IN_IDS = ['sec_summary', 'sec_work', 'sec_project', 'sec_skill'] as const
const HIDDEN_IDS = ['sec_oss'] as const

async function open(page: Page, fixture = 'b'): Promise<void> {
  await page.goto(`/?fixture=${fixture}`)
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="add-section"]')
}

async function previewSectionIds(page: Page): Promise<string[]> {
  return page.locator('[data-section-id]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-section-id') ?? ''),
  )
}

async function listSectionIds(page: Page): Promise<string[]> {
  return page.locator('[data-section-list-id]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-section-list-id') ?? ''),
  )
}

/** The left-column order restricted to the sections currently in the preview. */
async function visibleListOrder(page: Page): Promise<string[]> {
  const preview = await previewSectionIds(page)
  const list = await listSectionIds(page)
  return list.filter((id) => preview.includes(id))
}

async function dragRowTo(page: Page, fromId: string, toId: string): Promise<void> {
  const fromHandle = page.locator(`[data-section-list-id="${fromId}"] [data-testid="drag-handle"]`)
  const toRow = page.locator(`[data-section-list-id="${toId}"]`)
  const fromBox = await fromHandle.boundingBox()
  const toBox = await toRow.boundingBox()
  if (!fromBox || !toBox) throw new Error(`missing bounds for ${fromId} -> ${toId}`)

  const fromX = fromBox.x + fromBox.width / 2
  const fromY = fromBox.y + fromBox.height / 2
  const toY = toBox.y + toBox.height / 2

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  // Move a few pixels first to satisfy the PointerSensor activation distance.
  await page.mouse.move(fromX, fromY + 8, { steps: 4 })
  await page.mouse.move(fromX, toY, { steps: 12 })
  await page.mouse.up()
}

test('AC1: drag-reordering the list changes the preview section order', async ({ page }) => {
  await open(page)

  expect(await previewSectionIds(page)).toEqual(['sec_summary', 'sec_work', 'sec_project', 'sec_skill'])

  // Swap the adjacent `work` / `project` rows in the left column.
  await dragRowTo(page, 'sec_work', 'sec_project')

  expect(await previewSectionIds(page)).toEqual([
    'sec_summary',
    'sec_project',
    'sec_work',
    'sec_skill',
  ])
})

test('AC2: toggling visibility off removes the section, on restores its position', async ({ page }) => {
  await open(page)

  const toggle = page.locator('[data-section-list-id="sec_skill"] [data-testid="toggle-section"]')
  await toggle.click()
  expect(await previewSectionIds(page)).toEqual(['sec_summary', 'sec_work', 'sec_project'])
  // The hidden section stays in the left column so it can be re-shown.
  expect(await listSectionIds(page)).toContain('sec_skill')

  await toggle.click()
  expect(await previewSectionIds(page)).toEqual([
    'sec_summary',
    'sec_work',
    'sec_project',
    'sec_skill',
  ])
})

test('AC3: renaming a section updates the preview title', async ({ page }) => {
  await open(page)

  await page.locator('[data-section-list-id="sec_project"] [data-testid="rename-section"]').click()
  await page.fill('[data-testid="rename-input"]', '产品案例')
  await page.click('[data-testid="rename-submit"]')

  await expect(page.locator('[data-section-id="sec_project"]')).toHaveText('产品案例')
  await expect(page.locator('[data-section-list-id="sec_project"]')).toContainText('产品案例')
})

test('AC4: a new custom section appears in the list and preview with its own id', async ({ page }) => {
  await open(page)

  await page.click('[data-testid="add-section"]')
  await page.fill('[data-testid="add-section-name"]', '获奖')
  await page.click('[data-testid="add-section-submit"]')

  const before = [...BUILT_IN_IDS, ...HIDDEN_IDS]
  const listIds = await listSectionIds(page)
  const newId = listIds.find((id) => !before.includes(id))
  expect(newId).toBeTruthy()

  await expect(page.locator(`[data-section-list-id="${newId}"]`)).toContainText('获奖')
  await expect(page.locator(`[data-section-id="${newId}"]`)).toHaveText('获奖')
  // The preview's own anchor carries the same id.
  expect(await previewSectionIds(page)).toContain(newId)
})

test('AC5: deleting a custom section requires confirmation; cancel keeps it', async ({ page }) => {
  await open(page)

  await page.click('[data-testid="add-section"]')
  await page.fill('[data-testid="add-section-name"]', '临时区块')
  await page.click('[data-testid="add-section-submit"]')

  const newId = (await listSectionIds(page)).find((id) => ![...BUILT_IN_IDS, ...HIDDEN_IDS].includes(id))
  expect(newId).toBeTruthy()
  const deleteButton = page.locator(`[data-section-list-id="${newId}"] [data-testid="delete-section"]`)

  await deleteButton.click()
  await expect(page.locator('[data-testid="delete-confirm"]')).toBeVisible()
  await page.click('[data-testid="delete-cancel"]')

  // Cancel keeps the section in both the list and the preview.
  await expect(page.locator(`[data-section-list-id="${newId}"]`)).toBeVisible()
  await expect(page.locator(`[data-section-id="${newId}"]`)).toBeVisible()

  await deleteButton.click()
  await page.click('[data-testid="delete-confirm"]')

  await expect(page.locator(`[data-section-list-id="${newId}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-section-id="${newId}"]`)).toHaveCount(0)
})

test('AC6: built-in section rows have no delete button', async ({ page }) => {
  await open(page)

  for (const id of BUILT_IN_IDS) {
    await expect(page.locator(`[data-section-list-id="${id}"] [data-testid="delete-section"]`)).toHaveCount(0)
  }
  // The one removable section in the fixture does show one.
  await expect(page.locator('[data-section-list-id="sec_oss"] [data-testid="delete-section"]')).toHaveCount(1)
})

test('AC7: hovering a section shows the toolbar; moving up matches the list order', async ({ page }) => {
  await open(page)

  await page.hover('[data-section-id="sec_work"]')
  const toolbar = page.locator('[data-testid="section-toolbar"]')
  await expect(toolbar).toBeVisible()
  await expect(page.locator('[data-testid="toolbar-up"]')).toBeVisible()

  await page.click('[data-testid="toolbar-up"]')

  expect(await previewSectionIds(page)).toEqual([
    'sec_work',
    'sec_summary',
    'sec_project',
    'sec_skill',
  ])
  // The preview order is the left-column order restricted to visible sections.
  expect(await visibleListOrder(page)).toEqual([
    'sec_work',
    'sec_summary',
    'sec_project',
    'sec_skill',
  ])
})

test('AC8: the first section toolbar has no "up" button, the last has no "down"', async ({ page }) => {
  await open(page)

  await page.hover('[data-section-id="sec_summary"]')
  await expect(page.locator('[data-testid="section-toolbar"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar-up"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="toolbar-down"]')).toBeVisible()

  await page.hover('[data-section-id="sec_skill"]')
  await expect(page.locator('[data-testid="section-toolbar"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar-down"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="toolbar-up"]')).toBeVisible()
})
