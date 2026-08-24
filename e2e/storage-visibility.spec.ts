import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

/**
 * AC 1–4 for issue #44 (storage visibility). Every test drives the *default
 * assembly path* (`/`, no `?fixture=`), so the status line reads the real store
 * and the real `navigator.storage.persist()` — unless a test overrides it.
 *
 * The `persist()` override is the one thing these tests must not fake silently:
 * before asserting any wording, each AC4 test reads the API back inside the page
 * and pins its return value. If the `addInitScript` override had not landed, the
 * read-back would fail first, instead of both branches running the same path.
 */

async function openEditor(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

/** Open the editor with `navigator.storage.persist()` pinned to a fixed outcome. */
async function openWithPersist(page: Page, granted: boolean): Promise<void> {
  await page.addInitScript((value) => {
    navigator.storage.persist = () => Promise.resolve(value)
  }, granted)
  await openEditor(page)
}

test('AC1: the storage status is visible on first launch and names the browser + loss risk', async ({ page }) => {
  await openEditor(page)

  const status = page.locator('[data-testid="storage-status"]')
  await expect(status).toBeVisible()
  await expect(status).toContainText('浏览器')
  // "清除浏览器站点数据" only appears once persist() has resolved (either
  // branch), so this assertion also pins that the startup request settled.
  await expect(status).toContainText('清除浏览器站点数据')
})

test('AC2: editing changes the last-saved time from "尚未保存" to a real timestamp', async ({ page }) => {
  await openEditor(page)

  const saved = page.locator('[data-testid="last-saved"]')
  await expect(saved).toContainText('尚未保存')

  await page.fill('[data-testid="basics-name"]', 'Alice Wu')
  await expect(saved).toContainText('最近保存')
  await expect(saved).toHaveText(/最近保存 \d{2}:\d{2}:\d{2}/)
})

test('AC3: the status area exposes a working JSON export entry', async ({ page }) => {
  await openEditor(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="status-export-json"]'),
  ])
  const path = await download.path()
  if (!path) throw new Error('download produced no file path')

  const text = await readFile(path, 'utf8')
  expect(() => JSON.parse(text)).not.toThrow()
})

test('AC4a: persist() granted shows the reduced-risk wording', async ({ page }) => {
  await openWithPersist(page, true)

  // Precondition: the override is live, not silently ignored by the browser.
  const readback = await page.evaluate(() => navigator.storage.persist())
  expect(readback).toBe(true)

  const risk = page.locator('[data-testid="storage-risk"]')
  await expect(risk).toContainText('已获得持久化存储权限')
  await expect(risk).toContainText('清除浏览器站点数据')
  await expect(risk).not.toContainText('未获得持久化存储权限')
})

test('AC4b: persist() denied shows the eviction-risk wording', async ({ page }) => {
  await openWithPersist(page, false)

  // Precondition: the override is live, not silently ignored by the browser.
  const readback = await page.evaluate(() => navigator.storage.persist())
  expect(readback).toBe(false)

  const risk = page.locator('[data-testid="storage-risk"]')
  await expect(risk).toContainText('未获得持久化存储权限')
  await expect(risk).toContainText('磁盘空间不足')
  await expect(risk).not.toContainText('已获得持久化存储权限')
})
