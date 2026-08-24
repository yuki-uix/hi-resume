import { describe, expect, it, vi } from 'vitest'

import type { Workspace } from '../domain/composition/types'
import { AUTOSAVE_DEBOUNCE_MS, createAutosaveController } from './autosave'
import { createEmptyWorkspace } from './empty-workspace'

/**
 * Debounce / flush behaviour, tested with a fake `save` and fake timers — the
 * controller is deliberately storage-agnostic. The real-IndexedDB round trip is
 * covered by `e2e/persistence.spec.ts` on the default assembly path.
 */

function fakeSave(records: Workspace[] = []) {
  return {
    records,
    save: vi.fn(async (workspace: Workspace) => {
      records.push(workspace)
    }),
  }
}

describe('createAutosaveController', () => {
  it('collapses a burst of notify calls into one save after the debounce window', async () => {
    vi.useFakeTimers()
    try {
      const { records, save } = fakeSave()
      const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save })

      controller.notify()
      controller.notify()
      controller.notify()

      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1)
      expect(save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(save).toHaveBeenCalledTimes(1)
      expect(records).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flush writes the latest workspace immediately, bypassing the debounce', async () => {
    vi.useFakeTimers()
    try {
      let current: Workspace = createEmptyWorkspace()
      const { save } = fakeSave()
      const controller = createAutosaveController({ getWorkspace: () => current, save })

      controller.notify()
      // An edit lands after notify but before the debounce window closes.
      current = { ...createEmptyWorkspace(), schemaVersion: 99 }

      await controller.flush()

      expect(save).toHaveBeenCalledTimes(1)
      expect(save.mock.calls[0]?.[0]).toBe(current)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not save again from a pending timer after a flush', async () => {
    vi.useFakeTimers()
    try {
      const { save } = fakeSave()
      const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save })

      controller.notify()
      await controller.flush()
      expect(save).toHaveBeenCalledTimes(1)

      // The flush cleared the timer, so nothing fires when the window would have ended.
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2)
      expect(save).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports the save timestamp through onSaved', async () => {
    vi.useFakeTimers()
    try {
      const save = vi.fn(async () => {})
      const onSaved = vi.fn()
      const controller = createAutosaveController({
        getWorkspace: () => createEmptyWorkspace(),
        save,
        onSaved,
        now: () => 1234,
      })

      controller.notify()
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)

      expect(onSaved).toHaveBeenCalledWith(1234)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forwards save failures to onError and rethrows from flush', async () => {
    const boom = new Error('disk full')
    const save = vi.fn(async () => {
      throw boom
    })
    const onError = vi.fn()
    const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save, onError })

    controller.notify() // there is an edit to write; flush only writes when there is
    await expect(controller.flush()).rejects.toThrow('disk full')
    expect(onError).toHaveBeenCalledWith(boom)
  })

  it('flush writes nothing when no edit is waiting', async () => {
    // The unload handler flushes on every close. Writing there unconditionally
    // costs a redundant IndexedDB write and — once a file is bound (#45) —
    // rewrites the user's file with bytes it already has, which can overwrite a
    // change another program made while this tab was idle.
    const { save } = fakeSave()
    const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save })

    await controller.flush()

    expect(save).not.toHaveBeenCalled()
  })

  it('flush retries after a failed save, and stops once one succeeds', async () => {
    const save = vi.fn<(workspace: Workspace) => Promise<void>>()
    save.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save })

    controller.notify()
    await expect(controller.flush()).rejects.toThrow('disk full')

    // Still unwritten, so the next flush must try again...
    await controller.flush()
    expect(save).toHaveBeenCalledTimes(2)

    // ...and now that it landed, a further flush has nothing to do.
    await controller.flush()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('keeps an edit that arrives while a save is in flight', async () => {
    // The edit is not covered by the save that was already running, so it must
    // survive as pending work rather than being marked written.
    const releases: Array<() => void> = []
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve)
        }),
    )
    const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save })

    controller.notify()
    const inFlight = controller.flush()
    controller.notify() // arrives mid-save
    releases[0]?.()
    await inFlight

    // The mid-save edit is still pending, so this flush writes rather than
    // deciding the in-flight save had already covered it.
    const second = controller.flush()
    releases[1]?.()
    await second
    expect(save).toHaveBeenCalledTimes(2)

    controller.dispose()
  })

  it('ignores notify after dispose', async () => {
    vi.useFakeTimers()
    try {
      const { save } = fakeSave()
      const controller = createAutosaveController({ getWorkspace: () => createEmptyWorkspace(), save })

      controller.dispose()
      controller.notify()
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2)

      expect(save).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
