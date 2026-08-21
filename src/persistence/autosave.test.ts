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

    await expect(controller.flush()).rejects.toThrow('disk full')
    expect(onError).toHaveBeenCalledWith(boom)
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
