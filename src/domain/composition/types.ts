import type { BulletId, EntryId, ItemPool, SectionId } from '../pool/types'

/**
 * A composition describes what one resume looks like: which sections, which
 * entries, which bullets, and in what order. The master resume and every job
 * variant share this shape — a variant just stores the keys it changed.
 */
export type ResumeComposition = {
  sectionOrder: SectionId[]
  visibleSections: SectionId[]
  /** Renames. A section absent here keeps its `Section.title` from the pool. */
  sectionTitles: Record<SectionId, string>
  /** Selected entries per section; array order is display order. */
  entrySelection: Record<SectionId, EntryId[]>
  /** Selected bullets per entry; array order is display order. */
  bulletSelection: Record<EntryId, BulletId[]>
}

/**
 * Whole-value text replacements, never a text diff. Keyed by the ID of the
 * thing being replaced: an entry's title, a bullet's text, or a section's
 * body text.
 *
 * Section *titles* are not here — they travel through
 * `ResumeComposition.sectionTitles`. Both `sectionTitles` and `textOverrides`
 * are keyed by `SectionId`, but they mean different things: a section's title
 * versus the prose underneath it.
 */
export type TextOverrides = Partial<Record<EntryId | BulletId | SectionId, string>>

/** Where a job application stands. One variant, one application. */
export type ApplicationStatus =
  | 'draft'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'closed'

export type ApplicationEvent = {
  /** ISO 8601 timestamp. */
  at: string
  text: string
}

export type Application = {
  company?: string
  role?: string
  location?: string
  jobDescription?: string
  status: ApplicationStatus
  /** ISO 8601 timestamp. */
  appliedAt?: string
  nextAction?: { text: string; dueAt?: string }
  events: ApplicationEvent[]
  notes?: string
}

export type VariantId = string

/**
 * Defined in M1, instantiated in M2. Building the master resume against the
 * final shape is cheaper than retrofitting stable IDs, bullet-level addressing
 * and selection lists onto a flat array later, with real content already
 * entered.
 */
export type ResumeVariant = {
  id: VariantId
  name: string
  /** Only the keys that differ from the master. */
  composition: Partial<ResumeComposition>
  textOverrides: TextOverrides
  application: Application
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp. */
  updatedAt: string
}

export type PageSize = 'A4' | 'Letter'

export type WorkspaceSettings = {
  pageSize: PageSize
  /** Applications idle for longer than this get flagged on the board (M3). */
  staleAfterDays?: number
}

export type Workspace = {
  schemaVersion: number
  pool: ItemPool
  master: ResumeComposition
  variants: ResumeVariant[]
  settings: WorkspaceSettings
}
