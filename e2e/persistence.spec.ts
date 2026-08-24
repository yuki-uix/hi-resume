import { expect, test, type Page } from '@playwright/test'

import { WORKSPACE_DB_NAME, WORKSPACE_KEY, WORKSPACE_TABLE } from '../src/persistence/constants'

/**
 * AC 1–6 for issue #6. Every test here drives the app's *default assembly
 * path* — no `?fixture=`, no injected storage — so the store really is seeded
 * from IndexedDB and edits really are written back through Dexie. Each Playwright
 * test gets a fresh browser context, hence a fresh (empty) IndexedDB, which is
 * what "first launch" means for AC 4.
 *
 * The DB name / table / key are imported from `src/persistence/constants.ts`
 * (the single source of truth) rather than re-typed, so a rename cannot leave
 * these tests silently poking a dead database.
 */

// Content strings that only exist in the dev/e2e fixture. AC 4 asserts none of
// these appear in the empty workspace's preview — a fresh install must never
// present the fixture's "Ada Chen" resume as the user's own. (Section *titles*
// like 工作经历 are shared skeleton labels, not fixture content, so they are
// deliberately absent from this list.)
const FIXTURE_STRINGS = [
  'Ada Chen',
  'Senior Product Engineer',
  'Acme Corp',
  'Globex',
  'Initech',
  'markdown-lint',
  '技术栈',
  '开源贡献',
  'ada@example.com',
  '+86 138 0000 0000',
  'Product engineer with eight years building tools people use daily.',
  'TypeScript, React, Node.js, PostgreSQL',
]

/** Read the stored workspace record (the full `{ id, workspace }` row) via IndexedDB. */
async function readRecord(page: Page): Promise<{ id: string; workspace: Record<string, unknown> } | undefined> {
  return page.evaluate(
    async ({ name, table, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      try {
        return await new Promise<{ id: string; workspace: Record<string, unknown> } | undefined>((resolve, reject) => {
          const tx = db.transaction(table, 'readonly')
          const store = tx.objectStore(table)
          const req = store.get(key)
          req.onsuccess = () => resolve(req.result as { id: string; workspace: Record<string, unknown> } | undefined)
          req.onerror = () => reject(req.error)
        })
      } finally {
        db.close()
      }
    },
    { name: WORKSPACE_DB_NAME, table: WORKSPACE_TABLE, key: WORKSPACE_KEY },
  )
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
}

test('AC1: an edit autosaves and survives a reload byte-for-byte', async ({ page }) => {
  await openEditor(page)

  await page.fill('[data-testid="basics-name"]', 'Alice Wu')
  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'Staff Engineer')

  // Wait out the debounce by waiting for the autosave status line, not a sleep.
  await expect(page.locator('[data-testid="last-saved"]')).toContainText('最近保存')

  await page.reload()
  await openEditor(page)

  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Alice Wu')
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="entry-title"]')).toHaveValue(
    'Staff Engineer',
  )
  // The preview agrees with the form.
  await expect(page.locator('.resume-name')).toHaveText('Alice Wu')
  await expect(page.locator('[data-entry-id] .resume-entry-title')).toHaveText('Staff Engineer')
})

test('AC2: edits inside the debounce window are flushed on beforeunload', async ({ page, context }) => {
  await openEditor(page)

  await page.fill('[data-testid="basics-name"]', 'Bob Quick')

  // Close *without* waiting out the debounce window. runBeforeUnload makes
  // Playwright run our beforeunload (and pagehide) flush handlers.
  await page.close({ runBeforeUnload: true })

  const reopened = await context.newPage()
  await openEditor(reopened)

  await expect(reopened.locator('[data-testid="basics-name"]')).toHaveValue('Bob Quick')
})

test('AC3: a newer schemaVersion shows a clear error and does not overwrite data', async ({ page, context }) => {
  await openEditor(page)

  // First launch already persisted the empty workspace, so a record exists to mutate.
  // Simulate the user bumping the stored version while the app is closed: mutate
  // in place. `page` stays open but idle — it performs no further writes — so
  // nothing overwrites the bump before a second instance reads it.
  await page.evaluate(
    async ({ name, table, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(table, 'readwrite')
          const store = tx.objectStore(table)
          const getReq = store.get(key)
          getReq.onsuccess = () => {
            const record = getReq.result as { id: string; workspace: { schemaVersion: number } }
            record.workspace.schemaVersion = 999
            store.put(record)
          }
          getReq.onerror = () => reject(getReq.error)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      } finally {
        db.close()
      }
    },
    { name: WORKSPACE_DB_NAME, table: WORKSPACE_TABLE, key: WORKSPACE_KEY },
  )

  // A fresh app instance must refuse to load the newer version.
  const reopened = await context.newPage()
  await reopened.goto('/')
  await expect(reopened.locator('[data-testid="storage-error"]')).toBeVisible()
  await expect(reopened.locator('[data-testid="storage-error"]')).toContainText('999')

  // The load path must not have overwritten the refused record.
  const record = await readRecord(reopened)
  expect(record?.workspace.schemaVersion).toBe(999)
})

test('AC3b: a structurally corrupt record shows a readable error, not a white screen (#27)', async ({
  page,
  context,
}) => {
  await openEditor(page)

  // Corrupt the stored row in place: `pool.entries` must be a record, not an array.
  await page.evaluate(
    async ({ name, table, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(table, 'readwrite')
          const store = tx.objectStore(table)
          const getReq = store.get(key)
          getReq.onsuccess = () => {
            const record = getReq.result as { id: string; workspace: { pool: { entries: unknown } } }
            record.workspace.pool.entries = []
            store.put(record)
          }
          getReq.onerror = () => reject(getReq.error)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      } finally {
        db.close()
      }
    },
    { name: WORKSPACE_DB_NAME, table: WORKSPACE_TABLE, key: WORKSPACE_KEY },
  )

  // Premise first: the corruption really landed in IndexedDB. If the write above
  // had silently failed, `loadWorkspace` would see an empty DB and show the empty
  // editor — a different outcome — so we must confirm the record is present and
  // corrupt before asserting the load error.
  const corruptRecord = await readRecord(page)
  expect(corruptRecord?.id).toBe(WORKSPACE_KEY)
  expect(Array.isArray((corruptRecord?.workspace.pool as { entries: unknown }).entries)).toBe(true)

  // A fresh instance must refuse the corrupt row with a readable Zod-path error.
  const reopened = await context.newPage()
  await reopened.goto('/')
  await expect(reopened.locator('[data-testid="storage-error"]')).toBeVisible()
  await expect(reopened.locator('[data-testid="storage-error"]')).toContainText('pool.entries')
})

test('AC4: first launch creates an empty workspace with no fixture content', async ({ page }) => {
  await openEditor(page)

  const text = await page.locator('body').textContent()
  for (const fixtureString of FIXTURE_STRINGS) {
    expect(text).not.toContain(fixtureString)
  }

  // The block skeleton is present...
  await expect(page.locator('[data-section-id="sec_work"]')).toBeVisible()
  await expect(page.locator('[data-section-id="sec_education"]')).toBeVisible()
  await expect(page.locator('[data-section-id="sec_language"]')).toBeVisible()

  // ...but there is zero example content.
  expect(await page.locator('[data-entry-id]').count()).toBe(0)
  expect(await page.locator('[data-bullet-id]').count()).toBe(0)
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('')
})

test('AC5: a new entry typed into the empty workspace survives autosave and reload', async ({ page }) => {
  await openEditor(page)

  await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', 'First Role')

  await expect(page.locator('[data-testid="last-saved"]')).toContainText('最近保存')

  await page.reload()
  await openEditor(page)

  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="entry-title"]')).toHaveValue('First Role')
  await expect(page.locator('[data-entry-id] .resume-entry-title')).toHaveText('First Role')
})

test('AC6: reloaded content is read from IndexedDB, not memory or a fixture fallback', async ({ page }) => {
  await openEditor(page)

  await page.fill('[data-testid="basics-name"]', 'Carol Indexed')
  await expect(page.locator('[data-testid="last-saved"]')).toContainText('最近保存')

  // The persisted row really holds the edit, and its shape matches the
  // Workspace schema (the external "DevTools → IndexedDB" fact, checked here).
  const record = await readRecord(page)
  expect(record?.id).toBe(WORKSPACE_KEY)
  expect(record?.workspace).toMatchObject({
    schemaVersion: expect.any(Number),
    pool: expect.objectContaining({
      sections: expect.any(Object),
      entries: expect.any(Object),
      bullets: expect.any(Object),
      basics: expect.any(Object),
    }),
    master: expect.any(Object),
    variants: expect.any(Array),
    settings: expect.any(Object),
  })
  expect((record?.workspace.pool as { basics: { name: string } }).basics.name).toBe('Carol Indexed')

  // Reload wipes memory; the only place "Carol Indexed" can come from is IndexedDB.
  await page.reload()
  await openEditor(page)
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Carol Indexed')
})
