import { describe, expect, it } from 'vitest'

import { PERSIST_PENDING, PERSIST_RISK, STORAGE_LOCATION } from './storage-status'

/**
 * The wording of #44 is the deliverable, so these tests pin the copy itself.
 * The forbidden/required substrings are hard-coded literals here — NOT read back
 * from the constants under test — so a future edit that drops the loss warning or
 * slips in "安全"/"已备份" turns a test red instead of silently redefining the
 * guard.
 */

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

  it('never claims the data is safe or backed up', () => {
    for (const text of [PERSIST_RISK.granted, PERSIST_RISK.denied, PERSIST_PENDING, STORAGE_LOCATION]) {
      expect(text).not.toContain('安全')
      expect(text).not.toContain('已备份')
      expect(text).not.toContain('已保存')
    }
  })
})
