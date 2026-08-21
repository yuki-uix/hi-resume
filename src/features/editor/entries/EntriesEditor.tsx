import { useState } from 'react'

import type { Workspace } from '../../../domain/composition/types'
import type { Basics, BasicsLink, EntryId, SectionId } from '../../../domain/pool/types'
import { useEditorStore } from '../editor-store-context'
import { EntryList } from './EntryList'
import './entries-editor.css'

/**
 * The middle-column form. It edits the item pool through the same store as the
 * section list and the preview, so a keystroke here re-renders the preview
 * immediately. The column is a *sibling* of the preview stage, never an ancestor
 * of the pagination measurer, so its own typography cannot shift page
 * boundaries (see the header comment in `sections-editor.css`).
 */
export function EntriesEditor() {
  const store = useEditorStore()
  const workspace = store((state) => state.workspace)
  const [deletingEntryId, setDeletingEntryId] = useState<EntryId | null>(null)

  const sections = workspace.master.sectionOrder
    .map((id) => workspace.pool.sections[id])
    .filter((section): section is NonNullable<typeof section> => section !== undefined)

  return (
    <aside className="entries-editor" data-testid="entries-editor">
      <BasicsCard />

      {sections.map((section) => (
        <section key={section.id} className="entries-section" data-section-edit-id={section.id}>
          <h3 className="entries-section__title">{displayTitle(workspace, section.id)}</h3>
          {section.layout === 'text' ? (
            <TextSectionBody sectionId={section.id} />
          ) : (
            <EntryList sectionId={section.id} onDeleteEntry={setDeletingEntryId} />
          )}
        </section>
      ))}

      {deletingEntryId && <DeleteEntryDialog entryId={deletingEntryId} onClose={() => setDeletingEntryId(null)} />}
    </aside>
  )
}

function displayTitle(workspace: Workspace, id: SectionId): string {
  const section = workspace.pool.sections[id]
  return workspace.master.sectionTitles[id] ?? section?.title ?? ''
}

/** Contact header, edited field by field. Not selectable, so it carries no ID. */
function BasicsCard() {
  const store = useEditorStore()
  const basics = store((state) => state.workspace.pool.basics)

  const patch = (partial: Partial<Basics>) => {
    store.getState().setBasics({ ...basics, ...partial })
  }

  const patchLink = (index: number, partial: Partial<BasicsLink>) => {
    const links = (basics.links ?? []).map((link, i) => (i === index ? { ...link, ...partial } : link))
    patch({ links })
  }

  const addLink = () => patch({ links: [...(basics.links ?? []), { label: '', url: '' }] })
  const removeLink = (index: number) => patch({ links: (basics.links ?? []).filter((_, i) => i !== index) })

  return (
    <section className="entries-section" data-testid="basics-card">
      <h3 className="entries-section__title">基本信息</h3>
      <label className="entries-field">
        <span className="entries-field__label">姓名</span>
        <input
          className="entries-field__input"
          data-testid="basics-name"
          value={basics.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>
      <label className="entries-field">
        <span className="entries-field__label">标题</span>
        <input
          className="entries-field__input"
          data-testid="basics-headline"
          value={basics.headline ?? ''}
          placeholder="一句话定位"
          onChange={(event) => patch({ headline: event.target.value })}
        />
      </label>
      <label className="entries-field">
        <span className="entries-field__label">邮箱</span>
        <input
          className="entries-field__input"
          data-testid="basics-email"
          value={basics.email ?? ''}
          onChange={(event) => patch({ email: event.target.value })}
        />
      </label>
      <label className="entries-field">
        <span className="entries-field__label">电话</span>
        <input
          className="entries-field__input"
          data-testid="basics-phone"
          value={basics.phone ?? ''}
          onChange={(event) => patch({ phone: event.target.value })}
        />
      </label>
      <label className="entries-field">
        <span className="entries-field__label">所在地</span>
        <input
          className="entries-field__input"
          data-testid="basics-location"
          value={basics.location ?? ''}
          onChange={(event) => patch({ location: event.target.value })}
        />
      </label>

      <div className="entries-links">
        {(basics.links ?? []).map((link, index) => (
          <div key={index} className="entries-links__row">
            <input
              className="entries-field__input"
              value={link.label}
              placeholder="标签"
              aria-label="链接标签"
              onChange={(event) => patchLink(index, { label: event.target.value })}
            />
            <input
              className="entries-field__input"
              value={link.url}
              placeholder="https://"
              aria-label="链接地址"
              onChange={(event) => patchLink(index, { url: event.target.value })}
            />
            <button type="button" className="entries-icon-button" onClick={() => removeLink(index)}>
              删除
            </button>
          </div>
        ))}
        <button type="button" className="entries-add" data-testid="add-link" onClick={addLink}>
          添加链接
        </button>
      </div>
    </section>
  )
}

/** A text-layout section's body prose (个人简介 etc.). */
function TextSectionBody({ sectionId }: { sectionId: SectionId }) {
  const store = useEditorStore()
  const text = store((state) => state.workspace.pool.sections[sectionId]?.text ?? '')

  return (
    <textarea
      className="entries-textarea"
      data-testid="section-text"
      rows={5}
      value={text}
      placeholder="输入正文"
      onChange={(event) => store.getState().setSectionText(sectionId, event.target.value)}
    />
  )
}

function DeleteEntryDialog({ entryId, onClose }: { entryId: EntryId; onClose: () => void }) {
  const store = useEditorStore()
  const title = store((state) => state.workspace.pool.entries[entryId]?.title ?? '')

  const confirm = () => {
    store.getState().removeEntry(entryId)
    onClose()
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="删除条目"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="dialog__title">删除条目</h3>
        <p className="dialog__text" data-testid="delete-entry-title">
          确定删除条目「{title}」？该条目及其 bullet 将被移除，且无法撤销。
        </p>
        <div className="dialog__actions">
          <button type="button" className="dialog__button" onClick={onClose} data-testid="delete-entry-cancel">
            取消
          </button>
          <button
            type="button"
            className="dialog__button dialog__button--danger"
            onClick={confirm}
            data-testid="delete-entry-confirm"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
