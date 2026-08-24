import { describe, expect, it } from 'vitest'

import { asBulletId, asEntryId } from '../domain/pool/ids'
import { decideStartupSource, isWorkspaceEmpty, versionsAfterSave } from './binding-policy'
import { createEmptyWorkspace, EMPTY_SECTION } from './empty-workspace'

/**
 * The conflict rule is the one piece of #45 with real design in it, so it is
 * pinned here rather than only through the browser: "the file is truth, except
 * when the cache holds edits the file never got".
 */

const t = (ms: number) => ms

describe('decideStartupSource', () => {
  it('loads the file when the two copies are in sync', () => {
    expect(
      decideStartupSource({
        versions: { cacheVersionAt: t(1000), fileVersionAt: t(1000) },
        fileLastModified: t(1000),
        hasCachedWorkspace: true,
      }),
    ).toEqual({ kind: 'file' })
  })

  it('loads the file when the file moved on without us (edited elsewhere)', () => {
    // The file is newer than anything we wrote. That is not a conflict — it is
    // exactly what "the file is the source of truth" means.
    expect(
      decideStartupSource({
        versions: { cacheVersionAt: t(1000), fileVersionAt: t(1000) },
        fileLastModified: t(5000),
        hasCachedWorkspace: true,
      }),
    ).toEqual({ kind: 'file' })
  })

  it('asks the user when the cache is ahead of the file', () => {
    expect(
      decideStartupSource({
        versions: { cacheVersionAt: t(9000), fileVersionAt: t(1000) },
        fileLastModified: t(1000),
        hasCachedWorkspace: true,
      }),
    ).toEqual({ kind: 'conflict', cacheAt: t(9000), fileAt: t(1000) })
  })

  it('reports the file mtime it actually saw, not the last one we wrote', () => {
    // Both sides diverged: our cache never reached the file, and the file also
    // changed underneath. Still a prompt, and the timestamp shown for the file
    // must be the file's real one so the user compares reality.
    const decision = decideStartupSource({
      versions: { cacheVersionAt: t(9000), fileVersionAt: t(1000) },
      fileLastModified: t(7000),
      hasCachedWorkspace: true,
    })
    expect(decision).toEqual({ kind: 'conflict', cacheAt: t(9000), fileAt: t(7000) })
  })

  it('never prompts when there is no cached workspace to lose', () => {
    expect(
      decideStartupSource({
        versions: { cacheVersionAt: t(9000), fileVersionAt: t(1000) },
        fileLastModified: t(1000),
        hasCachedWorkspace: false,
      }),
    ).toEqual({ kind: 'file' })
  })

  it('does not prompt on the millisecond gap a normal dual write leaves', () => {
    // Regression guard for the naive comparison: a completed save stamps both
    // sides with the file's mtime, so the cache is never "1ms ahead" by accident.
    const after = versionsAfterSave({
      previous: { cacheVersionAt: t(1000), fileVersionAt: t(1000) },
      writtenFileVersionAt: t(2000),
      now: t(2050), // the cache write finished 50ms after the file write
    })
    expect(
      decideStartupSource({ versions: after, fileLastModified: t(2000), hasCachedWorkspace: true }),
    ).toEqual({ kind: 'file' })
  })
})

describe('versionsAfterSave', () => {
  it('marks both copies identical after a successful file write', () => {
    expect(
      versionsAfterSave({
        previous: { cacheVersionAt: t(1000), fileVersionAt: t(1000) },
        writtenFileVersionAt: t(4000),
        now: t(4010),
      }),
    ).toEqual({ cacheVersionAt: t(4000), fileVersionAt: t(4000) })
  })

  it('records the cache as ahead when the file write failed', () => {
    const versions = versionsAfterSave({
      previous: { cacheVersionAt: t(1000), fileVersionAt: t(1000) },
      writtenFileVersionAt: null,
      now: t(6000),
    })
    expect(versions).toEqual({ cacheVersionAt: t(6000), fileVersionAt: t(1000) })
    // ...and that state is what makes the next startup ask.
    expect(
      decideStartupSource({ versions, fileLastModified: t(1000), hasCachedWorkspace: true }).kind,
    ).toBe('conflict')
  })

  it('stays ahead of the file even when the clock runs behind it', () => {
    // A file copied from a machine with a fast clock can carry an mtime in the
    // future. A bare `now` would land below it and the unsynced edits would be
    // dropped silently at the next startup.
    const versions = versionsAfterSave({
      previous: { cacheVersionAt: t(1000), fileVersionAt: t(9_000_000) },
      writtenFileVersionAt: null,
      now: t(6000),
    })
    expect(versions.cacheVersionAt).toBeGreaterThan(versions.fileVersionAt)
    expect(
      decideStartupSource({ versions, fileLastModified: t(9_000_000), hasCachedWorkspace: true }).kind,
    ).toBe('conflict')
  })
})

describe('isWorkspaceEmpty', () => {
  it('treats the first-launch workspace as empty', () => {
    // The six built-in sections and their empty selections are app structure,
    // not something the user typed.
    expect(isWorkspaceEmpty(createEmptyWorkspace())).toBe(true)
  })

  it('is not empty once a name is typed', () => {
    const workspace = createEmptyWorkspace()
    workspace.pool.basics.name = 'Alice Wu'
    expect(isWorkspaceEmpty(workspace)).toBe(false)
  })

  it('is not empty once an entry exists', () => {
    const workspace = createEmptyWorkspace()
    const id = asEntryId('ent_1')
    workspace.pool.entries[id] = { id, sectionId: EMPTY_SECTION.work, title: '', bulletIds: [] }
    expect(isWorkspaceEmpty(workspace)).toBe(false)
  })

  it('is not empty once a bullet exists', () => {
    const workspace = createEmptyWorkspace()
    const id = asBulletId('bul_1')
    workspace.pool.bullets[id] = { id, text: '' }
    expect(isWorkspaceEmpty(workspace)).toBe(false)
  })

  it('is not empty once summary prose is written', () => {
    const workspace = createEmptyWorkspace()
    const summary = workspace.pool.sections[EMPTY_SECTION.summary]
    if (summary === undefined) throw new Error('the empty workspace lost its summary section')
    summary.text = '八年产品工程经验。'
    expect(isWorkspaceEmpty(workspace)).toBe(false)
  })

  it('is not empty once a contact field is filled', () => {
    const workspace = createEmptyWorkspace()
    workspace.pool.basics.email = 'alice@example.com'
    expect(isWorkspaceEmpty(workspace)).toBe(false)
  })

  it('is not empty once a section is renamed', () => {
    const workspace = createEmptyWorkspace()
    workspace.master.sectionTitles[EMPTY_SECTION.work] = '职业经历'
    expect(isWorkspaceEmpty(workspace)).toBe(false)
  })

  it('ignores whitespace-only typing', () => {
    const workspace = createEmptyWorkspace()
    workspace.pool.basics.name = '   '
    expect(isWorkspaceEmpty(workspace)).toBe(true)
  })
})
