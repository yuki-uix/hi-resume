import type { ResumeComposition, ResumeVariant, VariantId, Workspace } from '../../../domain/composition/types'

/**
 * Variant CRUD. Mirrors `sections-store.ts` / `entries-store.ts`: every operation
 * is one command, and every command lands on `workspace.variants` alone — the pool
 * and the master composition are never touched, so creating, duplicating, renaming
 * or deleting a variant cannot disturb the content every other variant inherits.
 *
 * `createVariant` and `duplicateVariant` carry the minted id and timestamp in the
 * command (the store action mints them with `newVariantId` / `new Date()`), and
 * `renameVariant` carries its new timestamp the same way, so the reducer stays
 * pure and testable without randomness or a clock.
 */
export type VariantCommand =
  | { type: 'createVariant'; id: VariantId; name: string; createdAt: string }
  | { type: 'duplicateVariant'; id: VariantId; name: string; sourceId: VariantId; createdAt: string }
  | { type: 'renameVariant'; id: VariantId; name: string; updatedAt: string }
  | { type: 'deleteVariant'; id: VariantId }

/** A variant always owns one application; a duplicate starts a new one, not a copy. */
function freshApplication(): ResumeVariant['application'] {
  return { status: 'draft', events: [] }
}

/**
 * Deep-copy a variant's partial composition so the new variant shares no array or
 * record with the source — editing one later (the #31 write path) cannot write
 * through to the other.
 */
function copyPartialComposition(partial: Partial<ResumeComposition>): Partial<ResumeComposition> {
  const copy: Partial<ResumeComposition> = {}
  if (partial.sectionOrder !== undefined) copy.sectionOrder = [...partial.sectionOrder]
  if (partial.visibleSections !== undefined) copy.visibleSections = [...partial.visibleSections]
  if (partial.sectionTitles !== undefined) copy.sectionTitles = { ...partial.sectionTitles }
  if (partial.entrySelection !== undefined) {
    copy.entrySelection = Object.fromEntries(
      Object.entries(partial.entrySelection).map(([key, ids]) => [key, [...ids]]),
    )
  }
  if (partial.bulletSelection !== undefined) {
    copy.bulletSelection = Object.fromEntries(
      Object.entries(partial.bulletSelection).map(([key, ids]) => [key, [...ids]]),
    )
  }
  return copy
}

export function applyVariantCommand(workspace: Workspace, command: VariantCommand): Workspace {
  switch (command.type) {
    case 'createVariant': {
      // The empty partial is the whole point of read-only inheritance: the variant
      // renders exactly the master until a later issue writes into it. A copy of the
      // master here would freeze the master's current state and stop future edits
      // from flowing in.
      const variant: ResumeVariant = {
        id: command.id,
        name: command.name,
        composition: {},
        textOverrides: {},
        application: freshApplication(),
        createdAt: command.createdAt,
        updatedAt: command.createdAt,
      }
      return { ...workspace, variants: [...workspace.variants, variant] }
    }

    case 'duplicateVariant': {
      const source = workspace.variants.find((variant) => variant.id === command.sourceId)
      if (!source) return workspace

      const variant: ResumeVariant = {
        id: command.id,
        name: command.name,
        composition: copyPartialComposition(source.composition),
        textOverrides: { ...source.textOverrides },
        application: freshApplication(),
        createdAt: command.createdAt,
        updatedAt: command.createdAt,
      }
      return { ...workspace, variants: [...workspace.variants, variant] }
    }

    case 'renameVariant': {
      return {
        ...workspace,
        variants: workspace.variants.map((variant) =>
          variant.id === command.id
            ? { ...variant, name: command.name, updatedAt: command.updatedAt }
            : variant,
        ),
      }
    }

    case 'deleteVariant': {
      return {
        ...workspace,
        variants: workspace.variants.filter((variant) => variant.id !== command.id),
      }
    }
  }
}
