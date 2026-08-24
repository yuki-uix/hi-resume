import { buildRenderModel } from './render-model'
import type { RenderModel } from './render-model'
import { resolveComposition } from './resolve'
import type { RenderTarget, ResumeVariant, Workspace } from './types'

/**
 * The variant a target names, or `undefined` for the master target or an id
 * that names nothing (a stale target renders the master rather than throwing).
 */
function selectVariant(workspace: Workspace, target: RenderTarget): ResumeVariant | undefined {
  if (target.kind === 'variant') {
    return workspace.variants.find((variant) => variant.id === target.id)
  }
  return undefined
}

/**
 * The single read-side render path. Every consumer that used to reach straight
 * for `buildRenderModel(pool, workspace.master)` goes through here instead, so
 * inheritance runs on every render — even when `workspace.variants` is empty,
 * where the resolved composition is deep-equal to the master — rather than being
 * a fallback path that never executes.
 *
 * For the `{ kind: 'master' }` target this reads only `workspace.pool` and
 * `workspace.master`; callers may memoize on those two references alone.
 */
export function selectRenderModel(workspace: Workspace, target: RenderTarget): RenderModel {
  const variant = selectVariant(workspace, target)
  const composition = resolveComposition(workspace.master, variant?.composition)
  return buildRenderModel(workspace.pool, composition, variant?.textOverrides ?? {})
}
