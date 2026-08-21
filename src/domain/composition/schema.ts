import { z } from 'zod'

import type { BulletId, EntryId, SectionId } from '../pool/types'
import type { TextOverrides, Workspace } from './types'

/**
 * Zod schema for the workspace JSON, which is the portable backup format and
 * therefore the one place untrusted data enters the app.
 *
 * It checks structure, identity, and referential integrity. A selection list
 * may not name the same id twice, nor an id whose owner is some other parent
 * (an entry under a section it does not belong to, a bullet under an entry
 * that does not own it). A *dangling* id — one not present in the pool at all
 * — is accepted: the render model already skips stale IDs on purpose, and
 * rejecting a whole backup over one dangling reference would turn a cosmetic
 * problem into data loss.
 */

export const CURRENT_SCHEMA_VERSION = 1

/**
 * IDs are branded strings. Zod cannot produce a brand declared with a `unique
 * symbol`, so the output type is asserted here, in one place, rather than at
 * every call site. The runtime check — non-empty string — is unaffected.
 */
function idSchema<T extends string>(label: string): z.ZodType<T, T> {
  return z.string().min(1, `${label} must be a non-empty string`) as unknown as z.ZodType<T, T>
}

const sectionIdSchema = idSchema<SectionId>('section id')
const entryIdSchema = idSchema<EntryId>('entry id')
const bulletIdSchema = idSchema<BulletId>('bullet id')

export const sectionKindSchema = z.enum([
  'basics',
  'summary',
  'work',
  'project',
  'education',
  'skill',
  'language',
  'custom',
])

export const sectionLayoutSchema = z.enum(['entries', 'text'])

export const sectionSchema = z.object({
  id: sectionIdSchema,
  kind: sectionKindSchema,
  title: z.string(),
  layout: sectionLayoutSchema,
  text: z.string().optional(),
  removable: z.boolean(),
})

export const periodSchema = z.object({
  start: z.string(),
  end: z.string().optional(),
})

export const entrySchema = z.object({
  id: entryIdSchema,
  sectionId: sectionIdSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  period: periodSchema.optional(),
  bulletIds: z.array(bulletIdSchema),
})

export const bulletSchema = z.object({
  id: bulletIdSchema,
  text: z.string(),
})

export const basicsLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
})

export const basicsSchema = z.object({
  name: z.string(),
  headline: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(basicsLinkSchema).optional(),
})

export const itemPoolSchema = z.object({
  sections: z.record(sectionIdSchema, sectionSchema),
  entries: z.record(entryIdSchema, entrySchema),
  bullets: z.record(bulletIdSchema, bulletSchema),
  basics: basicsSchema,
})

export const resumeCompositionSchema = z.object({
  sectionOrder: z.array(sectionIdSchema),
  visibleSections: z.array(sectionIdSchema),
  sectionTitles: z.record(sectionIdSchema, z.string()),
  entrySelection: z.record(sectionIdSchema, z.array(entryIdSchema)),
  bulletSelection: z.record(entryIdSchema, z.array(bulletIdSchema)),
})

/** A variant stores only the keys it changed, so every key is optional. */
export const partialResumeCompositionSchema = resumeCompositionSchema.partial()

/**
 * Keys are entry IDs, bullet IDs or section IDs. They cannot be told apart at
 * runtime — all three are strings — so the schema validates the shape and the
 * branded key type is asserted, same as {@link idSchema}.
 */
export const textOverridesSchema = z.record(z.string(), z.string()) as unknown as z.ZodType<
  TextOverrides,
  TextOverrides
>

export const applicationStatusSchema = z.enum([
  'draft',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'closed',
])

export const applicationSchema = z.object({
  company: z.string().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  jobDescription: z.string().optional(),
  status: applicationStatusSchema,
  appliedAt: z.string().optional(),
  nextAction: z.object({ text: z.string(), dueAt: z.string().optional() }).optional(),
  events: z.array(z.object({ at: z.string(), text: z.string() })),
  notes: z.string().optional(),
})

export const resumeVariantSchema = z.object({
  id: z.string().min(1, 'variant id must be a non-empty string'),
  name: z.string(),
  composition: partialResumeCompositionSchema,
  textOverrides: textOverridesSchema,
  application: applicationSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const workspaceSettingsSchema = z.object({
  pageSize: z.enum(['A4', 'Letter']),
  staleAfterDays: z.number().int().positive().optional(),
})

/** The pool fields a referential-integrity check needs, typed loosely so the
 * branded id records can be handed over without per-field casts. */
type IntegrityPool = {
  entries: Record<string, { sectionId: string; bulletIds: string[] } | undefined>
  bullets: Record<string, unknown>
}

/** A composition or a variant's partial composition, reduced to its selection lists. */
type IntegritySelection = {
  entrySelection?: Record<string, string[]>
  bulletSelection?: Record<string, string[]>
}

type SelectionIssue = { path: (string | number)[]; message: string }

/**
 * Selection lists may choose and order, but they may not change what an id
 * belongs to nor name the same id twice. A dangling id — one absent from the
 * pool — is not an issue: the render model skips it, and rejecting it here
 * would make a backup with one broken reference unimportable.
 */
function selectionIntegrityIssues(
  pool: IntegrityPool,
  selection: IntegritySelection,
  basePath: (string | number)[],
): SelectionIssue[] {
  const issues: SelectionIssue[] = []

  for (const [sectionId, entryIds] of Object.entries(selection.entrySelection ?? {})) {
    const seen = new Set<string>()
    for (const entryId of entryIds) {
      if (seen.has(entryId)) {
        issues.push({
          path: [...basePath, 'entrySelection', sectionId],
          message: `duplicate entry id "${entryId}"`,
        })
        continue
      }
      seen.add(entryId)

      const entry = pool.entries[entryId]
      if (entry && entry.sectionId !== sectionId) {
        issues.push({
          path: [...basePath, 'entrySelection', sectionId],
          message: `entry "${entryId}" belongs to section "${entry.sectionId}", not "${sectionId}"`,
        })
      }
    }
  }

  for (const [entryId, bulletIds] of Object.entries(selection.bulletSelection ?? {})) {
    const entry = pool.entries[entryId]
    const seen = new Set<string>()
    for (const bulletId of bulletIds) {
      if (seen.has(bulletId)) {
        issues.push({
          path: [...basePath, 'bulletSelection', entryId],
          message: `duplicate bullet id "${bulletId}"`,
        })
        continue
      }
      seen.add(bulletId)

      if (entry && pool.bullets[bulletId] !== undefined && !entry.bulletIds.includes(bulletId)) {
        issues.push({
          path: [...basePath, 'bulletSelection', entryId],
          message: `bullet "${bulletId}" does not belong to entry "${entryId}"`,
        })
      }
    }
  }

  return issues
}

export const workspaceSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    pool: itemPoolSchema,
    master: resumeCompositionSchema,
    variants: z.array(resumeVariantSchema),
    settings: workspaceSettingsSchema,
  })
  .superRefine((workspace, ctx) => {
    // A record key that disagrees with the object's own `id` makes every
    // lookup ambiguous, so treat it as corruption rather than picking a winner.
    for (const collection of ['sections', 'entries', 'bullets'] as const) {
      for (const [key, item] of Object.entries(workspace.pool[collection]) as [
        string,
        { id: string },
      ][]) {
        if (item.id !== key) {
          ctx.addIssue({
            code: 'custom',
            path: ['pool', collection, key, 'id'],
            message: `id "${item.id}" does not match its key "${key}"`,
          })
        }
      }
    }

    const addIntegrityIssues = (selection: IntegritySelection, path: (string | number)[]) => {
      for (const issue of selectionIntegrityIssues(
        workspace.pool as unknown as IntegrityPool,
        selection,
        path,
      )) {
        ctx.addIssue({ code: 'custom', ...issue })
      }
    }

    addIntegrityIssues(workspace.master as unknown as IntegritySelection, ['master'])
    for (const [index, variant] of workspace.variants.entries()) {
      addIntegrityIssues(variant.composition as unknown as IntegritySelection, [
        'variants',
        index,
        'composition',
      ])
    }
  })

/**
 * Compile-time guard: the hand-written types and the schema must describe the
 * same shape. If either side drifts, this stops being assignable and the build
 * fails — a checklist would not have caught it.
 */
type AssertAssignable<A extends B, B> = A
export type SchemaMatchesWorkspace = AssertAssignable<z.infer<typeof workspaceSchema>, Workspace>
export type WorkspaceMatchesSchema = AssertAssignable<Workspace, z.infer<typeof workspaceSchema>>

/** `"pool.entries.ent_1.id: expected string, received undefined"` */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
}

export type WorkspaceParseResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; errors: string[] }

/**
 * Non-throwing entry point for JSON import: the caller shows `errors` to the
 * user, each line naming the path that failed.
 */
export function parseWorkspace(data: unknown): WorkspaceParseResult {
  const result = workspaceSchema.safeParse(data)
  if (result.success) return { ok: true, workspace: result.data }
  return { ok: false, errors: formatIssues(result.error) }
}
