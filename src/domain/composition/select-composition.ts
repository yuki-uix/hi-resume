import { resolveComposition } from './resolve'
import type { RenderTarget, ResumeComposition, ResumeVariant, Workspace } from './types'

/**
 * The single read-side composition selector for editor chrome — the left column,
 * the middle entry form, the section toolbar. It resolves a target's partial
 * composition against the master so the editor shows what the current resume
 * actually contains (inherited keys included), not just the raw `workspace.master`.
 *
 * The preview goes through `selectRenderModel` instead (it also applies
 * `textOverrides`); this lighter selector serves components that only need the
 * resolved `ResumeComposition`, never the flat render model.
 *
 * A target that names nothing — a stale variant id — resolves to the master, the
 * same fallback `selectRenderModel` uses, so a bad target never throws.
 */
export function selectComposition(workspace: Workspace, target: RenderTarget): ResumeComposition {
  const variant: ResumeVariant | undefined =
    target.kind === 'variant' ? workspace.variants.find((v) => v.id === target.id) : undefined
  return resolveComposition(workspace.master, variant?.composition)
}
