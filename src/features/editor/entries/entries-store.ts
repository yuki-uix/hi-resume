import type { Workspace } from '../../../domain/composition/types'
import type { Basics, BulletId, Entry, EntryId, SectionId } from '../../../domain/pool/types'

/**
 * Entry and bullet commands. Mirrors `sections-store.ts`: every operation is one
 * command, and every command lands on the item pool plus the composition fields
 * that own entry/bullet shape — `entrySelection` and `bulletSelection` — never
 * a parallel "entry list" or "bullet list" kept in state. Selection and ordering
 * stay ID-based, so an add, remove or reorder never shifts the index of a
 * neighbour.
 *
 * `addEntry` / `addBullet` carry the minted id in the command (the store action
 * mints it with `newEntryId` / `newBulletId`), so the reducer stays pure and
 * testable without randomness. New content joins the master composition's
 * selection automatically, per issue #5.
 */
export type EntryCommand =
  | { type: 'addEntry'; sectionId: SectionId; id: EntryId }
  | { type: 'removeEntry'; id: EntryId }
  | { type: 'reorderEntries'; sectionId: SectionId; order: EntryId[] }
  | { type: 'setEntryTitle'; id: EntryId; title: string }
  | { type: 'setEntrySubtitle'; id: EntryId; subtitle: string }
  | { type: 'setEntryPeriod'; id: EntryId; period: { start: string; end?: string } | null }
  | { type: 'addBullet'; entryId: EntryId; id: BulletId }
  | { type: 'removeBullet'; entryId: EntryId; id: BulletId }
  | { type: 'reorderBullets'; entryId: EntryId; order: BulletId[] }
  | { type: 'setBulletText'; id: BulletId; text: string }
  | { type: 'setBasics'; basics: Basics }
  | { type: 'setSectionText'; sectionId: SectionId; text: string }

/** Immutably update one entry by id, or leave the workspace alone if it is absent. */
function updateEntry(workspace: Workspace, id: EntryId, patch: (entry: Entry) => Entry): Workspace {
  const entry = workspace.pool.entries[id]
  if (!entry) return workspace
  return {
    ...workspace,
    pool: { ...workspace.pool, entries: { ...workspace.pool.entries, [id]: patch(entry) } },
  }
}

function copyBasics(basics: Basics): Basics {
  const copy: Basics = { name: basics.name }
  if (basics.headline !== undefined) copy.headline = basics.headline
  if (basics.email !== undefined) copy.email = basics.email
  if (basics.phone !== undefined) copy.phone = basics.phone
  if (basics.location !== undefined) copy.location = basics.location
  if (basics.links !== undefined) copy.links = basics.links.map((link) => ({ ...link }))
  return copy
}

export function applyEntryCommand(workspace: Workspace, command: EntryCommand): Workspace {
  const master = workspace.master

  switch (command.type) {
    case 'addEntry': {
      const entry: Entry = { id: command.id, sectionId: command.sectionId, title: '', bulletIds: [] }
      return {
        ...workspace,
        pool: {
          ...workspace.pool,
          entries: { ...workspace.pool.entries, [command.id]: entry },
        },
        master: {
          ...master,
          entrySelection: {
            ...master.entrySelection,
            [command.sectionId]: [...(master.entrySelection[command.sectionId] ?? []), command.id],
          },
          bulletSelection: { ...master.bulletSelection, [command.id]: [] },
        },
      }
    }

    case 'removeEntry': {
      const entry = workspace.pool.entries[command.id]
      if (!entry) return workspace

      const entries = { ...workspace.pool.entries }
      delete entries[command.id]

      const bullets = { ...workspace.pool.bullets }
      for (const bulletId of entry.bulletIds) delete bullets[bulletId]

      const entrySelection = { ...master.entrySelection }
      entrySelection[entry.sectionId] = (master.entrySelection[entry.sectionId] ?? []).filter(
        (id) => id !== command.id,
      )

      const bulletSelection = { ...master.bulletSelection }
      delete bulletSelection[command.id]

      return {
        ...workspace,
        pool: { ...workspace.pool, entries, bullets },
        master: { ...master, entrySelection, bulletSelection },
      }
    }

    case 'reorderEntries': {
      return {
        ...workspace,
        master: {
          ...master,
          entrySelection: { ...master.entrySelection, [command.sectionId]: [...command.order] },
        },
      }
    }

    case 'setEntryTitle': {
      return updateEntry(workspace, command.id, (entry) => ({ ...entry, title: command.title }))
    }

    case 'setEntrySubtitle': {
      return updateEntry(workspace, command.id, (entry) => {
        // An empty subtitle is "no subtitle", not an empty line in the preview.
        const next = { ...entry }
        if (command.subtitle === '') delete next.subtitle
        else next.subtitle = command.subtitle
        return next
      })
    }

    case 'setEntryPeriod': {
      return updateEntry(workspace, command.id, (entry) => {
        const next = { ...entry }
        if (command.period === null) delete next.period
        else next.period = { ...command.period }
        return next
      })
    }

    case 'addBullet': {
      const entry = workspace.pool.entries[command.entryId]
      if (!entry) return workspace

      const bulletIds = [...entry.bulletIds, command.id]
      return {
        ...workspace,
        pool: {
          ...workspace.pool,
          entries: { ...workspace.pool.entries, [command.entryId]: { ...entry, bulletIds } },
          bullets: { ...workspace.pool.bullets, [command.id]: { id: command.id, text: '' } },
        },
        master: {
          ...master,
          bulletSelection: {
            ...master.bulletSelection,
            [command.entryId]: [...(master.bulletSelection[command.entryId] ?? []), command.id],
          },
        },
      }
    }

    case 'removeBullet': {
      const entry = workspace.pool.entries[command.entryId]
      if (!entry) return workspace
      if (!entry.bulletIds.includes(command.id)) return workspace

      const bullets = { ...workspace.pool.bullets }
      delete bullets[command.id]

      const bulletIds = entry.bulletIds.filter((id) => id !== command.id)
      const bulletSelection = { ...master.bulletSelection }
      bulletSelection[command.entryId] = (master.bulletSelection[command.entryId] ?? []).filter(
        (id) => id !== command.id,
      )

      return {
        ...workspace,
        pool: {
          ...workspace.pool,
          entries: { ...workspace.pool.entries, [command.entryId]: { ...entry, bulletIds } },
          bullets,
        },
        master: { ...master, bulletSelection },
      }
    }

    case 'reorderBullets': {
      return {
        ...workspace,
        master: {
          ...master,
          bulletSelection: { ...master.bulletSelection, [command.entryId]: [...command.order] },
        },
      }
    }

    case 'setBulletText': {
      const bullet = workspace.pool.bullets[command.id]
      if (!bullet) return workspace
      return {
        ...workspace,
        pool: {
          ...workspace.pool,
          bullets: { ...workspace.pool.bullets, [command.id]: { ...bullet, text: command.text } },
        },
      }
    }

    case 'setBasics': {
      return { ...workspace, pool: { ...workspace.pool, basics: copyBasics(command.basics) } }
    }

    case 'setSectionText': {
      const section = workspace.pool.sections[command.sectionId]
      if (!section) return workspace
      return {
        ...workspace,
        pool: {
          ...workspace.pool,
          sections: { ...workspace.pool.sections, [command.sectionId]: { ...section, text: command.text } },
        },
      }
    }
  }
}
