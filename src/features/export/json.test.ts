import { describe, expect, it } from 'vitest'

import { createWorkspace } from '../../domain/__fixtures__/workspace'
import { parseWorkspaceFile, serializeWorkspace, summarizeWorkspace } from './json'

/**
 * The import/export contract, at unit level. The browser half (download, file
 * picker, confirmation, IndexedDB write) is covered by `e2e/json-backup.spec.ts`;
 * this file pins the pure logic that must be lossless: the round trip and the
 * three failure modes.
 */

// `any` mirrors `schema.test.ts`: these tests deliberately feed malformed
// objects the `Workspace` type would not admit, so strict typing is unhelpful.
function rawWorkspace(): any {
  return JSON.parse(JSON.stringify(createWorkspace()))
}

function expectErrors(text: string): string[] {
  const result = parseWorkspaceFile(text)
  if (result.ok) throw new Error('expected the file to be rejected, but it parsed')
  return result.errors
}

describe('serializeWorkspace', () => {
  it('produces JSON that JSON.parse accepts directly (AC6)', () => {
    const text = serializeWorkspace(createWorkspace())

    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('round-trips: export → parse → export is deep-equal (AC1/AC8)', () => {
    const first = serializeWorkspace(createWorkspace())
    const parsed = parseWorkspaceFile(first)
    if (!parsed.ok) throw new Error('expected the exported workspace to parse')

    const second = serializeWorkspace(parsed.workspace)

    // The whole object is compared, no field deleted or exempted.
    expect(JSON.parse(second)).toStrictEqual(JSON.parse(first))
  })
})

describe('parseWorkspaceFile', () => {
  it('accepts a serialized workspace', () => {
    const result = parseWorkspaceFile(serializeWorkspace(createWorkspace()))

    expect(result.ok).toBe(true)
  })

  it('preserves timestamps byte-for-byte — import must not stamp new ones', () => {
    const raw = rawWorkspace()
    raw.variants = [
      {
        id: 'var_acme',
        name: 'Acme',
        composition: {},
        textOverrides: {},
        application: {
          status: 'applied',
          appliedAt: '2026-08-01T09:00:00.000Z',
          events: [{ at: '2026-08-01T09:00:00.000Z', text: 'Applied.' }],
        },
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
      },
    ]

    const result = parseWorkspaceFile(JSON.stringify(raw))

    if (!result.ok) throw new Error('expected the variant workspace to parse')
    const variant = result.workspace.variants[0]
    expect(variant?.createdAt).toBe('2026-08-01T08:00:00.000Z')
    expect(variant?.updatedAt).toBe('2026-08-01T09:00:00.000Z')
    expect(variant?.application.appliedAt).toBe('2026-08-01T09:00:00.000Z')
    expect(variant?.application.events[0]?.at).toBe('2026-08-01T09:00:00.000Z')
  })

  it('rejects text that is not JSON, with a readable message', () => {
    expect(expectErrors('{ this is not json').join('\n')).toContain('不是合法的 JSON')
  })

  it('rejects a workspace missing a required field and names the path (AC3)', () => {
    const raw = rawWorkspace()
    delete raw.pool.entries.ent_acme.id

    expect(expectErrors(JSON.stringify(raw))).toEqual([
      'pool.entries.ent_acme.id: Invalid input: expected string, received undefined',
    ])
  })

  it('rejects an unsupported (newer) schemaVersion with a clear message (AC4)', () => {
    const raw = rawWorkspace()
    raw.schemaVersion = 999

    const errors = expectErrors(JSON.stringify(raw))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('schemaVersion 为 999')
    expect(errors[0]).toContain('无法导入')
  })
})

describe('summarizeWorkspace', () => {
  it('counts the collections the import confirmation displays', () => {
    expect(summarizeWorkspace(createWorkspace())).toEqual({
      sections: 5,
      entries: 7,
      bullets: 12,
      variants: 0,
    })
  })
})
