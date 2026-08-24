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

import type { TextOverrides } from '../../../domain/composition/types'
import type { Bullet, BulletId, Entry, EntryId, SectionId } from '../../../domain/pool/types'
import { OverrideDot } from '../OverrideDot'
import { useEditorStore } from '../editor-store-context'
import { useEditorComposition } from '../use-editor-composition'
import { useTextOverrides } from '../use-text-overrides'

/**
 * The entries of one list-shaped section. The *candidates* are the master's
 * selection for that section — the pool-level list of entries available to any
 * resume — and each carries a checkbox that says whether the current target
 * includes it (unchecked = "this resume drops this entry"). The master's own
 * selection is the same list, so the checkboxes work there too.
 *
 * Content (titles, text, adding/removing items) is master-only: on the master
 * the title / subtitle / period / bullet fields edit the pool. On a variant the
 * title and bullet text are instead *text overrides* — they edit the variant's
 * `textOverrides`, never the shared pool — while subtitle stays read-only (see
 * `VariantEntryFields`) and add / remove / reorder stays master-only.
 *
 * Order comes from `entrySelection[sectionId]` / `bulletSelection[id]` — the
 * same ID lists the preview renders.
 *
 * The editor's anchors deliberately use `data-entry-edit-id` /
 * `data-bullet-edit-id` (not `data-entry-id` / `data-bullet-id`), so they can
 * never collide with the paginated preview, which owns the plain `data-*` ids.
 */
export function EntryList({
  sectionId,
  onDeleteEntry,
  onDeleteBullet,
}: {
  sectionId: SectionId
  onDeleteEntry: (id: EntryId) => void
  onDeleteBullet: (entryId: EntryId, bulletId: BulletId) => void
}) {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const target = store((state) => state.target)
  const composition = useEditorComposition()
  const overrides = useTextOverrides()
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
              overrides={overrides}
              onDeleteEntry={onDeleteEntry}
              onDeleteBullet={onDeleteBullet}
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
  overrides,
  onDeleteEntry,
  onDeleteBullet,
}: {
  sectionId: SectionId
  entry: Entry
  selected: boolean
  editable: boolean
  overrides: TextOverrides
  onDeleteEntry: (id: EntryId) => void
  onDeleteBullet: (entryId: EntryId, bulletId: BulletId) => void
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
        {editable && (
          <span className="entry-row__delete">
            <button type="button" data-testid="delete-entry" onClick={() => onDeleteEntry(entry.id)}>
              删除
            </button>
          </span>
        )}
      </div>

      {editable ? (
        <EntryFields entry={entry} />
      ) : (
        <VariantEntryFields entry={entry} overrides={overrides} />
      )}
      <BulletList entry={entry} editable={editable} overrides={overrides} onDeleteBullet={onDeleteBullet} />
    </li>
  )
}

/** Title / subtitle / period, edited field by field on the master. */
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

/**
 * A variant's entry text fields. The title edits `textOverrides[entryId]`; the
 * subtitle is *not* overridable — `TextOverrides` maps an id to a single string
 * and that slot is the title — so it is shown greyed out rather than looking
 * editable. The period is a structured field and is left off here (it is not
 * overridable either).
 */
function VariantEntryFields({ entry, overrides }: { entry: Entry; overrides: TextOverrides }) {
  const store = useEditorStore()
  const title = overrides[entry.id] ?? entry.title

  return (
    <div className="entry-fields">
      <label className="entries-field">
        <span className="entries-field__label">
          标题
          <OverrideDot
            overridden={overrides[entry.id] !== undefined}
            onRestore={() => store.getState().clearTextOverride(entry.id)}
            restoreLabel={`恢复「${entry.title}」的标题继承`}
          />
        </span>
        <input
          className="entries-field__input"
          data-testid="entry-title"
          value={title}
          onChange={(event) => store.getState().setTextOverride(entry.id, event.target.value)}
        />
      </label>
      <label className="entries-field entries-field--readonly">
        <span className="entries-field__label">
          副标题
          <span className="entries-field__hint">本版本不可改写</span>
        </span>
        <input
          className="entries-field__input"
          data-testid="entry-subtitle"
          value={entry.subtitle ?? ''}
          placeholder="公司 / 组织"
          disabled
        />
      </label>
    </div>
  )
}

/** The bullets of one entry, drag-sortable within their own nested context. */
function BulletList({
  entry,
  editable,
  overrides,
  onDeleteBullet,
}: {
  entry: Entry
  editable: boolean
  overrides: TextOverrides
  onDeleteBullet: (entryId: EntryId, bulletId: BulletId) => void
}) {
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
              overrides={overrides}
              onDeleteBullet={onDeleteBullet}
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
  overrides,
  onDeleteBullet,
}: {
  bullet: Bullet
  entryId: EntryId
  selected: boolean
  editable: boolean
  overrides: TextOverrides
  onDeleteBullet: (entryId: EntryId, bulletId: BulletId) => void
}) {
  const store = useEditorStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bullet.id,
  })

  // On a variant the bullet text is an override; on the master it edits the pool.
  const isVariant = !editable
  const value = isVariant ? (overrides[bullet.id] ?? bullet.text) : bullet.text
  const overridden = isVariant && overrides[bullet.id] !== undefined

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
      {isVariant && (
        <OverrideDot
          overridden={overridden}
          onRestore={() => store.getState().clearTextOverride(bullet.id)}
          restoreLabel={`恢复「${bullet.text}」的 bullet 继承`}
        />
      )}
      <textarea
        className="bullet-row__text"
        data-testid="bullet-text"
        rows={2}
        value={value}
        placeholder="bullet 内容"
        onChange={(event) =>
          editable
            ? store.getState().setBulletText(bullet.id, event.target.value)
            : store.getState().setTextOverride(bullet.id, event.target.value)
        }
      />
      {editable && (
        <button
          type="button"
          className="bullet-row__delete"
          data-testid="delete-bullet"
          onClick={() => onDeleteBullet(entryId, bullet.id)}
        >
          删除
        </button>
      )}
    </li>
  )
}
