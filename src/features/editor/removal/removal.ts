import type {
  ResumeComposition,
  ResumeVariant,
  TextOverrides,
  Workspace,
} from '../../../domain/composition/types'
import { buildRenderModel, type RenderModel } from '../../../domain/composition/render-model'
import { resolveComposition } from '../../../domain/composition/resolve'
import type { BulletId, EntryId, SectionId } from '../../../domain/pool/types'
import type { MasterOnlyEntryCommand } from '../entries/entries-store'
import type { MasterOnlySectionCommand } from '../sections/sections-store'

/**
 * Master-side deletion crosses every resume (issue #26). Deleting an entry from
 * the master also deletes it from the shared pool, so any variant that had
 * materialised its own selection for that section/entry — or a text override for
 * the removed content — is left pointing at an id that no longer resolves. This
 * module does two things:
 *
 * 1. **Impact** — which variants render the deleted content, by name, computed
 *    through the real read path (`resolveComposition` + `buildRenderModel`), not
 *    by inspecting a variant's raw `composition` partial. A variant that never
 *    touched `entrySelection[section]` inherits the master's selection, so its
 *    partial has no such key yet its render result does contain the entry.
 * 2. **Cleanup** — strip the removed ids from every variant's partial
 *    composition and text overrides, so no dangling reference survives an
 *    autosave.
 */

/**
 * The commands that remove content from the shared pool. Derived from the two
 * master-only command unions rather than hand-written, so a fourth pool-removal
 * command added anywhere automatically joins this union — and then fails to
 * compile until `removalIds` below registers a handler for it (issue #26 AC6).
 */
export type PoolRemovalCommand = Extract<
  MasterOnlyEntryCommand | MasterOnlySectionCommand,
  { type: `remove${string}` }
>

/** The ids a removal command deletes from the pool. */
export type RemovedIds = {
  entries: ReadonlySet<EntryId>
  bullets: ReadonlySet<BulletId>
  sections: ReadonlySet<SectionId>
}

type RemovalCommand<K extends PoolRemovalCommand['type']> = Extract<PoolRemovalCommand, { type: K }>

/**
 * The runtime registry that maps each pool-removal command type to the ids it
 * removes. Its type is a mapped type over `PoolRemovalCommand['type']`, so the
 * key set is *exactly* the set of removal command types: add a fourth removal
 * command without a handler here and the build fails. This is the coverage
 * guarantee, expressed in the type system rather than a checklist.
 */
export const removalIds: {
  [K in PoolRemovalCommand['type']]: (workspace: Workspace, command: RemovalCommand<K>) => RemovedIds
} = {
  removeEntry: (workspace, command) => {
    const entry = workspace.pool.entries[command.id]
    return {
      entries: new Set<EntryId>(entry ? [command.id] : []),
      bullets: new Set<BulletId>(entry?.bulletIds ?? []),
      sections: new Set<SectionId>(),
    }
  },

  removeBullet: (_workspace, command) => ({
    entries: new Set<EntryId>(),
    bullets: new Set<BulletId>([command.id]),
    sections: new Set<SectionId>(),
  }),

  removeCustomSection: (workspace, command) => {
    const entries = new Set<EntryId>()
    const bullets = new Set<BulletId>()
    for (const entry of Object.values(workspace.pool.entries)) {
      if (entry.sectionId !== command.id) continue
      entries.add(entry.id)
      for (const bulletId of entry.bulletIds) bullets.add(bulletId)
    }
    return { entries, bullets, sections: new Set<SectionId>([command.id]) }
  },
}

/**
 * Strip `removed` ids from every variant's partial composition and text
 * overrides. Leaves `master` and `pool` alone — the caller has already removed
 * the content from both. Only touches the fields a variant actually materialised
 * (an inherited field has no reference to clean; the master's own removal flows
 * through inheritance on its own).
 *
 * Two granularities matter and mirror `resolveComposition`:
 *
 * - A materialised selection list (`entrySelection[section]` /
 *   `bulletSelection[entry]`) is filtered in place and *kept*, even if it becomes
 *   empty. An empty list means "this section contributes nothing" — a different
 *   statement from "inherit the master", which still selects its other entries.
 * - A whole-value field (`sectionOrder` / `visibleSections`) is filtered to drop
 *   the removed section; a `sectionTitles` key and a whole `bulletSelection`
 *   entry owned by a removed entry are deleted outright.
 */
export function removeFromVariants(workspace: Workspace, removed: RemovedIds): Workspace {
  if (workspace.variants.length === 0) return workspace
  const variants = workspace.variants.map((variant) => cleanVariant(variant, removed))
  return { ...workspace, variants }
}

function cleanVariant(variant: ResumeVariant, removed: RemovedIds): ResumeVariant {
  const composition = cleanComposition(variant.composition, removed)
  const textOverrides = cleanTextOverrides(variant.textOverrides, removed)
  if (composition === variant.composition && textOverrides === variant.textOverrides) {
    return variant
  }
  return { ...variant, composition, textOverrides }
}

function cleanComposition(
  composition: Partial<ResumeComposition>,
  removed: RemovedIds,
): Partial<ResumeComposition> {
  const next: Partial<ResumeComposition> = { ...composition }
  let changed = false

  if (composition.entrySelection) {
    const entrySelection: Record<SectionId, EntryId[]> = {}
    for (const [rawSectionId, ids] of Object.entries(composition.entrySelection)) {
      const sectionId = rawSectionId as SectionId
      // The section itself is gone: its whole selection key goes too.
      if (removed.sections.has(sectionId)) {
        changed = true
        continue
      }
      const filtered = ids.filter((id) => !removed.entries.has(id))
      if (filtered.length !== ids.length) changed = true
      entrySelection[sectionId] = filtered
    }
    next.entrySelection = entrySelection
  }

  if (composition.bulletSelection) {
    const bulletSelection: Record<EntryId, BulletId[]> = {}
    for (const [rawEntryId, ids] of Object.entries(composition.bulletSelection)) {
      const entryId = rawEntryId as EntryId
      // The entry is gone: its whole bullet-selection key goes too.
      if (removed.entries.has(entryId)) {
        changed = true
        continue
      }
      const filtered = ids.filter((id) => !removed.bullets.has(id))
      if (filtered.length !== ids.length) changed = true
      bulletSelection[entryId] = filtered
    }
    next.bulletSelection = bulletSelection
  }

  if (composition.sectionOrder) {
    const filtered = composition.sectionOrder.filter((id) => !removed.sections.has(id))
    if (filtered.length !== composition.sectionOrder.length) {
      changed = true
      next.sectionOrder = filtered
    }
  }

  if (composition.visibleSections) {
    const filtered = composition.visibleSections.filter((id) => !removed.sections.has(id))
    if (filtered.length !== composition.visibleSections.length) {
      changed = true
      next.visibleSections = filtered
    }
  }

  if (composition.sectionTitles) {
    const sectionTitles = { ...composition.sectionTitles }
    for (const id of removed.sections) {
      if (Object.prototype.hasOwnProperty.call(sectionTitles, id)) {
        changed = true
        delete sectionTitles[id]
      }
    }
    next.sectionTitles = sectionTitles
  }

  return changed ? next : composition
}

function cleanTextOverrides(textOverrides: TextOverrides, removed: RemovedIds): TextOverrides {
  if (Object.keys(textOverrides).length === 0) return textOverrides

  const next: TextOverrides = { ...textOverrides }
  const entries = removed.entries as ReadonlySet<string>
  const bullets = removed.bullets as ReadonlySet<string>
  const sections = removed.sections as ReadonlySet<string>

  let changed = false
  for (const key of Object.keys(next)) {
    if (entries.has(key) || bullets.has(key) || sections.has(key)) {
      changed = true
      delete next[key as EntryId]
    }
  }
  return changed ? next : textOverrides
}

// ---------------------------------------------------------------------------
// Impact — which variants render the deleted content, by name.
// ---------------------------------------------------------------------------

/**
 * The variant names whose *render result* contains the given id. Uses the same
 * read path as the preview (`resolveComposition` + `buildRenderModel`), so an
 * inheriting variant — whose partial has no selection key — is correctly counted
 * as containing whatever the master still selects. Never reads a variant's raw
 * `composition` partial to guess, which would miss exactly that case.
 */
function affectedVariantNames(workspace: Workspace, contains: (model: RenderModel) => boolean): string[] {
  const names: string[] = []
  for (const variant of workspace.variants) {
    const composition = resolveComposition(workspace.master, variant.composition)
    const model = buildRenderModel(workspace.pool, composition, variant.textOverrides)
    if (contains(model)) names.push(variant.name)
  }
  return names
}

/** Variant names whose render result still shows `entryId`. */
export function affectedVariantsByEntry(workspace: Workspace, entryId: EntryId): string[] {
  return affectedVariantNames(workspace, (model) =>
    model.sections.some((section) => section.entries.some((entry) => entry.id === entryId)),
  )
}

/** Variant names whose render result still shows `bulletId`. */
export function affectedVariantsByBullet(workspace: Workspace, bulletId: BulletId): string[] {
  return affectedVariantNames(workspace, (model) =>
    model.sections.some((section) =>
      section.entries.some((entry) => entry.bullets.some((bullet) => bullet.id === bulletId)),
    ),
  )
}

/** Variant names whose render result still shows `sectionId`. */
export function affectedVariantsBySection(workspace: Workspace, sectionId: SectionId): string[] {
  return affectedVariantNames(workspace, (model) =>
    model.sections.some((section) => section.id === sectionId),
  )
}
