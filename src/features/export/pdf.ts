/**
 * PDF export is a browser-print concern: the preview and the PDF share one DOM
 * (see `PaginatedPreview`), and the only control the Web stage has over the
 * resulting file is `document.title` — the print dialog derives its default
 * filename from it. This module owns the one decision that needs to stay in one
 * place: what that filename is.
 */

/** The M1 master-resume filename suggested by the print dialog. */
export function suggestPdfFileName(name: string): string {
  const trimmed = name.trim()
  return trimmed === '' ? '简历.pdf' : `${trimmed}-简历.pdf`
}
