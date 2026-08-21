import { useState, type ReactNode } from 'react'

import type { Workspace } from '../../../domain/composition/types'
import type { SectionId, SectionLayout } from '../../../domain/pool/types'
import { useEditorStore } from '../editor-store-context'

/**
 * The three section dialogs share one modal shell. Each is mounted only while
 * open, so `useState` seeds from the store exactly once per open — there is no
 * need to sync the input back on every store change.
 */
function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 className="dialog__title">{title}</h3>
        {children}
      </div>
    </div>
  )
}

/** The display title of a section: its rename, or the pool default. */
function sectionTitle(workspace: Workspace, id: SectionId): string {
  const section = workspace.pool.sections[id]
  return workspace.master.sectionTitles[id] ?? section?.title ?? ''
}

export function RenameDialog({ sectionId, onClose }: { sectionId: SectionId; onClose: () => void }) {
  const store = useEditorStore()
  const [value, setValue] = useState(() => sectionTitle(store.getState().workspace, sectionId))

  const submit = () => {
    const title = value.trim()
    if (!title) return
    store.getState().renameSection(sectionId, title)
    onClose()
  }

  return (
    <DialogShell title="重命名区块" onClose={onClose}>
      <input
        className="dialog__input"
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') onClose()
        }}
        data-testid="rename-input"
        aria-label="区块名称"
      />
      <div className="dialog__actions">
        <button type="button" className="dialog__button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="dialog__button dialog__button--primary"
          onClick={submit}
          disabled={!value.trim()}
          data-testid="rename-submit"
        >
          保存
        </button>
      </div>
    </DialogShell>
  )
}

export function AddSectionDialog({ onClose }: { onClose: () => void }) {
  const store = useEditorStore()
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<SectionLayout>('entries')

  const submit = () => {
    const title = name.trim()
    if (!title) return
    store.getState().addCustomSection(title, layout)
    onClose()
  }

  return (
    <DialogShell title="新建区块" onClose={onClose}>
      <input
        className="dialog__input"
        value={name}
        autoFocus
        placeholder="区块名称"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') onClose()
        }}
        data-testid="add-section-name"
        aria-label="区块名称"
      />
      <fieldset className="dialog__layout">
        <legend>结构</legend>
        <label>
          <input
            type="radio"
            name="layout"
            value="entries"
            checked={layout === 'entries'}
            onChange={() => setLayout('entries')}
            data-testid="layout-entries"
          />
          列表型
        </label>
        <label>
          <input
            type="radio"
            name="layout"
            value="text"
            checked={layout === 'text'}
            onChange={() => setLayout('text')}
            data-testid="layout-text"
          />
          纯文本型
        </label>
      </fieldset>
      <div className="dialog__actions">
        <button type="button" className="dialog__button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="dialog__button dialog__button--primary"
          onClick={submit}
          disabled={!name.trim()}
          data-testid="add-section-submit"
        >
          创建
        </button>
      </div>
    </DialogShell>
  )
}

export function DeleteSectionDialog({ sectionId, onClose }: { sectionId: SectionId; onClose: () => void }) {
  const store = useEditorStore()
  const title = sectionTitle(store.getState().workspace, sectionId)

  const confirm = () => {
    store.getState().removeCustomSection(sectionId)
    onClose()
  }

  return (
    <DialogShell title="删除区块" onClose={onClose}>
      <p className="dialog__text">
        确定删除区块「{title}」？该区块及其内容将被移除，且无法撤销。
      </p>
      <div className="dialog__actions">
        <button type="button" className="dialog__button" onClick={onClose} data-testid="delete-cancel">
          取消
        </button>
        <button
          type="button"
          className="dialog__button dialog__button--danger"
          onClick={confirm}
          data-testid="delete-confirm"
        >
          删除
        </button>
      </div>
    </DialogShell>
  )
}
