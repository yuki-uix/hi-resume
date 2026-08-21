import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { CSSProperties } from 'react'

import type { Section, SectionId } from '../../../domain/pool/types'
import { useEditorStore } from '../editor-store-context'

/**
 * The left-column list. Its order is `ResumeComposition.sectionOrder`, mapped
 * through the pool — never a separate array kept in state. Hidden sections stay
 * in the list (greyed out) so the toggle can bring them back.
 */
export function SectionList({
  onRename,
  onDelete,
}: {
  onRename: (id: SectionId) => void
  onDelete: (id: SectionId) => void
}) {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)

  const sections = workspace.master.sectionOrder
    .map((id) => workspace.pool.sections[id])
    .filter((section): section is Section => section !== undefined)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = workspace.master.sectionOrder.indexOf(active.id as SectionId)
    const to = workspace.master.sectionOrder.indexOf(over.id as SectionId)
    if (from === -1 || to === -1) return

    store.getState().reorderSections(arrayMove(workspace.master.sectionOrder, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
        <ul className="sections-list">
          {sections.map((section) => (
            <SectionRow key={section.id} section={section} onRename={onRename} onDelete={onDelete} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SectionRow({
  section,
  onRename,
  onDelete,
}: {
  section: Section
  onRename: (id: SectionId) => void
  onDelete: (id: SectionId) => void
}) {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const visible = workspace.master.visibleSections.includes(section.id)
  const title = workspace.master.sectionTitles[section.id] ?? section.title

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })

  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="section-row"
      data-section-list-id={section.id}
      data-visible={visible}
      data-removable={section.removable}
      data-dragging={isDragging}
    >
      <button
        type="button"
        className="section-row__handle"
        aria-label="拖拽排序"
        data-testid="drag-handle"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <span className="section-row__title" title={title}>
        {title}
      </span>

      <button
        type="button"
        className="section-row__rename"
        data-testid="rename-section"
        onClick={() => onRename(section.id)}
      >
        重命名
      </button>

      <label className="section-row__toggle" title={visible ? '点击隐藏' : '点击显示'}>
        <input
          type="checkbox"
          checked={visible}
          onChange={() => store.getState().setSectionVisible(section.id, !visible)}
          data-testid="toggle-section"
          aria-label={`显示「${title}」`}
        />
        <span className="section-row__toggle-label">{visible ? '显示' : '隐藏'}</span>
      </label>

      {section.removable && (
        <button
          type="button"
          className="section-row__delete"
          data-testid="delete-section"
          onClick={() => onDelete(section.id)}
        >
          删除
        </button>
      )}
    </li>
  )
}
