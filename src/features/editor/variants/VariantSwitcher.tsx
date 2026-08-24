import { useState } from 'react'

import type { RenderTarget, VariantId } from '../../../domain/composition/types'
import { useEditorStore } from '../editor-store-context'
import './variant-switcher.css'

/**
 * The left-column switcher that names the current editing target — the master
 * resume or one job variant — plus the create / duplicate / rename / delete
 * actions.
 *
 * The target itself is owned by `SectionsEditor` (it is editor-local view state,
 * not part of the persisted workspace), so this component only reads it and asks
 * to change it via `onSelectTarget`. Creating or duplicating a variant switches to
 * the new variant immediately; deleting the currently-selected variant hands
 * control back to `SectionsEditor`, which resets the target to the master so no
 * stale variant id is ever left selected.
 */
export function VariantSwitcher({
  target,
  onSelectTarget,
}: {
  target: RenderTarget
  onSelectTarget: (target: RenderTarget) => void
}) {
  const store = useEditorStore()
  const variants = store((state) => state.workspace.variants)

  const [dialog, setDialog] = useState<VariantDialogState>(null)

  const currentVariant = target.kind === 'variant' ? variants.find((v) => v.id === target.id) : undefined
  const selectValue = currentVariant ? currentVariant.id : 'master'

  return (
    <div className="variant-switcher" data-testid="variant-switcher">
      <label className="variant-switcher__label" htmlFor="variant-select">
        编辑对象
      </label>
      <select
        id="variant-select"
        className="variant-switcher__select"
        data-testid="variant-select"
        value={selectValue}
        onChange={(event) => {
          const value = event.target.value
          onSelectTarget(value === 'master' ? { kind: 'master' } : { kind: 'variant', id: value })
        }}
      >
        <option value="master">主简历</option>
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.name}
          </option>
        ))}
      </select>

      <div className="variant-switcher__actions">
        <button type="button" data-testid="new-variant" onClick={() => setDialog({ kind: 'create' })}>
          新建
        </button>
        <button
          type="button"
          data-testid="duplicate-variant"
          disabled={target.kind !== 'variant'}
          onClick={() => {
            if (target.kind !== 'variant') return
            setDialog({ kind: 'duplicate', sourceId: target.id })
          }}
        >
          复制
        </button>
        <button
          type="button"
          data-testid="rename-variant"
          disabled={target.kind !== 'variant'}
          onClick={() => {
            if (target.kind !== 'variant') return
            setDialog({ kind: 'rename', id: target.id })
          }}
        >
          重命名
        </button>
        <button
          type="button"
          data-testid="delete-variant"
          disabled={target.kind !== 'variant'}
          onClick={() => {
            if (target.kind !== 'variant') return
            setDialog({ kind: 'delete', id: target.id })
          }}
        >
          删除
        </button>
      </div>

      {dialog?.kind === 'create' && (
        <NameDialog
          title="新建岗位版本"
          ariaLabel="版本名称"
          submitLabel="创建"
          placeholder="例如：后端工程师"
          onSubmit={(name) => {
            const id = store.getState().createVariant(name)
            onSelectTarget({ kind: 'variant', id })
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'duplicate' && (
        <NameDialog
          title="复制岗位版本"
          ariaLabel="版本名称"
          submitLabel="创建"
          placeholder="副本名称"
          initialName={`${variants.find((v) => v.id === dialog.sourceId)?.name ?? ''} 副本`}
          onSubmit={(name) => {
            const id = store.getState().duplicateVariant(dialog.sourceId, name)
            onSelectTarget({ kind: 'variant', id })
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'rename' && (
        <NameDialog
          title="重命名岗位版本"
          ariaLabel="版本名称"
          submitLabel="保存"
          placeholder="版本名称"
          initialName={variants.find((v) => v.id === dialog.id)?.name ?? ''}
          onSubmit={(name) => {
            store.getState().renameVariant(dialog.id, name)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'delete' && (
        <DeleteVariantDialog
          name={variants.find((v) => v.id === dialog.id)?.name ?? ''}
          onConfirm={() => {
            const id = dialog.id
            store.getState().deleteVariant(id)
            if (target.kind === 'variant' && target.id === id) onSelectTarget({ kind: 'master' })
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

type VariantDialogState =
  | { kind: 'create' }
  | { kind: 'duplicate'; sourceId: VariantId }
  | { kind: 'rename'; id: VariantId }
  | { kind: 'delete'; id: VariantId }
  | null

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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

function NameDialog({
  title,
  ariaLabel,
  submitLabel,
  placeholder,
  initialName = '',
  onSubmit,
  onClose,
}: {
  title: string
  ariaLabel: string
  submitLabel: string
  placeholder: string
  initialName?: string
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialName)

  const submit = () => {
    const name = value.trim()
    if (!name) return
    onSubmit(name)
  }

  return (
    <DialogShell title={title} onClose={onClose}>
      <input
        className="dialog__input"
        value={value}
        autoFocus
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') onClose()
        }}
        data-testid="variant-name-input"
        aria-label={ariaLabel}
      />
      <div className="dialog__actions">
        <button type="button" className="dialog__button" onClick={onClose} data-testid="variant-dialog-cancel">
          取消
        </button>
        <button
          type="button"
          className="dialog__button dialog__button--primary"
          onClick={submit}
          disabled={!value.trim()}
          data-testid="variant-dialog-submit"
        >
          {submitLabel}
        </button>
      </div>
    </DialogShell>
  )
}

function DeleteVariantDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <DialogShell title="删除岗位版本" onClose={onClose}>
      <p className="dialog__text">
        确定删除岗位版本「{name}」？该版本及其所有设置将被移除，且无法撤销。主简历不受影响。
      </p>
      <div className="dialog__actions">
        <button type="button" className="dialog__button" onClick={onClose} data-testid="variant-delete-cancel">
          取消
        </button>
        <button
          type="button"
          className="dialog__button dialog__button--danger"
          onClick={onConfirm}
          data-testid="variant-delete-confirm"
        >
          删除
        </button>
      </div>
    </DialogShell>
  )
}
