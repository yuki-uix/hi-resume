import { describe, expect, it } from 'vitest'

import type { Workspace } from '../domain/composition/types'
import type { WorkspaceVersions } from './binding-policy'
import { createEmptyWorkspace } from './empty-workspace'
import { WorkspaceFileWriteError, WorkspaceWriteError } from './errors'
import { createWorkspaceSaver, type SyncTargets } from './workspace-sync'

/**
 * The rules pinned here are the ones that decide whether a user's file is ever
 * silently left stale. Each test names the failure it prevents.
 */

const START: WorkspaceVersions = { cacheVersionAt: 1000, fileVersionAt: 1000 }

type Recorder = {
  targets: SyncTargets
  cacheWrites: Workspace[]
  fileWrites: Workspace[]
  savedVersions: WorkspaceVersions[]
  versions: WorkspaceVersions
}

function recorder(options: {
  cacheFails?: Error
  fileFails?: Error
  versionsFail?: Error
  bound?: boolean
  fileMtime?: number
  now?: number
}): Recorder {
  const cacheWrites: Workspace[] = []
  const fileWrites: Workspace[] = []
  const savedVersions: WorkspaceVersions[] = []
  const bound = options.bound ?? true

  const state: Recorder = {
    cacheWrites,
    fileWrites,
    savedVersions,
    versions: START,
    targets: {
      saveCache: async (workspace) => {
        cacheWrites.push(workspace)
        if (options.cacheFails) throw options.cacheFails
      },
      writeFile: async (workspace) => {
        if (!bound) return null
        fileWrites.push(workspace)
        if (options.fileFails) throw options.fileFails
        return options.fileMtime ?? 2000
      },
      getVersions: () => state.versions,
      saveVersions: async (versions) => {
        savedVersions.push(versions)
        if (options.versionsFail) throw options.versionsFail
        state.versions = versions
      },
      now: () => options.now ?? 5000,
    },
  }
  return state
}

describe('createWorkspaceSaver', () => {
  it('writes both targets on a normal save and marks them identical', async () => {
    const rec = recorder({ fileMtime: 2000 })
    const save = createWorkspaceSaver(rec.targets)
    const workspace = createEmptyWorkspace()

    await save(workspace)

    expect(rec.cacheWrites).toEqual([workspace])
    expect(rec.fileWrites).toEqual([workspace])
    expect(rec.savedVersions).toEqual([{ cacheVersionAt: 2000, fileVersionAt: 2000 }])
  })

  it('still writes IndexedDB when the file write fails', async () => {
    // The user's working copy must not be collateral damage from a missing file.
    const rec = recorder({ fileFails: new WorkspaceFileWriteError('NotFoundError') })
    const save = createWorkspaceSaver(rec.targets)

    await expect(save(createEmptyWorkspace())).rejects.toThrow(WorkspaceFileWriteError)

    expect(rec.cacheWrites).toHaveLength(1)
  })

  it('still attempts the file when the IndexedDB write fails', async () => {
    // The file is the copy that survives a cache wipe; a broken cache must not
    // be the reason it goes stale.
    const rec = recorder({ cacheFails: new WorkspaceWriteError('quota exceeded') })
    const save = createWorkspaceSaver(rec.targets)

    await expect(save(createEmptyWorkspace())).rejects.toThrow(WorkspaceWriteError)

    expect(rec.fileWrites).toHaveLength(1)
  })

  it('rejects on a file failure instead of reporting success from the cache write', async () => {
    // The whole point: a save that did not reach the user's file must never look
    // like a save that did. `onError` on the autosave controller depends on this
    // rejection to put the failure on screen.
    const rec = recorder({ fileFails: new WorkspaceFileWriteError('NotFoundError: gone') })
    const save = createWorkspaceSaver(rec.targets)

    await expect(save(createEmptyWorkspace())).rejects.toThrow('NotFoundError: gone')
  })

  it('records the cache as ahead after a failed file write', async () => {
    const rec = recorder({ fileFails: new WorkspaceFileWriteError('nope'), now: 5000 })
    const save = createWorkspaceSaver(rec.targets)

    await expect(save(createEmptyWorkspace())).rejects.toThrow()

    // Persisted, not just held in memory: the next startup reads this row to
    // learn that the file never received these edits.
    expect(rec.savedVersions).toEqual([{ cacheVersionAt: 5000, fileVersionAt: 1000 }])
  })

  it('surfaces the file error first when both targets fail', async () => {
    const rec = recorder({
      cacheFails: new WorkspaceWriteError('cache broke'),
      fileFails: new WorkspaceFileWriteError('file broke'),
    })
    const save = createWorkspaceSaver(rec.targets)

    await expect(save(createEmptyWorkspace())).rejects.toThrow('file broke')
  })

  it('writes only the cache when no file is bound', async () => {
    const rec = recorder({ bound: false, now: 5000 })
    const save = createWorkspaceSaver(rec.targets)

    await save(createEmptyWorkspace())

    expect(rec.cacheWrites).toHaveLength(1)
    expect(rec.fileWrites).toHaveLength(0)
  })

  it('keeps the last good file version when a later save fails to reach the file', async () => {
    // Save #1 succeeds; save #2 cannot write the file. `fileVersionAt` must stay
    // pinned to what is actually in the file, so the conflict shown at the next
    // startup compares against the real last-written version.
    const savedVersions: WorkspaceVersions[] = []
    let versions = START
    let attempt = 0
    const save = createWorkspaceSaver({
      saveCache: async () => {},
      writeFile: async () => {
        attempt += 1
        if (attempt === 2) throw new WorkspaceFileWriteError('second write failed')
        return 2000
      },
      getVersions: () => versions,
      saveVersions: async (next) => {
        savedVersions.push(next)
        versions = next
      },
      now: () => 5000,
    })

    await save(createEmptyWorkspace())
    await expect(save(createEmptyWorkspace())).rejects.toThrow('second write failed')

    expect(savedVersions).toEqual([
      { cacheVersionAt: 2000, fileVersionAt: 2000 },
      { cacheVersionAt: 5000, fileVersionAt: 2000 },
    ])
  })

  it('picks up a binding made after the saver was built', async () => {
    // The user can bind mid-session, and a debounced save may already be in
    // flight. A saver that captured the target at build time would keep writing
    // to nothing.
    let bound = false
    const fileWrites: Workspace[] = []
    let versions = START
    const save = createWorkspaceSaver({
      saveCache: async () => {},
      writeFile: async (workspace) => {
        if (!bound) return null
        fileWrites.push(workspace)
        return 3000
      },
      getVersions: () => versions,
      saveVersions: async (next) => {
        versions = next
      },
      now: () => 5000,
    })

    await save(createEmptyWorkspace())
    expect(fileWrites).toHaveLength(0)

    bound = true
    await save(createEmptyWorkspace())
    expect(fileWrites).toHaveLength(1)
    expect(versions).toEqual({ cacheVersionAt: 3000, fileVersionAt: 3000 })
  })

  it('reports a failure to persist the stamps', async () => {
    // Losing the stamps means losing the record of what is out of sync, so it
    // cannot be a quiet failure either.
    const rec = recorder({ versionsFail: new WorkspaceWriteError('stamp write failed') })
    const save = createWorkspaceSaver(rec.targets)

    await expect(save(createEmptyWorkspace())).rejects.toThrow('stamp write failed')
  })
})
