import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'

import type { PageSize } from '../../../domain/composition/types'
import type { SectionId } from '../../../domain/pool/types'
import { PaginatedPreview } from '../../preview/PaginatedPreview'
import type { PageBlock } from '../../preview/types'
import { useEditorStore } from '../editor-store-context'

/**
 * Wraps the paginated preview and floats the section toolbar above it.
 *
 * The toolbar lives *outside* `PaginatedPreview` as an absolutely-positioned
 * overlay. It is never inside a measured block, so it cannot change any block's
 * `getBoundingClientRect().height` — the hard constraint that pagination reads
 * block heights and would silently shift page boundaries if the toolbar joined
 * the flow or added margin to a block root.
 */
export function PreviewStage({
  blocks,
  pageSize,
  onRenameSection,
  debugMeasurer = false,
}: {
  blocks: PageBlock[]
  pageSize: PageSize
  onRenameSection: (id: SectionId) => void
  debugMeasurer?: boolean
}) {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const hoveredRef = useRef<SectionId | null>(null)
  const [hovered, setHovered] = useState<SectionId | null>(null)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)

  const visible = new Set<SectionId>(workspace.master.visibleSections)
  const visibleOrder = workspace.master.sectionOrder.filter((id) => visible.has(id))

  const reposition = () => {
    const id = hoveredRef.current
    const stage = stageRef.current
    if (!id || !stage) {
      setPosition(null)
      return
    }
    const header = stage.querySelector(`[data-section-id="${id}"]`)
    if (!header) {
      setPosition(null)
      return
    }
    const headerRect = header.getBoundingClientRect()
    const stageRect = stage.getBoundingClientRect()
    setPosition({
      top: headerRect.top - stageRect.top,
      right: stageRect.right - headerRect.right,
    })
  }

  // Re-pin the toolbar after a reorder/visibility change replaces the pages DOM.
  useEffect(() => {
    reposition()
    // `reposition` reads the hovered id from a ref and the stage from another
    // ref, so it does not need to be a dependency here.
  }, [workspace, hovered])

  // Re-pin on scroll/resize instead of clearing. Clearing here races with a
  // programmatic scroll-into-view followed by a mouse move (e.g. Playwright's
  // `hover` on a section below the fold): the scroll event fires *after* the
  // mouseover and would wipe the just-set hover. Re-positioning is idempotent —
  // if nothing is hovered it is a no-op, and if the hovered header scrolled the
  // toolbar simply follows it, so it can never drift off its block.
  useEffect(() => {
    const repin = () => reposition()
    window.addEventListener('scroll', repin, true)
    window.addEventListener('resize', repin)
    return () => {
      window.removeEventListener('scroll', repin, true)
      window.removeEventListener('resize', repin)
    }
    // `reposition` reads only refs (hoveredRef/stageRef) and a stable setter,
    // so capturing the first render's copy here is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element
    const sectionEl = target.closest?.('[data-section-id]')
    if (sectionEl) {
      const id = sectionEl.getAttribute('data-section-id') as SectionId
      hoveredRef.current = id
      setHovered(id)
      reposition()
      return
    }
    // Over the toolbar itself: keep the current section hovered so the buttons
    // stay clickable.
    if (target.closest?.('.section-toolbar')) return
    hoveredRef.current = null
    setHovered(null)
    setPosition(null)
  }

  const handleMouseLeave = () => {
    hoveredRef.current = null
    setHovered(null)
    setPosition(null)
  }

  return (
    <div
      ref={stageRef}
      className="preview-stage"
      onMouseOver={handleMouseOver}
      onMouseLeave={handleMouseLeave}
    >
      <PaginatedPreview blocks={blocks} pageSize={pageSize} debugMeasurer={debugMeasurer} />
      {hovered && position && (
        <SectionToolbar
          sectionId={hovered}
          isFirst={visibleOrder[0] === hovered}
          isLast={visibleOrder[visibleOrder.length - 1] === hovered}
          style={{ top: position.top, right: position.right }}
          onRename={() => onRenameSection(hovered)}
        />
      )}
    </div>
  )
}

function SectionToolbar({
  sectionId,
  isFirst,
  isLast,
  style,
  onRename,
}: {
  sectionId: SectionId
  isFirst: boolean
  isLast: boolean
  style: CSSProperties
  onRename: () => void
}) {
  const store = useEditorStore()

  return (
    <div className="section-toolbar" style={style} role="toolbar" aria-label="区块操作" data-testid="section-toolbar">
      {!isFirst && (
        <button
          type="button"
          className="section-toolbar__button"
          data-testid="toolbar-up"
          onClick={() => store.getState().moveSection(sectionId, 'up')}
        >
          上移
        </button>
      )}
      {!isLast && (
        <button
          type="button"
          className="section-toolbar__button"
          data-testid="toolbar-down"
          onClick={() => store.getState().moveSection(sectionId, 'down')}
        >
          下移
        </button>
      )}
      <button
        type="button"
        className="section-toolbar__button"
        data-testid="toolbar-hide"
        onClick={() => store.getState().setSectionVisible(sectionId, false)}
      >
        隐藏
      </button>
      <button
        type="button"
        className="section-toolbar__button"
        data-testid="toolbar-rename"
        onClick={onRename}
      >
        重命名
      </button>
    </div>
  )
}
