import type {
  Basics,
  BulletId,
  EntryId,
  ItemPool,
  SectionId,
  SectionKind,
  SectionLayout,
} from '../pool/types'
import type { ResumeComposition, TextOverrides } from './types'

/**
 * The flat structure templates consume. Ordering, visibility, renaming and
 * text overrides are all already applied, so a template never reaches into the
 * item pool and never re-implements a selection rule.
 */
export type RenderModel = {
  basics: Basics
  sections: RenderSection[]
}

export type RenderSection = {
  id: SectionId
  kind: SectionKind
  /** `sectionTitles` override if present, otherwise the pool's default. */
  title: string
  layout: SectionLayout
  /** Order comes from `entrySelection`, not from the pool. */
  entries: RenderEntry[]
  /** Body prose for `layout: 'text'` sections: `textOverrides[sectionId]` if present, otherwise `Section.text`. */
  text?: string
}

export type RenderEntry = {
  id: EntryId
  title: string
  subtitle?: string
  period?: { start: string; end?: string }
  /** Order comes from `bulletSelection`, not from `Entry.bulletIds`. */
  bullets: RenderBullet[]
}

export type RenderBullet = {
  id: BulletId
  text: string
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

/**
 * Projects a pool plus a *resolved* composition into the render model.
 *
 * Two rules worth stating because they are easy to assume otherwise:
 *
 * - Selection is explicit. A section or entry with no key in
 *   `entrySelection` / `bulletSelection` contributes nothing. There is no
 *   "not customized yet, so show everything" fallback: it would make
 *   "this variant shows none of these bullets" indistinguishable from
 *   "this variant has not been touched", and the pool holds far more content
 *   than any one resume should print. Whoever creates content is responsible
 *   for adding it to the master composition.
 * - IDs that no longer resolve are skipped rather than thrown on. A stale ID
 *   in a selection list is a data-repair problem, not a reason to fail
 *   rendering the rest of a resume.
 *
 * Pass a composition that has already been through `resolveComposition`;
 * this function does no inheritance of its own.
 */
export function buildRenderModel(
  pool: ItemPool,
  composition: ResumeComposition,
  textOverrides: TextOverrides = {},
): RenderModel {
  const visible = new Set<SectionId>(composition.visibleSections)
  const sections: RenderSection[] = []

  for (const sectionId of composition.sectionOrder) {
    if (!visible.has(sectionId)) continue

    const section = pool.sections[sectionId]
    if (!section) continue

    const rendered: RenderSection = {
      id: sectionId,
      kind: section.kind,
      title: composition.sectionTitles[sectionId] ?? section.title,
      layout: section.layout,
      entries: buildEntries(pool, composition, textOverrides, sectionId),
    }
    // Text-shaped sections carry prose, not entries. `entries` is still filled
    // above (and comes back empty), so a template can always read it.
    if (section.layout === 'text') {
      const text = textOverrides[sectionId] ?? section.text
      if (text !== undefined) rendered.text = text
    }

    sections.push(rendered)
  }

  return { basics: copyBasics(pool.basics), sections }
}

function buildEntries(
  pool: ItemPool,
  composition: ResumeComposition,
  textOverrides: TextOverrides,
  sectionId: SectionId,
): RenderEntry[] {
  const entries: RenderEntry[] = []

  for (const entryId of composition.entrySelection[sectionId] ?? []) {
    const entry = pool.entries[entryId]
    if (!entry) continue

    const rendered: RenderEntry = {
      id: entryId,
      title: textOverrides[entryId] ?? entry.title,
      bullets: buildBullets(pool, composition, textOverrides, entryId),
    }
    if (entry.subtitle !== undefined) rendered.subtitle = entry.subtitle
    if (entry.period !== undefined) rendered.period = { ...entry.period }

    entries.push(rendered)
  }

  return entries
}

function buildBullets(
  pool: ItemPool,
  composition: ResumeComposition,
  textOverrides: TextOverrides,
  entryId: EntryId,
): RenderBullet[] {
  const bullets: RenderBullet[] = []

  for (const bulletId of composition.bulletSelection[entryId] ?? []) {
    const bullet = pool.bullets[bulletId]
    if (!bullet) continue

    bullets.push({ id: bulletId, text: textOverrides[bulletId] ?? bullet.text })
  }

  return bullets
}
