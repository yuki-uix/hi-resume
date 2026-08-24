import { describe, expect, it } from 'vitest'

import * as wording from './storage-status'
import {
  BIND_PERMISSION,
  CONFLICT_BODY,
  FILE_BOUND_PREFIX,
  FILE_BOUND_RISK,
  PERSIST_PENDING,
  PERSIST_RISK,
  STORAGE_LOCATION,
} from './storage-status'

/**
 * The wording is the deliverable of #44/#45, so these tests pin the copy itself.
 * The forbidden substrings are hard-coded literals here — NOT read back from the
 * module under test — because a guard that imports its own rule from the thing it
 * guards is a tautology: rename the constant and every assertion still passes.
 *
 * ## Why this walks the module instead of listing constants
 *
 * The first version of this file checked a hand-written array of four constants.
 * That list silently stopped covering the module the moment anything new was
 * exported — verified by adding `export const NEW_WORDING = '…已安全备份…'`, which
 * every test happily ignored. #45 adds a dozen strings (bound state, permission
 * refusals, the conflict prompt), which is exactly when such a list starts
 * lying.
 *
 * So the guard now walks `import * as wording` and checks every string it can
 * reach. Two properties keep the walk honest:
 *
 * - **It fails on an export it cannot walk.** A function export (say a
 *   `boundTo(name)` template) would hide its text from the traversal, so the
 *   guard rejects it and forces the wording to stay data.
 * - **It proves it reached every export**, rather than assuming the recursion
 *   worked. A traversal that silently collected nothing would otherwise pass
 *   every forbidden-word assertion.
 */

const FORBIDDEN = ['安全', '已备份', '已保存']

type Collected = { path: string; text: string }

/** Flatten every string reachable from a module export, remembering its path. */
function collectStrings(value: unknown, path: string, out: Collected[], bad: string[]): void {
  if (typeof value === 'string') {
    out.push({ path, text: value })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out, bad))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      collectStrings(nested, `${path}.${key}`, out, bad)
    }
    return
  }
  bad.push(`${path} (${typeof value})`)
}

function walkModule(): { strings: Collected[]; unwalkable: string[] } {
  const strings: Collected[] = []
  const unwalkable: string[] = []
  for (const [name, value] of Object.entries(wording)) {
    collectStrings(value, name, strings, unwalkable)
  }
  return { strings, unwalkable }
}

describe('storage status wording (#44)', () => {
  it('names the browser as the storage location', () => {
    expect(STORAGE_LOCATION).toContain('浏览器')
  })

  it('both persist outcomes carry the manual-clearing loss warning', () => {
    for (const text of [PERSIST_RISK.granted, PERSIST_RISK.denied]) {
      expect(text).toContain('清除浏览器站点数据')
      expect(text).toContain('丢失')
    }
  })

  it('granted and denied are two different risk levels', () => {
    expect(PERSIST_RISK.granted).not.toBe(PERSIST_RISK.denied)
    expect(PERSIST_RISK.granted).toContain('已获得持久化存储权限')
    expect(PERSIST_RISK.denied).toContain('未获得持久化存储权限')
    expect(PERSIST_RISK.denied).toContain('磁盘空间不足')
  })
})

describe('wording guard: every export is checked, not a hand-written list', () => {
  it('reaches every export of the module', () => {
    const { strings } = walkModule()
    const exportNames = Object.keys(wording)
    // Each export must contribute at least one string, addressed by a path that
    // starts with its name. This is the assertion that would have caught the
    // #44 gap: a new export with no strings reachable from it fails here.
    const covered = new Set(strings.map(({ path }) => path.split(/[.[]/)[0]))
    expect(exportNames.length).toBeGreaterThan(0)
    expect([...exportNames].filter((name) => !covered.has(name))).toEqual([])
  })

  it('refuses an export the guard cannot walk', () => {
    // A function or number export would hide its text from the traversal above,
    // so the wording must stay strings and containers of strings.
    const { unwalkable } = walkModule()
    expect(unwalkable).toEqual([])
  })

  it('no exported string claims the data is safe or backed up', () => {
    const { strings } = walkModule()
    const offenders = strings
      .filter(({ text }) => FORBIDDEN.some((word) => text.includes(word)))
      .map(({ path, text }) => `${path}: ${text}`)
    expect(offenders).toEqual([])
  })
})

describe('file-binding wording (#45)', () => {
  it('states writing to the file as a fact, without promising it cannot be lost', () => {
    expect(FILE_BOUND_PREFIX).toContain('写入文件')
    // The bound state still names how the data can go away.
    expect(FILE_BOUND_RISK).toContain('删除')
    expect(FILE_BOUND_RISK).toContain('权限')
  })

  it('says edits still land in the browser when binding is refused', () => {
    for (const text of [BIND_PERMISSION.denied, BIND_PERMISSION.prompt]) {
      expect(text).toContain('未绑定文件')
      expect(text).toContain('此浏览器')
    }
    expect(BIND_PERMISSION.denied).not.toBe(BIND_PERMISSION.prompt)
  })

  it('promises the conflict prompt writes nothing before the user chooses', () => {
    expect(CONFLICT_BODY).toContain('在你做出选择之前，两边都不会被写入')
  })

  it('the pending persist message is still shown before an answer arrives', () => {
    expect(PERSIST_PENDING).toContain('正在确认')
  })
})
