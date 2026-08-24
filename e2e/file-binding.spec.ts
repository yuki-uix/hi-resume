import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { parseWorkspaceFile } from '../src/features/export/json'
import { WORKSPACE_DB_NAME, WORKSPACE_KEY, WORKSPACE_TABLE } from '../src/persistence/constants'

/**
 * Acceptance for #45 — binding the workspace to a file the user owns.
 *
 * ## Why these tests use OPFS, and what that does and does not fake
 *
 * `showSaveFilePicker()` opens an OS dialog Playwright cannot drive. But
 * `navigator.storage.getDirectory()` hands back a real `FileSystemFileHandle` —
 * the same interface, the same `createWritable`/`getFile`, the same browser code
 * underneath. So every test here binds with a genuine handle and exercises the
 * real write path; only the dialog that would have produced the handle is
 * skipped, via the dev-only `__hiResumeBindFile` seam, which calls exactly the
 * function the picker button calls.
 *
 * Nothing here is a mock object standing in for a handle. The one place a real
 * handle is doctored is the permission test, which overrides `queryPermission`
 * on a real instance — OPFS always answers "granted", so a refusal cannot be
 * produced any other way — and that test asserts the override is live before it
 * asserts anything else.
 *
 * In the recovery test, OPFS stands in for a file on the user's disk. Only
 * IndexedDB is cleared (via CDP `Storage.clearDataForOrigin`, the same machinery
 * behind "clear site data"), never the file — which is the whole point: the real
 * file lives outside anything the browser wipes.
 */

const ORIGIN = 'http://localhost:5173'

type WorkspaceShape = { pool: { basics: { name: string } } } & Record<string, unknown>

async function openEditor(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
  await page.waitForFunction(
    () => typeof (window as { __hiResumeBindFile?: unknown }).__hiResumeBindFile === 'function',
  )
}

/** Create (or reuse) a real OPFS file and bind the app to it. */
async function bindToOpfs(page: Page, path: string): Promise<void> {
  await page.evaluate(async (filePath) => {
    const handle = await resolveOpfs(filePath, true)
    const bind = (window as { __hiResumeBindFile?: (h: FileSystemFileHandle) => Promise<void> })
      .__hiResumeBindFile
    if (typeof bind !== 'function') throw new Error('bind hook is missing')
    await bind(handle)
  }, path)
}

/**
 * Installed before every navigation: resolves a `dir/file.json` path inside OPFS
 * to a real handle. Kept in the page (not the Node side) because handles cannot
 * cross the Playwright boundary.
 */
async function installOpfsHelpers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).resolveOpfs = async (
      path: string,
      create: boolean,
    ): Promise<FileSystemFileHandle> => {
      const parts = path.split('/')
      const fileName = parts.pop()
      if (fileName === undefined) throw new Error(`bad path: ${path}`)
      let dir = await navigator.storage.getDirectory()
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create })
      return dir.getFileHandle(fileName, { create })
    }
  })
}

declare function resolveOpfs(path: string, create: boolean): Promise<FileSystemFileHandle>

async function readOpfs(page: Page, path: string): Promise<string> {
  return page.evaluate(async (p) => (await (await resolveOpfs(p, false)).getFile()).text(), path)
}

async function opfsMtime(page: Page, path: string): Promise<number> {
  return page.evaluate(async (p) => (await (await resolveOpfs(p, false)).getFile()).lastModified, path)
}

async function writeOpfs(page: Page, path: string, text: string): Promise<void> {
  await page.evaluate(
    async ({ p, t }) => {
      const handle = await resolveOpfs(p, true)
      const writable = await handle.createWritable()
      await writable.write(t)
      await writable.close()
    },
    { p: path, t: text },
  )
}

/** The workspace row as IndexedDB holds it, or undefined when there is none. */
async function readCachedWorkspace(page: Page): Promise<WorkspaceShape | undefined> {
  return page.evaluate(
    async ({ name, table, key }) => {
      const databases = await indexedDB.databases()
      if (!databases.some((d) => d.name === name)) return undefined
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      try {
        if (!db.objectStoreNames.contains(table)) return undefined
        return await new Promise<WorkspaceShape | undefined>((resolve, reject) => {
          const tx = db.transaction(table, 'readonly')
          const req = tx.objectStore(table).get(key)
          req.onsuccess = () => resolve((req.result as { workspace: WorkspaceShape } | undefined)?.workspace)
          req.onerror = () => reject(req.error)
        })
      } finally {
        db.close()
      }
    },
    { name: WORKSPACE_DB_NAME, table: WORKSPACE_TABLE, key: WORKSPACE_KEY },
  )
}

async function listDatabases(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))
}

/** The browser's own "clear site data" for IndexedDB, and nothing else. */
async function clearIndexedDb(context: BrowserContext, page: Page): Promise<void> {
  const client = await context.newCDPSession(page)
  await client.send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'indexeddb' })
  await client.detach()
}

/** Type a name and an entry, then wait for the autosave to land. */
async function typeContent(page: Page, name: string, role: string): Promise<void> {
  await page.fill('[data-testid="basics-name"]', name)
  const existing = await page.locator('[data-section-edit-id="sec_work"] [data-testid="entry-title"]').count()
  if (existing === 0) {
    await page.click('[data-section-edit-id="sec_work"] [data-testid="add-entry"]')
  }
  await page.fill('[data-section-edit-id="sec_work"] [data-testid="entry-title"]', role)
  await expect(page.locator('[data-testid="last-saved"]')).toContainText('最近保存')
}

test.beforeEach(async ({ page }) => {
  await installOpfsHelpers(page)
})

test('AC1: an autosave after binding writes the edit into the file, as a parseable workspace', async ({
  page,
}) => {
  await openEditor(page)
  await bindToOpfs(page, 'ac1.json')

  await expect(page.locator('[data-testid="bound-file"]')).toContainText('ac1.json')

  await typeContent(page, 'Alice Wu', 'Staff Engineer')

  const text = await readOpfs(page, 'ac1.json')
  expect(text).toContain('Alice Wu')
  expect(text).toContain('Staff Engineer')

  // The file is not merely JSON-shaped: it goes through the real import path,
  // so a bound file and an exported backup are provably the same format.
  const parsed = parseWorkspaceFile(text)
  expect(parsed.ok ? null : parsed.errors).toBeNull()
  if (!parsed.ok) throw new Error('unreachable')
  expect(parsed.workspace.pool.basics.name).toBe('Alice Wu')
  expect(Object.values(parsed.workspace.pool.entries).map((entry) => entry.title)).toContain(
    'Staff Engineer',
  )
})

test('AC2: the workspace survives deleting IndexedDB entirely and rebinding the same file', async ({
  page,
  context,
}) => {
  await openEditor(page)
  await bindToOpfs(page, 'ac2.json')
  await typeContent(page, 'Alice Wu', 'Staff Engineer')

  // --- Precondition: the edit really is in both copies before anything is wiped.
  const fileBefore = await readOpfs(page, 'ac2.json')
  expect(fileBefore).toContain('Alice Wu')
  const cachedBefore = await readCachedWorkspace(page)
  expect(cachedBefore?.pool.basics.name).toBe('Alice Wu')
  expect(await listDatabases(page)).toContain(WORKSPACE_DB_NAME)

  // --- The event this whole issue exists for: the browser's data is cleared.
  await clearIndexedDb(context, page)

  // Assert the wipe actually happened. Without this, a clear that silently did
  // nothing would leave the recovery assertions passing for the wrong reason —
  // they would be reading the data that was never deleted.
  expect(await listDatabases(page)).not.toContain(WORKSPACE_DB_NAME)
  expect(await readCachedWorkspace(page)).toBeUndefined()

  await page.reload()
  await openEditor(page)

  // The app really did lose everything: a blank first-launch workspace, no
  // binding, nothing saved.
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('')
  expect(await page.locator('[data-entry-id]').count()).toBe(0)
  await expect(page.locator('[data-testid="bound-file"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="storage-status"]')).toContainText('数据仅存于此浏览器')

  // --- Recovery: the user picks the same file again.
  await bindToOpfs(page, 'ac2.json')

  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Alice Wu')
  await expect(page.locator('[data-section-edit-id="sec_work"] [data-testid="entry-title"]')).toHaveValue(
    'Staff Engineer',
  )
  await expect(page.locator('.resume-name')).toHaveText('Alice Wu')
  await expect(page.locator('[data-testid="bound-file"]')).toContainText('ac2.json')

  // Byte-for-byte: what the app restored equals what was in the file, and the
  // file itself was never rewritten by the recovery.
  const restored = await readCachedWorkspace(page)
  const expected = parseWorkspaceFile(fileBefore)
  if (!expected.ok) throw new Error(`the pre-wipe file did not parse: ${expected.errors.join(' ')}`)
  expect(restored).toEqual(expected.workspace)
  expect(await readOpfs(page, 'ac2.json')).toBe(fileBefore)
})

test('AC3: a file changed elsewhere wins over the cached copy at startup', async ({ page }) => {
  await openEditor(page)
  await bindToOpfs(page, 'ac3.json')
  await typeContent(page, 'Alice Wu', 'Staff Engineer')

  // Someone edits the file outside the app (another machine, an editor, a sync
  // client). Built from the file's own contents so it stays a valid workspace.
  const original = await readOpfs(page, 'ac3.json')
  const edited = original.replace('Alice Wu', 'External Editor')
  expect(edited).not.toBe(original)
  await writeOpfs(page, 'ac3.json', edited)

  // Precondition: the two copies genuinely disagree, so the reload below is a
  // real choice and not both sides happening to match.
  expect(await readOpfs(page, 'ac3.json')).toContain('External Editor')
  expect((await readCachedWorkspace(page))?.pool.basics.name).toBe('Alice Wu')

  await page.reload()
  await openEditor(page)

  // The file is the source of truth.
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('External Editor')
  await expect(page.locator('[data-testid="bound-file"]')).toContainText('ac3.json')
  // ...and the cache was brought back in line with it.
  expect((await readCachedWorkspace(page))?.pool.basics.name).toBe('External Editor')
})

test('AC5b: a file write that really fails is shown, and does not report a successful save', async ({
  page,
}) => {
  await openEditor(page)
  await bindToOpfs(page, 'boom/ac5b.json')
  await typeContent(page, 'Alice Wu', 'Staff Engineer')
  expect(await readOpfs(page, 'boom/ac5b.json')).toContain('Alice Wu')

  // Delete the directory holding the file. This is a genuine browser failure —
  // no stubbing: the handle survives, and `createWritable()` on it throws
  // NotFoundError, exactly as it would if the user moved or deleted the file.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('boom', { recursive: true })
  })

  await page.fill('[data-testid="basics-name"]', 'Bob After Delete')

  const saved = page.locator('[data-testid="last-saved"]')
  await expect(saved).toContainText('写入文件失败')
  await expect(saved).toContainText('NotFoundError')
  // The critical half: it must not simultaneously claim a save happened.
  await expect(saved).not.toContainText('最近保存')
  // ...and it says which copy took the edit, so the user knows what is stale.
  await expect(saved).toContainText('这次编辑只写入了此浏览器')

  // The edit did reach IndexedDB — a broken file must not cost the working copy.
  await expect
    .poll(async () => (await readCachedWorkspace(page))?.pool.basics.name)
    .toBe('Bob After Delete')
})

/**
 * Drive the app into the state the conflict prompt exists for, using only real
 * failures: edits that the file never received, and a file that later comes back.
 *
 * The order matters. The file must still be unwritable when the page goes away,
 * because the unload flush is a genuine last-chance retry — if the file were
 * already back, that retry would succeed and there would be no conflict left to
 * show. Which is the honest outcome: a conflict needs the write to have stayed
 * broken until the session ended.
 */
async function stageUnsyncedEdit(page: Page, dir: string, path: string): Promise<string> {
  await openEditor(page)
  await bindToOpfs(page, path)
  await typeContent(page, 'Alice Wu', 'Staff Engineer')

  const fileV1 = await readOpfs(page, path)
  expect(fileV1).toContain('Alice Wu')

  // Orphan the handle by deleting the directory holding it — a real browser
  // failure, no stubs.
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(name, { recursive: true })
  }, dir)

  await page.fill('[data-testid="basics-name"]', 'Bob Unsynced')
  await expect(page.locator('[data-testid="last-saved"]')).toContainText('写入文件失败')

  // Reload while the file is still gone: the unload flush retries and fails
  // again, so the cache stays recorded as holding edits the file never got.
  await page.reload()
  await openEditor(page)
  await expect(page.locator('[data-testid="binding-issue"]')).toContainText('无法读取已绑定的文件')
  await expect(page.locator('[data-testid="bound-file"]')).toHaveCount(0)

  // The user restores the file — same path, its old contents. The handle revives.
  await writeOpfs(page, path, fileV1)

  // Precondition: the two sides really do differ before the startup below.
  expect(await readOpfs(page, path)).toContain('Alice Wu')
  expect((await readCachedWorkspace(page))?.pool.basics.name).toBe('Bob Unsynced')

  return fileV1
}

test('AC4: a cache ahead of the file prompts, shows both times, and writes neither side', async ({
  page,
}) => {
  const fileV1 = await stageUnsyncedEdit(page, 'conflict', 'conflict/ac4.json')

  await page.reload()
  await page.waitForSelector('[data-testid="conflict-choice"]')

  // Both timestamps are on screen, each a real date-time.
  const stamp = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
  await expect(page.locator('[data-testid="conflict-file-time"]')).toHaveText(stamp)
  await expect(page.locator('[data-testid="conflict-cache-time"]')).toHaveText(stamp)
  await expect(page.locator('[data-testid="conflict-body"]')).toContainText(
    '在你做出选择之前，两边都不会被写入',
  )

  // Nothing may be written while the prompt is up. The editor is not even
  // mounted, so there is no autosave controller that could fire...
  await expect(page.locator('[data-testid="entries-editor"]')).toHaveCount(0)
  // ...and after well past the autosave debounce, both sides are untouched.
  const mtimeWhilePrompting = await opfsMtime(page, 'conflict/ac4.json')
  await page.waitForTimeout(1500)
  expect(await readOpfs(page, 'conflict/ac4.json')).toBe(fileV1)
  expect(await opfsMtime(page, 'conflict/ac4.json')).toBe(mtimeWhilePrompting)
  expect((await readCachedWorkspace(page))?.pool.basics.name).toBe('Bob Unsynced')

  // Choosing the file discards the cached edit — the user's explicit call.
  await page.click('[data-testid="conflict-use-file"]')
  await page.waitForSelector('[data-testid="entries-editor"]')
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Alice Wu')
  expect((await readCachedWorkspace(page))?.pool.basics.name).toBe('Alice Wu')
})

test('AC4b: choosing the cached copy writes it to the file', async ({ page }) => {
  await stageUnsyncedEdit(page, 'keep', 'keep/ac4b.json')

  await page.reload()
  await page.waitForSelector('[data-testid="conflict-choice"]')

  await page.click('[data-testid="conflict-use-cache"]')
  await page.waitForSelector('[data-testid="entries-editor"]')

  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Bob Unsynced')
  // The file received the cached copy, so the two agree again...
  await expect.poll(async () => await readOpfs(page, 'keep/ac4b.json')).toContain('Bob Unsynced')
  // ...and a further edit syncs normally rather than re-prompting on reload.
  await page.fill('[data-testid="basics-name"]', 'Bob Synced')
  await expect(page.locator('[data-testid="last-saved"]')).toContainText('最近保存')
  await page.reload()
  await openEditor(page)
  await expect(page.locator('[data-testid="conflict-choice"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="basics-name"]')).toHaveValue('Bob Synced')
})

test('AC5: a refused permission is reported, and the status does not claim to be bound', async ({
  page,
}) => {
  await openEditor(page)

  // A real OPFS handle with only its permission answers overridden. OPFS always
  // grants, so a refusal cannot be produced otherwise; everything else about the
  // handle — and the entire code path under test — is untouched.
  const permissionBefore = await page.evaluate(async () => {
    const handle = await resolveOpfs('ac5.json', true)
    const doctored = handle as FileSystemFileHandle & {
      queryPermission: () => Promise<string>
      requestPermission: () => Promise<string>
    }
    doctored.queryPermission = async () => 'denied'
    doctored.requestPermission = async () => 'denied'
    ;(window as unknown as Record<string, unknown>).deniedHandle = handle
    return doctored.queryPermission()
  })
  // Precondition: the override is live, so the assertions below are about the
  // refusal path and not about a handle that quietly stayed granted.
  expect(permissionBefore).toBe('denied')

  await page.evaluate(async () => {
    const bind = (window as { __hiResumeBindFile?: (h: FileSystemFileHandle) => Promise<void> })
      .__hiResumeBindFile
    const handle = (window as unknown as { deniedHandle: FileSystemFileHandle }).deniedHandle
    await bind?.(handle)
  })

  const issue = page.locator('[data-testid="binding-issue"]')
  await expect(issue).toBeVisible()
  await expect(issue).toContainText('未获得该文件的写入权限')
  await expect(issue).toContainText('未绑定文件')

  // Not bound: no file line, and the #44 browser-only wording is still what the
  // user sees.
  await expect(page.locator('[data-testid="bound-file"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="storage-status"]')).toContainText('数据仅存于此浏览器')

  // The refused file was not written to either.
  expect(await readOpfs(page, 'ac5.json')).toBe('')
})

test('AC6: without the File System Access API there is no binding entry and #44 wording stands', async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.goto('/')
  await page.waitForSelector('[data-testid="entries-editor"]')

  // Precondition: the override landed. Without this the test would pass on a
  // browser that still had the API, proving nothing.
  expect(await page.evaluate(() => typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker)).toBe(
    'undefined',
  )

  await expect(page.locator('[data-testid="bind-file"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="bound-file"]')).toHaveCount(0)

  // Exactly the #44 status, unchanged — no OPFS substitute pretending to be a file.
  const status = page.locator('[data-testid="storage-status"]')
  await expect(status).toContainText('数据仅存于此浏览器')
  await expect(status).toContainText('清除浏览器站点数据')
})

test('a file changed by another program is not overwritten by an autosave', async ({ page }) => {
  // The guard behind AC3: without it, closing the tab writes the in-memory
  // workspace over whatever the other program just wrote, silently choosing this
  // app's copy — the choice #45 reserves for the user.
  await openEditor(page)
  await bindToOpfs(page, 'race.json')
  await typeContent(page, 'Alice Wu', 'Staff Engineer')

  const external = (await readOpfs(page, 'race.json')).replace('Alice Wu', 'External Editor')
  await writeOpfs(page, 'race.json', external)

  // A local edit now wants the file that someone else just changed.
  await page.fill('[data-testid="basics-name"]', 'Local Edit')

  const saved = page.locator('[data-testid="last-saved"]')
  await expect(saved).toContainText('文件已被其他程序修改，未覆盖它')
  await expect(saved).not.toContainText('最近保存')

  // The other program's version is still intact...
  expect(await readOpfs(page, 'race.json')).toBe(external)
  // ...the local edit is not lost either, it is in the browser copy...
  await expect.poll(async () => (await readCachedWorkspace(page))?.pool.basics.name).toBe('Local Edit')

  // ...and the next startup hands the decision to the user instead of guessing.
  await page.reload()
  await page.waitForSelector('[data-testid="conflict-choice"]')
})

test('the binding entry is offered where the API exists', async ({ page }) => {
  await openEditor(page)
  await expect(page.locator('[data-testid="bind-file"]')).toBeVisible()
  await expect(page.locator('[data-testid="storage-status"]')).toContainText('绑定到文件')
})

/**
 * The picker button itself. The OS dialog cannot be automated — that part is
 * manual, and is written up in the delivery notes — but everything on this side
 * of it can be: that the click calls `showSaveFilePicker`, with the file name
 * the issue specifies, and that the handle it returns flows into the same
 * binding path the other tests exercise.
 *
 * The stub stands in for the *dialog*, not for the handle: what it returns is a
 * real OPFS `FileSystemFileHandle`, so the write below is a real write.
 */
test('clicking 绑定到文件 calls showSaveFilePicker and binds the handle it returns', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).pickerCalls = []
    ;(window as unknown as Record<string, unknown>).showSaveFilePicker = async (options: unknown) => {
      ;((window as unknown as { pickerCalls: unknown[] }).pickerCalls).push(options)
      const root = await navigator.storage.getDirectory()
      return root.getFileHandle('picked.json', { create: true })
    }
  })
  await openEditor(page)

  await page.click('[data-testid="bind-file"]')
  await expect(page.locator('[data-testid="bound-file"]')).toContainText('picked.json')

  // The dialog was opened with the workspace file name the issue asks for.
  const calls = await page.evaluate(() => (window as unknown as { pickerCalls: unknown[] }).pickerCalls)
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ suggestedName: 'hi-resume-workspace.json' })

  // And the binding is live: an edit reaches the file the picker handed over.
  await typeContent(page, 'Picker Wu', 'Staff Engineer')
  expect(await readOpfs(page, 'picked.json')).toContain('Picker Wu')
})

test('cancelling the picker leaves the app unbound and says nothing alarming', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).showSaveFilePicker = async () => {
      // What Chromium throws when the user dismisses the dialog.
      throw new DOMException('The user aborted a request.', 'AbortError')
    }
  })
  await openEditor(page)

  await page.click('[data-testid="bind-file"]')

  // A cancel is a normal outcome, not a failure to report.
  await expect(page.locator('[data-testid="binding-issue"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="bound-file"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="bind-file"]')).toBeEnabled()
})
