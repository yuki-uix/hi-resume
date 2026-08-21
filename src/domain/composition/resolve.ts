import type { ResumeComposition } from './types'

/**
 * Copies every key of `base`, then lets `override` win key by key. Keys the
 * override does not mention keep following the base — that is what makes
 * master-resume additions flow into variants that never touched those keys.
 *
 * An explicit `undefined` value counts as "not overridden", not as "erase".
 * `Partial<T>` cannot distinguish an absent key from a present-but-undefined
 * one, and JSON round-trips drop undefined values anyway, so treating the two
 * alike keeps a variant's meaning stable across a save and reload.
 */
function mergeByKey<K extends string, V>(
  base: Record<K, V>,
  override: Partial<Record<K, V>> | undefined,
  copy: (value: V) => V,
): Record<K, V> {
  const merged = {} as Record<K, V>
  for (const [key, value] of Object.entries(base) as [K, V][]) {
    merged[key] = copy(value)
  }
  if (override) {
    for (const [key, value] of Object.entries(override) as [K, V | undefined][]) {
      if (value === undefined) continue
      merged[key] = copy(value)
    }
  }
  return merged
}

const copyIds = <T>(ids: T[]): T[] => [...ids]
const keepValue = <T>(value: T): T => value

/**
 * Resolves a variant's partial composition against the master resume.
 *
 * Fallback granularity is deliberate and differs per field
 * (`docs/ARCHITECTURE.md` §3):
 *
 * | field                            | granularity     |
 * |----------------------------------|-----------------|
 * | `sectionOrder` / `visibleSections` | whole value   |
 * | `sectionTitles`                  | per `SectionId` |
 * | `entrySelection`                 | per `SectionId` |
 * | `bulletSelection`                | per `EntryId`   |
 *
 * The whole-value fields are the coarse ones on purpose: once a variant has
 * its own section order, a section added to the master afterwards must not
 * silently appear in it at an arbitrary position.
 *
 * The result never shares an array or record with either input, so callers can
 * mutate it without writing through to the stored composition.
 */
export function resolveComposition(
  master: ResumeComposition,
  variant?: Partial<ResumeComposition>,
): ResumeComposition {
  const resolved: ResumeComposition = {
    sectionOrder: [...(variant?.sectionOrder ?? master.sectionOrder)],
    visibleSections: [...(variant?.visibleSections ?? master.visibleSections)],
    sectionTitles: mergeByKey(master.sectionTitles, variant?.sectionTitles, keepValue),
    entrySelection: mergeByKey(master.entrySelection, variant?.entrySelection, copyIds),
    bulletSelection: mergeByKey(master.bulletSelection, variant?.bulletSelection, copyIds),
  }

  return resolved
}
