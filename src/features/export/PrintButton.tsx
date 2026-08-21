import { useEditorStore } from '../editor/editor-store-context'
import { suggestPdfFileName } from './pdf'

/**
 * The "导出 PDF" action. It does not generate anything itself — it points the
 * browser's own print pipeline at the paginated preview, whose `@media print`
 * rules already drop the editor chrome and lay each `.resume-page` out as one
 * PDF page.
 *
 * The one thing it controls is the suggested filename: the print dialog names
 * its file after `document.title`, so this sets the title to
 * `suggestPdfFileName(basics.name)` right before printing and restores it on
 * `afterprint`. That is the whole extent of Web-stage filename control; the
 * user can still rename the file in the system dialog.
 */
export function PrintButton() {
  const store = useEditorStore()
  const name = store((state) => state.workspace.pool.basics.name)

  const handlePrint = () => {
    const previousTitle = document.title
    const restoreTitle = () => {
      document.title = previousTitle
    }
    document.title = suggestPdfFileName(name)
    // `window.print()` blocks until the dialog closes, then `afterprint` fires.
    // The listener is registered before the call so it is already in place when
    // the dialog closes; `{ once: true }` keeps repeated prints from stacking
    // stale restorers.
    window.addEventListener('afterprint', restoreTitle, { once: true })
    window.print()
  }

  return (
    <button type="button" className="print-button" data-testid="export-pdf" onClick={handlePrint}>
      导出 PDF
    </button>
  )
}
