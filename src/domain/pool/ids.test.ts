import { afterEach, describe, expect, it, vi } from 'vitest'

import { ID_PREFIX, asBulletId, asEntryId, asSectionId, newBulletId, newEntryId, newSectionId } from './ids'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('id generation', () => {
  it('prefixes each kind of id so a JSON backup stays readable', () => {
    expect(newSectionId().startsWith('sec_')).toBe(true)
    expect(newEntryId().startsWith('ent_')).toBe(true)
    expect(newBulletId().startsWith('bul_')).toBe(true)
    expect(ID_PREFIX).toEqual({ section: 'sec_', entry: 'ent_', bullet: 'bul_' })
  })

  it('never repeats an id', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 2000; i += 1) {
      ids.add(newSectionId())
      ids.add(newEntryId())
      ids.add(newBulletId())
    }

    expect(ids.size).toBe(6000)
  })

  it('uses crypto.randomUUID when the runtime provides it', () => {
    const randomUUID = vi.fn(() => '11111111-2222-3333-4444-555555555555')
    vi.stubGlobal('crypto', { randomUUID })

    expect(newEntryId()).toBe('ent_11111111-2222-3333-4444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('still produces unique ids when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined)

    const ids = new Set<string>()
    for (let i = 0; i < 500; i += 1) ids.add(newBulletId())

    expect(ids.size).toBe(500)
    for (const id of ids) expect(id).toMatch(/^bul_[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/)
  })

  it('still produces unique ids when crypto exists without randomUUID', () => {
    vi.stubGlobal('crypto', {})

    const ids = new Set<string>()
    for (let i = 0; i < 500; i += 1) ids.add(newSectionId())

    expect(ids.size).toBe(500)
    for (const id of ids) expect(id).toMatch(/^sec_[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/)
  })
})

describe('branding an existing string', () => {
  it('returns the string unchanged', () => {
    expect(asSectionId('sec_work')).toBe('sec_work')
    expect(asEntryId('ent_acme')).toBe('ent_acme')
    expect(asBulletId('bul_acme_1')).toBe('bul_acme_1')
  })
})
