import type { VariantId, Workspace } from '../../../domain/composition/types'
import type { BulletId, EntryId, SectionId } from '../../../domain/pool/types'

/**
 * The variant-only write path for text overrides (issue #32). Every command
 * lands on `variant.textOverrides` — a whole-value replacement keyed by the id
 * of an entry's title, a bullet's text, or a text-section's body — and never on
 * `workspace.pool`. Content stays shared across every resume; a variant that
 * wants to reword one line stores only that line here.
 *
 * Two properties matter and are easy to get wrong, so they are pinned by tests:
 *
 * - **Clearing is deleting.** A `clearTextOverride` removes the key outright.
 *   `resolveComposition`'s `mergeByKey` treats an explicit `undefined` as "not
 *   overridden", and JSON round-trips drop `undefined` anyway — so writing
 *   `undefined` would mean "inherited" in memory but "empty string after a
 *   reload" is impossible, and a stale key after one. `delete` is the only
 *   representation that survives the round trip unchanged.
 * - **The empty string is a real override.** `setTextOverride(id, '')` stores
 *   `''`, which renders as empty — it must not fall back to the pool text. The
 *   read side uses `??` (which lets `''` through) not `||`.
 *
 * These commands have no master counterpart: the master rewrites the pool
 * directly (`setBulletText`, `setEntryTitle`, `setSectionText`). The store
 * action only routes to this reducer when the target is a variant, which keeps
 * the pool-write / override-write split at the type level rather than a guard.
 */

/** An entry's title, a bullet's text, or a text-section's body — same string key. */
export type TextOverrideId = EntryId | BulletId | SectionId

export type VariantTextOverrideCommand =
  | { type: 'setTextOverride'; id: TextOverrideId; text: string }
  | { type: 'clearTextOverride'; id: TextOverrideId }

/**
 * Apply one text-override command to a variant, immutably. `updatedAt` is minted
 * by the store action (like every other variant write), keeping this reducer
 * pure and testable without a clock.
 */
export function applyVariantTextOverrideCommand(
  workspace: Workspace,
  variantId: VariantId,
  command: VariantTextOverrideCommand,
  updatedAt: string,
): Workspace {
  const variant = workspace.variants.find((v) => v.id === variantId)
  if (!variant) return workspace

  const textOverrides = { ...variant.textOverrides }
  if (command.type === 'setTextOverride') {
    textOverrides[command.id] = command.text
  } else {
    delete textOverrides[command.id]
  }

  return {
    ...workspace,
    variants: workspace.variants.map((v) =>
      v.id === variantId ? { ...v, textOverrides, updatedAt } : v,
    ),
  }
}
