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

import type { Bullet, BulletId, Entry, EntryId, SectionId } from '../../../domain/pool/types'
import { useEditorStore } from '../editor-store-context'
import { useEditorComposition } from '../use-editor-composition'

/**
 * The entries of one list-shaped section. The *candidates* are the master's
 * selection for that section — the pool-level list of entries available to any
 * resume — and each carries a checkbox that says whether the current target
 * includes it (unchecked = "this resume drops this entry"). The master's own
 * selection is the same list, so the checkboxes work there too.
 *
 * Content (titles, text, adding/removing items) is master-only; on a variant the
 * rows are read-only and only the checkboxes and (on the master) drag handles
 * are live. Order comes from `entrySelection[sectionId]` / `bulletSelection[id]`
 * — the same ID lists the preview renders.
 *
 * The editor's anchors deliberately use `data-entry-edit-id` /
 * `data-bullet-edit-id` (not `data-entry-id` / `data-bullet-id`), so they can
 * never collide with the paginated preview, which owns the plain `data-*` ids.
 */
export function EntryList({
  sectionId,
  onDeleteEntry,
}: {
  sectionId: SectionId
  onDeleteEntry: (id: EntryId) => void
}) {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const target = store((state) => state.target)
  const composition = useEditorComposition()
  const editable = target.kind === 'master'

  const entries = (workspace.master.entrySelection[sectionId] ?? [])
    .map((id) => workspace.pool.entries[id])
    .filter((entry): entry is Entry => entry !== undefined)

  const selectedIds = composition.entrySelection[sectionId] ?? []

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const order = composition.entrySelection[sectionId] ?? []
    const from = order.indexOf(active.id as EntryId)
    const to = order.indexOf(over.id as EntryId)
    if (from === -1 || to === -1) return

    store.getState().reorderEntries(sectionId, arrayMove(order, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
        <ul className="entry-list">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              sectionId={sectionId}
              entry={entry}
              selected={selectedIds.includes(entry.id)}
              editable={editable}
              onDeleteEntry={onDeleteEntry}
            />
          ))}
        </ul>
      </SortableContext>
      {editable && (
        <button
          type="button"
          className="entries-add"
          data-testid="add-entry"
          onClick={() => store.getState().addEntry(sectionId)}
        >
          添加条目
        </button>
      )}
    </DndContext>
  )
}

function EntryRow({
  sectionId,
  entry,
  selected,
  editable,
  onDeleteEntry,
}: {
  sectionId: SectionId
  entry: Entry
  selected: boolean
  editable: boolean
  onDeleteEntry: (id: EntryId) => void
}) {
  const store = useEditorStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
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
      className="entry-row"
      data-entry-edit-id={entry.id}
      data-selected={selected}
      data-dragging={isDragging}
    >
      <div className="entry-row__head">
        {editable && (
          <button
            type="button"
            className="entry-row__handle"
            aria-label="拖拽排序"
            data-testid="drag-entry"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <label className="entry-row__toggle">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => store.getState().setEntrySelected(sectionId, entry.id, !selected)}
            data-testid="toggle-entry"
            aria-label={`包含「${entry.title}」`}
          />
          <span className="entry-row__toggle-label">包含</span>
        </label>
        {editable ? (
          <span className="entry-row__delete">
            <button type="button" data-testid="delete-entry" onClick={() => onDeleteEntry(entry.id)}>
              删除
            </button>
          </span>
        ) : (
          <span className="entry-row__readonly-title" title={entry.title}>
            {entry.title}
          </span>
        )}
      </div>

      {editable && <EntryFields entry={entry} />}
      <BulletList entry={entry} editable={editable} />
    </li>
  )
}

/** Title / subtitle / period, edited field by field. */
function EntryFields({ entry }: { entry: Entry }) {
  const store = useEditorStore()

  const setPeriod = (partial: { start?: string; end?: string }) => {
    const current = entry.period
    const start = partial.start !== undefined ? partial.start : current?.start ?? ''
    // An emptied end field means "no end", not an empty string in the preview.
    const end = partial.end !== undefined && partial.end !== '' ? partial.end : undefined

    if (start === '' && end === undefined) {
      store.getState().setEntryPeriod(entry.id, null)
    } else if (end === undefined) {
      store.getState().setEntryPeriod(entry.id, { start })
    } else {
      store.getState().setEntryPeriod(entry.id, { start, end })
    }
  }

  return (
    <div className="entry-fields">
      <label className="entries-field">
        <span className="entries-field__label">标题</span>
        <input
          className="entries-field__input"
          data-testid="entry-title"
          value={entry.title}
          onChange={(event) => store.getState().setEntryTitle(entry.id, event.target.value)}
        />
      </label>
      <label className="entries-field">
        <span className="entries-field__label">副标题</span>
        <input
          className="entries-field__input"
          data-testid="entry-subtitle"
          value={entry.subtitle ?? ''}
          placeholder="公司 / 组织"
          onChange={(event) => store.getState().setEntrySubtitle(entry.id, event.target.value)}
        />
      </label>
      <div className="entries-field">
        <span className="entries-field__label">时间段</span>
        <div className="entry-period">
          <input
            className="entries-field__input"
            data-testid="entry-period-start"
            value={entry.period?.start ?? ''}
            placeholder="开始"
            aria-label="开始时间"
            onChange={(event) => setPeriod({ start: event.target.value })}
          />
          <span className="entry-period__sep">–</span>
          <input
            className="entries-field__input"
            data-testid="entry-period-end"
            value={entry.period?.end ?? ''}
            placeholder="结束"
            aria-label="结束时间"
            onChange={(event) => setPeriod({ end: event.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

/** The bullets of one entry, drag-sortable within their own nested context. */
function BulletList({ entry, editable }: { entry: Entry; editable: boolean }) {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const composition = useEditorComposition()

  const bullets = (workspace.master.bulletSelection[entry.id] ?? [])
    .map((id) => workspace.pool.bullets[id])
    .filter((bullet): bullet is Bullet => bullet !== undefined)

  const selectedIds = composition.bulletSelection[entry.id] ?? []

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const order = composition.bulletSelection[entry.id] ?? []
    const from = order.indexOf(active.id as BulletId)
    const to = order.indexOf(over.id as BulletId)
    if (from === -1 || to === -1) return

    store.getState().reorderBullets(entry.id, arrayMove(order, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={bullets.map((bullet) => bullet.id)} strategy={verticalListSortingStrategy}>
        <ul className="entry-bullets">
          {bullets.map((bullet) => (
            <BulletRow
              key={bullet.id}
              bullet={bullet}
              entryId={entry.id}
              selected={selectedIds.includes(bullet.id)}
              editable={editable}
            />
          ))}
        </ul>
      </SortableContext>
      {editable && (
        <button
          type="button"
          className="entries-add entries-add--bullet"
          data-testid="add-bullet"
          onClick={() => store.getState().addBullet(entry.id)}
        >
          添加 bullet
        </button>
      )}
    </DndContext>
  )
}

function BulletRow({
  bullet,
  entryId,
  selected,
  editable,
}: {
  bullet: Bullet
  entryId: EntryId
  selected: boolean
  editable: boolean
}) {
  const store = useEditorStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bullet.id,
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
      className="bullet-row"
      data-bullet-edit-id={bullet.id}
      data-selected={selected}
      data-dragging={isDragging}
    >
      {editable && (
        <button
          type="button"
          className="bullet-row__handle"
          aria-label="拖拽排序"
          data-testid="drag-bullet"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
      )}
      <label className="bullet-row__toggle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => store.getState().setBulletSelected(entryId, bullet.id, !selected)}
          data-testid="toggle-bullet"
          aria-label={`包含「${bullet.text}」`}
        />
      </label>
      {editable ? (
        <textarea
          className="bullet-row__text"
          data-testid="bullet-text"
          rows={2}
          value={bullet.text}
          placeholder="bullet 内容"
          onChange={(event) => store.getState().setBulletText(bullet.id, event.target.value)}
        />
      ) : (
        <span className="bullet-row__readonly-text">{bullet.text}</span>
      )}
      {editable && (
        <button
          type="button"
          className="bullet-row__delete"
          data-testid="delete-bullet"
          onClick={() => store.getState().removeBullet(entryId, bullet.id)}
        >
          删除
        </button>
      )}
    </li>
  )
}
