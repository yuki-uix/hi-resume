import { selectComposition } from '../../domain/composition/select-composition'
import type { ResumeComposition } from '../../domain/composition/types'
import { useEditorStore } from './editor-store-context'

/**
 * The current target's *resolved* composition, subscribed to the store. Editor
 * chrome — the left column, the middle entry form, the section toolbar — reads
 * this instead of `workspace.master`, so every list reflects the resume being
 * edited (a variant's inherited keys included), never the raw master.
 */
export function useEditorComposition(): ResumeComposition {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const target = store((state) => state.target)
  return selectComposition(workspace, target)
}
