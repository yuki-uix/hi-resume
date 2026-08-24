/**
 * The per-field inheritance indicator for text overrides on a variant. A small
 * grey dot means "inherited" (no override on this field); a filled accent dot
 * means "this variant rewrote it", and clicking it restores inheritance by
 * clearing the override.
 *
 * Deliberately a visual element, not a text label — the middle column is dense,
 * and a sentence next to every bullet would bury it. The `title` tooltip and
 * `aria-label` carry the words for hover and screen readers without adding a
 * persistent label. `data-overridden` is the hook the e2e suite reads.
 */
export function OverrideDot({
  overridden,
  onRestore,
  restoreLabel,
}: {
  overridden: boolean
  onRestore: () => void
  /** Screen-reader name for the restore action, e.g. "恢复「…」的标题继承". */
  restoreLabel: string
}) {
  if (!overridden) {
    return (
      <span
        className="override-dot override-dot--inherited"
        data-overridden="false"
        title="继承中"
        aria-label="继承中"
      />
    )
  }

  return (
    <button
      type="button"
      className="override-dot override-dot--overridden"
      data-overridden="true"
      data-testid="restore-override"
      title="本版本已改写，点击恢复继承"
      aria-label={restoreLabel}
      onClick={onRestore}
    />
  )
}
