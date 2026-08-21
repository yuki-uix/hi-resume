/**
 * The item pool: the single place content lives.
 *
 * Everything selectable carries a stable ID — sections, entries and bullets
 * alike. Selection and ordering reference those IDs and never array indices,
 * because an index points at different content the moment something above it
 * is reordered or removed (see `docs/ARCHITECTURE.md` §3).
 */

declare const sectionIdBrand: unique symbol
declare const entryIdBrand: unique symbol
declare const bulletIdBrand: unique symbol

/** Identifies a `Section` in `ItemPool.sections`. */
export type SectionId = string & { readonly [sectionIdBrand]: 'SectionId' }
/** Identifies an `Entry` in `ItemPool.entries`. */
export type EntryId = string & { readonly [entryIdBrand]: 'EntryId' }
/** Identifies a `Bullet` in `ItemPool.bullets`. */
export type BulletId = string & { readonly [bulletIdBrand]: 'BulletId' }

/**
 * Decides which renderer a section gets. `custom` sections go through the
 * generic renderer, so adding one never requires touching template code.
 */
export type SectionKind =
  | 'basics'
  | 'summary'
  | 'work'
  | 'project'
  | 'education'
  | 'skill'
  | 'language'
  | 'custom'

/** List-shaped sections hold entries; text-shaped sections hold prose. */
export type SectionLayout = 'entries' | 'text'

export type Section = {
  id: SectionId
  kind: SectionKind
  /** Default title. A composition may rename it via `sectionTitles`. */
  title: string
  layout: SectionLayout
  /** Body prose for text-layout sections. A variant overrides it via `textOverrides[sectionId]`. */
  text?: string
  /** Built-in sections are `false`: they can be hidden, never deleted. */
  removable: boolean
}

export type Entry = {
  id: EntryId
  sectionId: SectionId
  title: string
  subtitle?: string
  period?: { start: string; end?: string }
  /** Every bullet this entry owns, regardless of what any resume selects. */
  bulletIds: BulletId[]
}

export type Bullet = {
  id: BulletId
  text: string
}

export type BasicsLink = {
  label: string
  url: string
}

/** Contact block. Not selectable, so it carries no ID. */
export type Basics = {
  name: string
  headline?: string
  email?: string
  phone?: string
  location?: string
  links?: BasicsLink[]
}

export type ItemPool = {
  sections: Record<SectionId, Section>
  entries: Record<EntryId, Entry>
  bullets: Record<BulletId, Bullet>
  basics: Basics
}
