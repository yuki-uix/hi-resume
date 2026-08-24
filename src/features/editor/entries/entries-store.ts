import type {
  ResumeComposition,
  VariantId,
  Workspace,
} from '../../../domain/composition/types'
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
/**
 * The entry/bullet commands a variant accepts. These are the selection-shaping
 * commands — reordering and check/uncheck — that a variant may override. Content
 * (titles, text, adding/removing items) lives in the pool and is master-only.
 */
export type BothEntryCommand =
  | { type: 'reorderEntries'; sectionId: SectionId; order: EntryId[] }
  | { type: 'reorderBullets'; entryId: EntryId; order: BulletId[] }
  | { type: 'setEntrySelected'; sectionId: SectionId; id: EntryId; selected: boolean }
  | { type: 'setBulletSelected'; entryId: EntryId; id: BulletId; selected: boolean }

/**
 * The entry/bullet commands only the master accepts. Every one writes the pool —
 * content is shared, so a variant edits it through text overrides (a later
 * issue), never directly.
 */
export type MasterOnlyEntryCommand =
  | { type: 'addEntry'; sectionId: SectionId; id: EntryId }
  | { type: 'removeEntry'; id: EntryId }
  | { type: 'setEntryTitle'; id: EntryId; title: string }
  | { type: 'setEntrySubtitle'; id: EntryId; subtitle: string }
  | { type: 'setEntryPeriod'; id: EntryId; period: { start: string; end?: string } | null }
  | { type: 'addBullet'; entryId: EntryId; id: BulletId }
  | { type: 'removeBullet'; entryId: EntryId; id: BulletId }
  | { type: 'setBulletText'; id: BulletId; text: string }
  | { type: 'setBasics'; basics: Basics }
  | { type: 'setSectionText'; sectionId: SectionId; text: string }

export type EntryCommand = BothEntryCommand | MasterOnlyEntryCommand

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

    case 'setEntrySelected': {
      const entry = workspace.pool.entries[command.id]
      // A selection cannot move an entry into a section it does not belong to.
      if (!entry || entry.sectionId !== command.sectionId) return workspace

      const current = master.entrySelection[command.sectionId] ?? []
      const selected = current.includes(command.id)
      if (selected === command.selected) return workspace

      const next = command.selected ? [...current, command.id] : current.filter((id) => id !== command.id)
      return {
        ...workspace,
        master: { ...master, entrySelection: { ...master.entrySelection, [command.sectionId]: next } },
      }
    }

    case 'setBulletSelected': {
      const entry = workspace.pool.entries[command.entryId]
      // A selection cannot move a bullet into an entry that does not own it.
      if (!entry || !entry.bulletIds.includes(command.id)) return workspace

      const current = master.bulletSelection[command.entryId] ?? []
      const selected = current.includes(command.id)
      if (selected === command.selected) return workspace

      const next = command.selected ? [...current, command.id] : current.filter((id) => id !== command.id)
      return {
        ...workspace,
        master: { ...master, bulletSelection: { ...master.bulletSelection, [command.entryId]: next } },
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

/**
 * The variant write path for entry/bullet commands. Copy-on-write follows the
 * inheritance granularity (`docs/ARCHITECTURE.md` §3):
 *
 * - `entrySelection` is per-`SectionId`: only the touched section's list is
 *   written; every other section keeps inheriting from the master.
 * - `bulletSelection` is per-`EntryId`: only the touched entry's list is written.
 *
 * A reorder writes the exact list it was given. A check/uncheck resolves the
 * current list for that section/entry (the variant's override if present, else
 * the master's), applies the toggle, and writes only that one key. Nothing else
 * in the partial is materialised.
 *
 * `updatedAt` is minted by the store action, keeping the reducer pure.
 */
export function applyVariantEntryCommand(
  workspace: Workspace,
  variantId: VariantId,
  command: BothEntryCommand,
  updatedAt: string,
): Workspace {
  const variant = workspace.variants.find((v) => v.id === variantId)
  if (!variant) return workspace

  const composition = variant.composition
  const master = workspace.master
  let nextComposition: Partial<ResumeComposition>

  switch (command.type) {
    case 'reorderEntries': {
      nextComposition = {
        ...composition,
        entrySelection: { ...composition.entrySelection, [command.sectionId]: [...command.order] },
      }
      break
    }

    case 'setEntrySelected': {
      const entry = workspace.pool.entries[command.id]
      if (!entry || entry.sectionId !== command.sectionId) return workspace

      const base = composition.entrySelection?.[command.sectionId] ?? master.entrySelection[command.sectionId] ?? []
      const selected = base.includes(command.id)
      if (selected === command.selected) return workspace

      const next = command.selected ? [...base, command.id] : base.filter((id) => id !== command.id)
      nextComposition = {
        ...composition,
        entrySelection: { ...composition.entrySelection, [command.sectionId]: next },
      }
      break
    }

    case 'reorderBullets': {
      nextComposition = {
        ...composition,
        bulletSelection: { ...composition.bulletSelection, [command.entryId]: [...command.order] },
      }
      break
    }

    case 'setBulletSelected': {
      const entry = workspace.pool.entries[command.entryId]
      if (!entry || !entry.bulletIds.includes(command.id)) return workspace

      const base = composition.bulletSelection?.[command.entryId] ?? master.bulletSelection[command.entryId] ?? []
      const selected = base.includes(command.id)
      if (selected === command.selected) return workspace

      const next = command.selected ? [...base, command.id] : base.filter((id) => id !== command.id)
      nextComposition = {
        ...composition,
        bulletSelection: { ...composition.bulletSelection, [command.entryId]: next },
      }
      break
    }
  }

  return {
    ...workspace,
    variants: workspace.variants.map((v) =>
      v.id === variantId ? { ...v, composition: nextComposition, updatedAt } : v,
    ),
  }
}
