import type { TextOverrides } from '../../domain/composition/types'
import { useEditorStore } from './editor-store-context'

/**
 * The current target's `textOverrides` — an empty record for the master, the
 * variant's overrides for a variant target. Editor chrome reads this to render
 * the *effective* text of a field (`overrides[id] ?? poolValue`) and to light
 * the inheritance dot (`overrides[id] !== undefined`). The preview applies the
 * same overrides through `selectRenderModel`; this hook is the lighter
 * editor-side view of the same record.
 */
export function useTextOverrides(): TextOverrides {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const target = store((state) => state.target)

  if (target.kind !== 'variant') return {}
  return workspace.variants.find((v) => v.id === target.id)?.textOverrides ?? {}
}
