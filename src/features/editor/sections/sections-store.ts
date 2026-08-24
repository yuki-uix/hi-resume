import type {
  ResumeComposition,
  VariantId,
  Workspace,
} from '../../../domain/composition/types'
import type { BulletId, Section, SectionId, SectionLayout } from '../../../domain/pool/types'

/**
 * Every section operation is one command, and every command lands on the pool
 * plus the three composition fields that own section shape —
 * `sectionOrder`, `visibleSections`, `sectionTitles` (plus the selection
 * records that a section owns). There is no separate "section list" array in
 * state: the left column and the preview both read their order straight out of
 * `ResumeComposition.sectionOrder`, so they cannot drift apart.
 *
 * The reducer is a pure function so the invariants are testable without a
 * browser or a store instance.
 */
/**
 * The section commands a variant accepts. Section shape — order, visibility,
 * title — is composition state a variant may override, so these four are legal
 * on every target.
 */
export type BothSectionCommand =
  | { type: 'reorderSections'; order: SectionId[] }
  | { type: 'moveSection'; id: SectionId; direction: 'up' | 'down' }
  | { type: 'setSectionVisible'; id: SectionId; visible: boolean }
  | { type: 'renameSection'; id: SectionId; title: string }

/**
 * The section commands only the master accepts. Adding or removing a section is
 * a pool-level operation (the section and its entries live in the shared pool),
 * so no variant may do it.
 */
export type MasterOnlySectionCommand =
  | { type: 'addCustomSection'; id: SectionId; title: string; layout: SectionLayout }
  | { type: 'removeCustomSection'; id: SectionId }

export type SectionCommand = BothSectionCommand | MasterOnlySectionCommand

export function applySectionCommand(workspace: Workspace, command: SectionCommand): Workspace {
  const master = workspace.master

  switch (command.type) {
    case 'reorderSections': {
      return { ...workspace, master: { ...master, sectionOrder: [...command.order] } }
    }

    case 'moveSection': {
      // "Up"/"down" in the preview means relative to the nearest *visible*
      // neighbour, not the nearest array entry: a hidden section between two
      // visible ones must not swallow the move. The visible sequence is
      // `sectionOrder` filtered by `visibleSections`, so the move is expressed
      // purely as a `sectionOrder` rewrite.
      const visible = new Set<SectionId>(master.visibleSections)
      const visibleOrder = master.sectionOrder.filter((id) => visible.has(id))
      const index = visibleOrder.indexOf(command.id)
      if (index === -1) return workspace

      const targetIndex = command.direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= visibleOrder.length) return workspace
      const anchor = visibleOrder[targetIndex]
      if (!anchor) return workspace

      const without = master.sectionOrder.filter((id) => id !== command.id)
      const anchorIndex = without.indexOf(anchor)
      const insertAt = command.direction === 'up' ? anchorIndex : anchorIndex + 1
      const sectionOrder = [...without]
      sectionOrder.splice(insertAt, 0, command.id)

      return { ...workspace, master: { ...master, sectionOrder } }
    }

    case 'setSectionVisible': {
      const alreadyVisible = master.visibleSections.includes(command.id)
      if (alreadyVisible === command.visible) return workspace

      // `visibleSections` is a set expressed as an array: order within it is
      // not meaningful, the render model iterates `sectionOrder` and checks
      // membership. Appending a re-shown section therefore restores it to its
      // original position automatically.
      const visibleSections = command.visible
        ? [...master.visibleSections, command.id]
        : master.visibleSections.filter((id) => id !== command.id)

      return { ...workspace, master: { ...master, visibleSections } }
    }

    case 'renameSection': {
      // Renaming only ever touches `sectionTitles` — a section's *title* — and
      // never `textOverrides`, which would be its *body*. Renaming back to the
      // pool default drops the override so `sectionTitles` stays "only the
      // renames that actually differ".
      const defaultTitle = workspace.pool.sections[command.id]?.title
      const sectionTitles = { ...master.sectionTitles }
      if (defaultTitle !== undefined && command.title === defaultTitle) {
        delete sectionTitles[command.id]
      } else {
        sectionTitles[command.id] = command.title
      }

      return { ...workspace, master: { ...master, sectionTitles } }
    }

    case 'addCustomSection': {
      const section: Section = {
        id: command.id,
        kind: 'custom',
        title: command.title,
        layout: command.layout,
        removable: true,
      }

      return {
        ...workspace,
        pool: {
          ...workspace.pool,
          sections: { ...workspace.pool.sections, [command.id]: section },
        },
        master: {
          ...master,
          sectionOrder: [...master.sectionOrder, command.id],
          visibleSections: [...master.visibleSections, command.id],
          // An empty selection is the explicit "this section contributes
          // nothing yet" marker, consistent with the rest of the model.
          entrySelection: { ...master.entrySelection, [command.id]: [] },
        },
      }
    }

    case 'removeCustomSection': {
      const section = workspace.pool.sections[command.id]
      if (!section || !section.removable) return workspace

      // A section owns its entries and their bullets; removing the section
      // removes them from the pool too, so no dangling content is left behind.
      const sections = { ...workspace.pool.sections }
      delete sections[command.id]

      const entries = { ...workspace.pool.entries }
      const bullets = { ...workspace.pool.bullets }
      const bulletSelection = { ...master.bulletSelection }
      const removedBullets = new Set<BulletId>()

      for (const entry of Object.values(entries)) {
        if (entry.sectionId !== command.id) continue
        for (const bulletId of entry.bulletIds) removedBullets.add(bulletId)
        delete entries[entry.id]
        delete bulletSelection[entry.id]
      }
      for (const bulletId of removedBullets) delete bullets[bulletId]

      const entrySelection = { ...master.entrySelection }
      delete entrySelection[command.id]

      const sectionTitles = { ...master.sectionTitles }
      delete sectionTitles[command.id]

      return {
        ...workspace,
        pool: { ...workspace.pool, sections, entries, bullets },
        master: {
          ...master,
          sectionOrder: master.sectionOrder.filter((id) => id !== command.id),
          visibleSections: master.visibleSections.filter((id) => id !== command.id),
          sectionTitles,
          entrySelection,
          bulletSelection,
        },
      }
    }
  }
}

/**
 * The variant write path for section commands. Copy-on-write is per-field and
 * follows the inheritance granularity (`docs/ARCHITECTURE.md` §3):
 *
 * - `sectionOrder` / `visibleSections` are whole-value: the *resolved* array is
 *   materialised into the variant's partial, then modified. A section added to
 *   the master afterwards must not silently reappear in a variant that reordered
 *   itself.
 * - `sectionTitles` is per-`SectionId`: only the renamed key is written, the
 *   other sections keep inheriting.
 *
 * The reducer never writes the whole resolved composition back — that would turn
 * the partial into a frozen copy of the master and kill inheritance.
 *
 * `updatedAt` is minted by the store action (like `renameVariant`), so this
 * reducer stays pure.
 */
export function applyVariantSectionCommand(
  workspace: Workspace,
  variantId: VariantId,
  command: BothSectionCommand,
  updatedAt: string,
): Workspace {
  const variant = workspace.variants.find((v) => v.id === variantId)
  if (!variant) return workspace

  const composition = variant.composition
  const master = workspace.master
  let nextComposition: Partial<ResumeComposition>

  switch (command.type) {
    case 'reorderSections': {
      nextComposition = { ...composition, sectionOrder: [...command.order] }
      break
    }

    case 'moveSection': {
      // Identical to the master's move, but the order and visibility it reads
      // are the variant's *resolved* values, and only `sectionOrder` is written.
      const sectionOrder = composition.sectionOrder ?? master.sectionOrder
      const visible = new Set<SectionId>(composition.visibleSections ?? master.visibleSections)
      const visibleOrder = sectionOrder.filter((id) => visible.has(id))
      const index = visibleOrder.indexOf(command.id)
      if (index === -1) return workspace

      const targetIndex = command.direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= visibleOrder.length) return workspace
      const anchor = visibleOrder[targetIndex]
      if (!anchor) return workspace

      const without = sectionOrder.filter((id) => id !== command.id)
      const anchorIndex = without.indexOf(anchor)
      const insertAt = command.direction === 'up' ? anchorIndex : anchorIndex + 1
      const next = [...without]
      next.splice(insertAt, 0, command.id)

      nextComposition = { ...composition, sectionOrder: next }
      break
    }

    case 'setSectionVisible': {
      const base = composition.visibleSections ?? master.visibleSections
      const alreadyVisible = base.includes(command.id)
      if (alreadyVisible === command.visible) return workspace

      const visibleSections = command.visible
        ? [...base, command.id]
        : base.filter((id) => id !== command.id)

      nextComposition = { ...composition, visibleSections }
      break
    }

    case 'renameSection': {
      // Per-`SectionId`: only the renamed key is written. The "base" a rename
      // can fall back to is the master's title (which may itself rename the
      // section) or the pool default — renaming to that base drops the variant's
      // override so it inherits again, exactly like the master drops its own
      // override on renaming back to the pool default.
      const base = master.sectionTitles[command.id] ?? workspace.pool.sections[command.id]?.title
      const titles = { ...composition.sectionTitles }
      if (base !== undefined && command.title === base) {
        delete titles[command.id]
      } else {
        titles[command.id] = command.title
      }

      const next = { ...composition }
      if (Object.keys(titles).length > 0) {
        next.sectionTitles = titles
      } else {
        delete next.sectionTitles
      }
      nextComposition = next
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
