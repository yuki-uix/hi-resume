/**
 * The bundled CJK font the resume typography renders with. It is declared via
 * `@font-face` (see `main.tsx`) and referenced by `.resume-typography` in the
 * template CSS; pagination must not measure block heights until this font has
 * actually loaded, or the pages are cut against the fallback font's metrics and
 * silently drift once the real font swaps in (ARCHITECTURE.md, hard constraint
 * #2).
 */

export const RESUME_FONT_FAMILY = 'Source Han Sans SC'

/**
 * Resolve once the resume font is ready to be measured against.
 *
 * `document.fonts.ready` alone is not enough for a CJK font: it can resolve
 * before the browser has decided any of the resume text actually needs the font
 * (an `@font-face` is only triggered once a glyph is first painted in it). An
 * explicit `document.fonts.load` with a CJK sample forces the family to be
 * requested, and `document.fonts.ready` then waits for it. The resume text is
 * already in the measurer DOM when this runs, so any load still in flight is
 * covered by the same await.
 */
export async function awaitResumeFont(): Promise<void> {
  try {
    await document.fonts.load(`12.5px "${RESUME_FONT_FAMILY}"`, '工')
  } catch {
    // `document.fonts.load` rejects on an invalid/unavailable family; falling
    // through to `fonts.ready` below is the real gate either way.
  }
  await document.fonts.ready
}
